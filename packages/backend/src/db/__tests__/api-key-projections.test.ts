import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDatabase,
  getCurrentDialect,
  getDatabase,
  getSchema,
  initializeDatabase,
} from '../client';
import { runMigrations } from '../migrate';
import { ConfigRepository } from '../config-repository';
import { logger } from '../../utils/logger';
import { encrypt, hashSecret, resetEncryptionKeyCache } from '../../utils/encryption';
import { registerSpy } from '../../../test/test-utils';

const GOOD_ENCRYPTION_KEY = 'a'.repeat(64);
const WRONG_ENCRYPTION_KEY = 'b'.repeat(64);

const overridePolicy = {
  mode: 'override' as const,
  reason: 'policy test',
  policy: {
    lookbackMinutes: 2_880,
    exclusionGapMinutes: 20,
    windowMinutes: 5,
    sustainedWindows: 4,
    minimumRequestsPerMinute: 75,
    baselineMultiplier: 12,
    minimumBaselineRequests: 200,
    minimumActiveMinutes: 480,
  },
};

function setEncryptionKey(key: string | undefined): void {
  if (key === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = key;
  resetEncryptionKeyCache();
}

function databaseJson(value: unknown): string | unknown {
  return getCurrentDialect() === 'postgres' ? value : JSON.stringify(value);
}

describe('API key projections', () => {
  let db: ReturnType<typeof getDatabase>;
  let schema: ReturnType<typeof getSchema>;
  let repository: ConfigRepository;

  beforeEach(async () => {
    await closeDatabase();
    setEncryptionKey(undefined);
    process.env.DATABASE_URL = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
    initializeDatabase(process.env.DATABASE_URL);
    await runMigrations();
    db = getDatabase();
    schema = getSchema();
    repository = new ConfigRepository();
    await db.delete(schema.apiKeySecurityEvents);
    await db.delete(schema.apiKeyRequestBuckets);
    await db.delete(schema.apiKeys);
  });

  afterEach(async () => {
    setEncryptionKey(undefined);
    await closeDatabase();
  });

  it('returns an eight-character fingerprint and omits the secret from public keys', async () => {
    // Given
    const secret = 'sk-normal-projection';
    await db.insert(schema.apiKeys).values({
      name: 'normal-key',
      secret,
      secretHash: hashSecret(secret),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // When
    const keys = await repository.getAllPublicKeyProjections();

    // Then
    expect(keys['normal-key']?.fingerprint).toBe(hashSecret(secret).slice(0, 8));
    expect('secret' in (keys['normal-key'] ?? {})).toBe(false);
  });

  it('backfills a legacy NULL hash and keeps the fingerprint stable on later reads', async () => {
    // Given
    const secret = 'sk-legacy-null-hash';
    await db.insert(schema.apiKeys).values({
      name: 'legacy-null-hash',
      secret,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // When
    const firstRead = await repository.getAllKeys();
    const storedAfterBackfill = await db.select().from(schema.apiKeys);
    const secondRead = await repository.getAllKeys();

    // Then
    const expectedFingerprint = hashSecret(secret).slice(0, 8);
    expect(firstRead['legacy-null-hash']?.fingerprint).toBe(expectedFingerprint);
    expect(storedAfterBackfill[0]?.secretHash).toBe(hashSecret(secret));
    expect(secondRead['legacy-null-hash']?.fingerprint).toBe(expectedFingerprint);
  });

  it('returns unavailable and logs no secret or decryption detail for unreadable legacy secrets', async () => {
    // Given
    const secret = 'sk-unreadable-legacy-secret';
    setEncryptionKey(GOOD_ENCRYPTION_KEY);
    const ciphertext = encrypt(secret);
    setEncryptionKey(WRONG_ENCRYPTION_KEY);
    await db.insert(schema.apiKeys).values({
      name: 'unreadable-key',
      secret: ciphertext,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const warningSpy = registerSpy(logger, 'warn');

    // When
    const keys = await repository.getAllKeys();

    // Then
    expect(keys['unreadable-key']?.fingerprint).toBe('unavailable');
    expect(warningSpy).toHaveBeenCalledWith('API key fingerprint unavailable', {
      keyId: expect.any(Number),
      reason: 'secret_decryption_failed',
    });
    expect(JSON.stringify(keys['unreadable-key'])).not.toContain(secret);
    const logs = JSON.stringify(warningSpy.mock.calls);
    expect(logs).not.toContain(secret);
    expect(logs).not.toContain(ciphertext);
    expect(logs).not.toContain('ENCRYPTION_KEY');
  });

  it('returns the stored secret only through explicit internal resolution', async () => {
    // Given
    const secret = 'sk-internal-resolution';
    await repository.saveKey('internal-key', { secret });

    // When
    const publicKeys = await repository.getAllKeys();
    const resolved = await repository.resolveKeyBySecret(secret);

    // Then
    expect('secret' in (publicKeys['internal-key'] ?? {})).toBe(false);
    expect(resolved?.name).toBe('internal-key');
    expect(resolved?.config.secret).toBe(secret);
  });

  it('round-trips pause fields and the complete per-key anomaly policy', async () => {
    // Given
    const secret = 'sk-policy-round-trip';
    await repository.saveKey('policy-key', {
      secret,
      pausedAt: 1_750_000_000_000,
      pauseSource: 'automatic',
      pauseReason: 'sustained anomaly',
      anomalyPolicy: overridePolicy,
    });

    // When
    const publicKey = (await repository.getAllKeys())['policy-key'];
    const resolved = await repository.getKeyBySecret(secret);

    // Then
    expect(publicKey).toMatchObject({
      pausedAt: 1_750_000_000_000,
      pauseSource: 'automatic',
      pauseReason: 'sustained anomaly',
      anomalyPolicy: overridePolicy,
    });
    expect(resolved?.config).toMatchObject({
      pausedAt: 1_750_000_000_000,
      pauseSource: 'automatic',
      pauseReason: 'sustained anomaly',
      anomalyPolicy: overridePolicy,
    });
  });

  it('preserves expiry, disabled state, pause state, and policy during metadata edits', async () => {
    // Given
    const originalSecret = 'sk-metadata-original';
    const expiresAt = 1_750_000_100_000;
    const disabledAt = 1_750_000_050_000;
    await db.insert(schema.apiKeys).values({
      name: 'metadata-key',
      secret: originalSecret,
      secretHash: hashSecret(originalSecret),
      expiresAt,
      disabledAt,
      pausedAt: 1_750_000_025_000,
      pauseSource: 'manual',
      pauseReason: 'operator review',
      anomalyPolicy: databaseJson(overridePolicy),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // When
    await repository.saveKey('metadata-key', {
      secret: originalSecret,
      comment: 'metadata changed',
    });
    const row = (await db.select().from(schema.apiKeys))[0];

    // Then
    expect(row).toMatchObject({
      expiresAt,
      disabledAt,
      pausedAt: 1_750_000_025_000,
      pauseSource: 'manual',
      pauseReason: 'operator review',
    });
    expect(row?.anomalyPolicy).toEqual(
      getCurrentDialect() === 'postgres' ? overridePolicy : JSON.stringify(overridePolicy)
    );
  });

  it('preserves pause state and policy while rotating the secret', async () => {
    // Given
    const oldSecret = 'sk-rotation-old';
    const newSecret = 'sk-rotation-new';
    await repository.saveKey('rotation-key', {
      secret: oldSecret,
      pausedAt: 1_750_000_030_000,
      pauseSource: 'automatic',
      pauseReason: 'rate anomaly',
      anomalyPolicy: overridePolicy,
    });

    // When
    await repository.saveKey('rotation-key', { secret: newSecret });
    const resolved = await repository.getKeyBySecret(newSecret);

    // Then
    expect(resolved?.config.secret).toBe(newSecret);
    expect(resolved?.config).toMatchObject({
      pausedAt: 1_750_000_030_000,
      pauseSource: 'automatic',
      pauseReason: 'rate anomaly',
      anomalyPolicy: overridePolicy,
    });
    expect(await repository.getKeyBySecret(oldSecret)).toBeNull();
  });

  it('preserves legacy quota fallback, modern quotas, raw passthrough, and IP policy', async () => {
    // Given
    const legacySecret = 'sk-quota-legacy';
    const modernSecret = 'sk-quota-modern';
    await db.insert(schema.apiKeys).values({
      name: 'legacy-quota-key',
      secret: legacySecret,
      secretHash: hashSecret(legacySecret),
      quotaName: 'legacy-quota',
      allowRawPassthrough: true,
      allowedIps: JSON.stringify(['10.0.0.0/8']),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await db.insert(schema.apiKeys).values({
      name: 'modern-quota-key',
      secret: modernSecret,
      secretHash: hashSecret(modernSecret),
      quotaName: 'stale-quota',
      quotaNames: JSON.stringify(['quota-a', 'quota-b']),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // When
    const publicKeys = await repository.getAllKeys();
    const resolved = await repository.getKeyBySecret(legacySecret);

    // Then
    expect(publicKeys['legacy-quota-key']).toMatchObject({
      quotas: ['legacy-quota'],
      allowRawPassthrough: true,
      allowedIps: ['10.0.0.0/8'],
    });
    expect(publicKeys['modern-quota-key']?.quotas).toEqual(['quota-a', 'quota-b']);
    expect(resolved?.config.quotas).toEqual(['legacy-quota']);
  });

  it('exposes secret-bearing backup output only through the explicit backup projection', async () => {
    // Given
    const secret = 'sk-backup-only';
    await repository.saveKey('backup-key', {
      secret,
      pausedAt: 1_750_000_040_000,
      pauseSource: 'manual',
      pauseReason: 'backup test',
      anomalyPolicy: overridePolicy,
    });

    // When
    const publicKeys = await repository.getAllKeys();
    const backups = await repository.getAllKeysForBackup();

    // Then
    expect('secret' in (publicKeys['backup-key'] ?? {})).toBe(false);
    expect(backups['backup-key']).toMatchObject({
      secret,
      pausedAt: 1_750_000_040_000,
      anomalyPolicy: overridePolicy,
    });
  });
});

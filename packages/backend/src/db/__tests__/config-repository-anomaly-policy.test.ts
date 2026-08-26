import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, getSchema, initializeDatabase } from '../client';
import { runMigrations } from '../migrate';
import { ConfigRepository } from '../config-repository';
import {
  DEFAULT_ANOMALY_THRESHOLD_POLICY,
  type GlobalAnomalyPolicy,
  type PerKeyAnomalyPolicy,
} from '../../services/api-key-security/policy-schema';

describe('ConfigRepository anomaly policy persistence', () => {
  let db: ReturnType<typeof getDatabase>;
  let schema: ReturnType<typeof getSchema>;
  let repository: ConfigRepository;

  beforeEach(async () => {
    await closeDatabase();
    const databaseUrl = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('Test database URL is required');
    initializeDatabase(databaseUrl);
    await runMigrations();
    db = getDatabase();
    schema = getSchema();
    repository = new ConfigRepository();
    await db.delete(schema.apiKeys);
    await db.delete(schema.systemSettings);
  });

  afterEach(async () => {
    await closeDatabase();
  });

  it('defaults a missing global policy to disabled with effective thresholds', async () => {
    // Given
    // No global anomaly-policy system setting exists.

    // When
    const policy = await repository.getGlobalAnomalyPolicy();

    // Then
    expect(policy).toEqual({ mode: 'disabled', ...DEFAULT_ANOMALY_THRESHOLD_POLICY });
  });

  it('round-trips global and complete per-key policies', async () => {
    // Given
    const globalPolicy: GlobalAnomalyPolicy = {
      mode: 'observe',
      ...DEFAULT_ANOMALY_THRESHOLD_POLICY,
    };
    const keyPolicy: PerKeyAnomalyPolicy = {
      mode: 'override',
      reason: 'trusted integration',
      policy: {
        ...DEFAULT_ANOMALY_THRESHOLD_POLICY,
        lookbackMinutes: 720,
        minimumActiveMinutes: 120,
      },
    };
    await repository.saveGlobalAnomalyPolicy(globalPolicy);
    await repository.saveKey('demo-key', { secret: 'sk-demo' });

    // When
    const saved = await repository.saveKeyAnomalyPolicy('demo-key', keyPolicy);
    const loadedGlobal = await repository.getGlobalAnomalyPolicy();
    const loadedKey = await repository.getKeyAnomalyPolicy('demo-key');

    // Then
    expect(saved).toBe(true);
    expect(loadedGlobal).toEqual(globalPolicy);
    expect(loadedKey).toEqual(keyPolicy);
  });

  it('clears a per-key policy when inherit is saved', async () => {
    // Given
    await repository.saveKey('demo-key', { secret: 'sk-demo' });
    const override: PerKeyAnomalyPolicy = {
      mode: 'disabled',
      reason: 'temporary exemption',
    };
    await repository.saveKeyAnomalyPolicy('demo-key', override);

    // When
    const saved = await repository.saveKeyAnomalyPolicy('demo-key', { mode: 'inherit' });

    // Then
    expect(saved).toBe(true);
    expect(await repository.getKeyAnomalyPolicy('demo-key')).toEqual({ mode: 'inherit' });
  });
});

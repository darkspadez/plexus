import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, getSchema, initializeDatabase } from '../../../db/client';
import { ConfigRepository } from '../../../db/config-repository';
import { runMigrations } from '../../../db/migrate';
import { ConfigService } from '../../configuration/config-service';
import { BackupService } from '../../configuration/backup-service';
import { ApiKeyPauseService, type ApiKeySecurityEvent } from '../api-key-pause-service';

describe('ApiKeyPauseService database lifecycle', () => {
  let db: ReturnType<typeof getDatabase>;
  let schema: ReturnType<typeof getSchema>;

  beforeEach(async () => {
    await closeDatabase();
    process.env.DATABASE_URL = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
    initializeDatabase(process.env.DATABASE_URL);
    await runMigrations();
    db = getDatabase();
    schema = getSchema();
    await db.delete(schema.apiKeySecurityEvents);
    await db.delete(schema.apiKeyRequestBuckets);
    await db.delete(schema.apiKeys);
  });

  afterEach(async () => {
    await closeDatabase();
  });

  async function insertKey(
    name: string,
    values: {
      readonly pausedAt?: number | null;
      readonly disabledAt?: number | null;
      readonly expiresAt?: number | null;
    } = {}
  ): Promise<number> {
    const timestamp = Date.now();
    const rows = await db
      .insert(schema.apiKeys)
      .values({
        name,
        secret: `sk-${name}`,
        secretHash: `hash-${name}`,
        pausedAt: values.pausedAt ?? null,
        disabledAt: values.disabledAt ?? null,
        expiresAt: values.expiresAt ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning({ id: schema.apiKeys.id });
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('fixture key was not inserted');
    return id;
  }

  async function eventsFor(name: string): Promise<readonly ApiKeySecurityEvent[]> {
    return new ApiKeyPauseService().getEvents(name, 100, 0);
  }

  it('allows exactly one concurrent pause transition and event', async () => {
    // Given
    await insertKey('concurrent-key');
    const first = new ApiKeyPauseService();
    const second = new ApiKeyPauseService();

    // When
    const results = await Promise.all([
      first.pauseKey('concurrent-key', 'manual', 'incident review', 'admin-a'),
      second.pauseKey('concurrent-key', 'manual', 'incident review', 'admin-b'),
    ]);

    // Then
    expect(results.filter((result) => result === 'paused')).toHaveLength(1);
    expect(results.filter((result) => result === 'already_paused')).toHaveLength(1);
    expect(
      (await eventsFor('concurrent-key')).filter((event) => event.eventKind === 'manual_pause')
    ).toHaveLength(1);
  });

  it('refuses a disabled or expired key without inserting a pause event', async () => {
    // Given
    await insertKey('disabled-key', { disabledAt: Date.now() });
    await insertKey('expired-key', { expiresAt: Date.now() - 1 });
    const service = new ApiKeyPauseService();

    // When
    const disabled = await service.pauseKey('disabled-key', 'manual', 'review');
    const expired = await service.pauseKey('expired-key', 'automatic', 'review');

    // Then
    expect(disabled).toBe('disabled');
    expect(expired).toBe('disabled');
    expect(await eventsFor('disabled-key')).toEqual([]);
    expect(await eventsFor('expired-key')).toEqual([]);
  });

  it('rejects empty resume credentials without mutation', async () => {
    // Given
    await insertKey('validation-key', { pausedAt: Date.now() });
    const service = new ApiKeyPauseService();

    // When / Then
    await expect(service.resumeKey('validation-key', '', '')).rejects.toThrow();
    expect(await eventsFor('validation-key')).toEqual([]);
  });

  it('refuses a disabled resume without changing state or history', async () => {
    // Given
    const pausedAt = Date.now();
    await insertKey('disabled-resume-key', { pausedAt, disabledAt: Date.now() });
    const service = new ApiKeyPauseService();

    // When
    const result = await service.resumeKey('disabled-resume-key', 'admin-1', 'review');

    // Then
    expect(result).toBe('disabled');
    expect(await eventsFor('disabled-resume-key')).toEqual([]);
    const rows = await db.select().from(schema.apiKeys);
    expect(
      rows.find(
        (row: { readonly name: string; readonly pausedAt: number | null }) =>
          row.name === 'disabled-resume-key'
      )?.pausedAt
    ).toBe(pausedAt);
  });

  it('returns not_paused when an active key has no current pause', async () => {
    // Given
    await insertKey('active-key');

    // When
    const result = await new ApiKeyPauseService().resumeKey('active-key', 'admin-1', 'review');

    // Then
    expect(result).toBe('not_paused');
    expect(await eventsFor('active-key')).toEqual([]);
  });

  it('returns not_found for a missing resume target without history', async () => {
    // Given
    const service = new ApiKeyPauseService();

    // When
    const result = await service.resumeKey('missing-key', 'admin-1', 'review');

    // Then
    expect(result).toBe('not_found');
    expect(await eventsFor('missing-key')).toEqual([]);
  });

  it('resumes a paused key and stores structured admin evidence', async () => {
    // Given
    await insertKey('resume-key', { pausedAt: Date.now() });

    // When
    const result = await new ApiKeyPauseService().resumeKey('resume-key', 'admin-1', 'review');

    // Then
    expect(result).toBe('resumed');
    const rows = await db.select().from(schema.apiKeys);
    expect(rows.find((row: { readonly name: string }) => row.name === 'resume-key')).toMatchObject({
      pausedAt: null,
      pauseSource: null,
      pauseReason: null,
    });
    const events = await eventsFor('resume-key');
    expect(events[0]).toMatchObject({
      eventKind: 'resume',
      actor: 'admin-1',
      reason: 'review',
      evidence: { callerId: 'admin-1', source: 'admin' },
    });
  });

  it('records automatic pause evidence as JSON', async () => {
    // Given
    await insertKey('automatic-key');
    const evidence = { result: 'would_pause', thresholdRpm: 50, currentRates: [50, 50, 50] };

    // When
    const result = await new ApiKeyPauseService().recordAutomaticPause(
      'automatic-key',
      evidence,
      'sustained anomaly'
    );

    // Then
    expect(result).toBe('paused');
    expect(await eventsFor('automatic-key')).toMatchObject([
      { eventKind: 'auto_pause', reason: 'sustained anomaly', evidence },
    ]);
  });

  it('orders and paginates events by createdAt descending', async () => {
    // Given
    const apiKeyId = await insertKey('history-key');
    await db.insert(schema.apiKeySecurityEvents).values([
      { apiKeyId, keyName: 'history-key', eventKind: 'resume', source: 'admin', createdAt: 100 },
      {
        apiKeyId,
        keyName: 'history-key',
        eventKind: 'manual_pause',
        source: 'manual',
        createdAt: 300,
      },
      {
        apiKeyId,
        keyName: 'history-key',
        eventKind: 'auto_pause',
        source: 'automatic',
        createdAt: 200,
      },
    ]);

    // When
    const service = new ApiKeyPauseService();
    const firstPage = await service.getEvents('history-key', 2, 0);
    const secondPage = await service.getEvents('history-key', 2, 1);

    // Then
    expect(firstPage.map((event) => event.createdAt)).toEqual([300, 200]);
    expect(secondPage.map((event) => event.createdAt)).toEqual([200, 100]);
  });

  it('records one deletion snapshot through ConfigService while buckets cascade', async () => {
    // Given
    const apiKeyId = await insertKey('deleted-key');
    await db.insert(schema.apiKeyRequestBuckets).values({
      apiKeyId,
      bucketStartMs: 1_750_000_020_000,
      count: 4,
    });

    // When
    const configService = new ConfigService(new ConfigRepository());
    await configService.deleteKey('deleted-key', 'admin', 'deleted via management API');
    await configService.deleteKey('deleted-key', 'admin', 'deleted via management API');

    // Then
    expect(
      (await db.select().from(schema.apiKeys)).find(
        (row: { readonly name: string }) => row.name === 'deleted-key'
      )
    ).toBeUndefined();
    expect(await db.select().from(schema.apiKeyRequestBuckets)).toEqual([]);
    const events = await eventsFor('deleted-key');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      apiKeyId: null,
      keyName: 'deleted-key',
      eventKind: 'key_deleted',
      source: 'admin',
      actor: 'admin',
      reason: 'deleted via management API',
      evidence: { deletedKeyId: apiKeyId },
    });
  });

  it('records a snapshot without mutating its live key', async () => {
    // Given
    const apiKeyId = await insertKey('snapshot-only-key');

    // When
    const recorded = await new ApiKeyPauseService().recordDeletionSnapshot(
      'snapshot-only-key',
      'admin-1',
      'audit only'
    );

    // Then
    expect(recorded).toBe(true);
    const [key] = await db
      .select({ id: schema.apiKeys.id, name: schema.apiKeys.name })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.id, apiKeyId));
    expect(key).toEqual({ id: apiKeyId, name: 'snapshot-only-key' });
    expect(await eventsFor('snapshot-only-key')).toMatchObject([
      {
        apiKeyId,
        eventKind: 'key_deleted',
        actor: 'admin-1',
        reason: 'audit only',
      },
    ]);
  });

  it('allows one concurrent ConfigService deletion to claim the snapshot', async () => {
    // Given
    const apiKeyId = await insertKey('concurrent-deletion-key');
    await db.insert(schema.apiKeyRequestBuckets).values({
      apiKeyId,
      bucketStartMs: 1_750_000_020_000,
      count: 4,
    });
    const contenders = [
      {
        service: new ConfigService(new ConfigRepository()),
        actor: 'admin-a',
        reason: 'first deletion',
      },
      {
        service: new ConfigService(new ConfigRepository()),
        actor: 'admin-b',
        reason: 'second deletion',
      },
    ];

    // When
    const results = await Promise.all(
      contenders.map(({ service, actor, reason }) =>
        service.deleteKey('concurrent-deletion-key', actor, reason)
      )
    );

    // Then
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => !result)).toHaveLength(1);
    expect(await db.select().from(schema.apiKeyRequestBuckets)).toEqual([]);
    const events = await eventsFor('concurrent-deletion-key');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      apiKeyId: null,
      keyName: 'concurrent-deletion-key',
      eventKind: 'key_deleted',
      source: 'admin',
      evidence: { deletedKeyId: apiKeyId },
    });
    const winner = contenders.find((_, index) => results[index]);
    expect(events[0]?.actor === winner?.actor && events[0]?.reason === winner?.reason).toBe(true);
  });

  it('round trips paused security state and events without restoring activity buckets', async () => {
    // Given
    const apiKeyId = await insertKey('backup-paused-key');
    await db.insert(schema.apiKeyRequestBuckets).values({
      apiKeyId,
      bucketStartMs: 1_750_000_020_000,
      count: 4,
    });
    await new ApiKeyPauseService().pauseKey(
      'backup-paused-key',
      'manual',
      'backup review',
      'admin'
    );
    const backupService = new BackupService();

    // When
    const backup = await backupService.exportConfigBackup();
    await backupService.restoreConfigBackup(backup);

    // Then
    const [restoredKey] = await db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.name, 'backup-paused-key'));
    expect(restoredKey?.pausedAt).not.toBeNull();
    expect(await new ApiKeyPauseService().getEvents('backup-paused-key')).toHaveLength(1);
    expect(await db.select().from(schema.apiKeyRequestBuckets)).toEqual([]);
    expect(backup.data.keys['backup-paused-key']).toMatchObject({ pausedAt: expect.any(Number) });
    expect(backup.data.api_key_security_events).toHaveLength(1);
  });

  it('restores paused security state and history from a full archive', async () => {
    // Given
    await insertKey('full-backup-paused-key');
    await new ApiKeyPauseService().pauseKey(
      'full-backup-paused-key',
      'manual',
      'full backup review',
      'admin'
    );
    const backupService = new BackupService();

    // When
    const archive = await backupService.exportFullBackup();
    await backupService.restoreFullBackup(archive);

    // Then
    const [restoredKey] = await db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.name, 'full-backup-paused-key'));
    expect(restoredKey?.pausedAt).not.toBeNull();
    expect(await new ApiKeyPauseService().getEvents('full-backup-paused-key')).toHaveLength(1);
  });
});

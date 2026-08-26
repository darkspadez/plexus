import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, getSchema, initializeDatabase } from '../../../db/client';
import { ConfigRepository } from '../../../db/config-repository';
import { runMigrations } from '../../../db/migrate';
import { AnomalyEvaluationScheduler } from '../anomaly-evaluation-scheduler';
import { DatabaseAnomalyEvaluationStore } from '../anomaly-evaluation-store';
import { ApiKeyPauseService } from '../api-key-pause-service';
import type { GlobalAnomalyPolicy } from '../policy-schema';

const MINUTE_MS = 60_000;

const policy: GlobalAnomalyPolicy = {
  mode: 'observe',
  lookbackMinutes: 5,
  exclusionGapMinutes: 1,
  windowMinutes: 1,
  sustainedWindows: 1,
  minimumRequestsPerMinute: 2,
  baselineMultiplier: 1,
  minimumBaselineRequests: 5,
  minimumActiveMinutes: 5,
};

describe('AnomalyEvaluationScheduler database integration', () => {
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

  it('reconstructs a trigger from persisted buckets and retains the cutoff boundary', async () => {
    // Given
    const keyRows = await db
      .insert(schema.apiKeys)
      .values({
        name: 'persisted-anomaly',
        secret: 'sk-persisted-anomaly',
        secretHash: 'hash-persisted-anomaly',
        createdAt: 1,
        updatedAt: 1,
      })
      .returning({ id: schema.apiKeys.id });
    const keyId = keyRows[0]?.id;
    if (keyId === undefined) throw new Error('fixture key was not inserted');
    await new ConfigRepository().saveGlobalAnomalyPolicy(policy);
    await db.insert(schema.apiKeyRequestBuckets).values([
      { apiKeyId: keyId, bucketStartMs: 0, count: 1 },
      { apiKeyId: keyId, bucketStartMs: 60_000, count: 1 },
      { apiKeyId: keyId, bucketStartMs: 120_000, count: 1 },
      { apiKeyId: keyId, bucketStartMs: 180_000, count: 1 },
      { apiKeyId: keyId, bucketStartMs: 240_000, count: 1 },
      { apiKeyId: keyId, bucketStartMs: 300_000, count: 1 },
      { apiKeyId: keyId, bucketStartMs: 360_000, count: 3 },
      { apiKeyId: keyId, bucketStartMs: 480_000 - 1_445 * MINUTE_MS, count: 1 },
      { apiKeyId: keyId, bucketStartMs: 480_000 - 1_445 * MINUTE_MS - MINUTE_MS, count: 1 },
    ]);
    const scheduler = new AnomalyEvaluationScheduler({ clock: () => 480_000 });
    const secondScheduler = new AnomalyEvaluationScheduler({ clock: () => 480_000 });

    // When
    await scheduler.evaluateNow();
    await secondScheduler.evaluateNow();

    // Then
    const events = await db
      .select()
      .from(schema.apiKeySecurityEvents)
      .where(eq(schema.apiKeySecurityEvents.keyName, 'persisted-anomaly'));
    expect(events).toMatchObject([{ eventKind: 'would_pause', source: 'automatic' }]);
    expect(events).toHaveLength(1);
    const buckets = await db.select().from(schema.apiKeyRequestBuckets);
    expect(
      buckets.map((bucket: { readonly bucketStartMs: number }) => bucket.bucketStartMs)
    ).toContain(480_000 - 1_445 * MINUTE_MS);
    expect(
      buckets.map((bucket: { readonly bucketStartMs: number }) => bucket.bucketStartMs)
    ).not.toContain(480_000 - 1_446 * MINUTE_MS);
  });

  it('creates one observe event when independent stores claim the same evaluation window concurrently', async () => {
    // Given
    const keyRows = await db
      .insert(schema.apiKeys)
      .values({
        name: 'concurrent-observe-anomaly',
        secret: 'sk-concurrent-observe-anomaly',
        secretHash: 'hash-concurrent-observe-anomaly',
        createdAt: 1,
        updatedAt: 1,
      })
      .returning({ id: schema.apiKeys.id });
    const keyId = keyRows[0]?.id;
    if (keyId === undefined) throw new Error('fixture key was not inserted');
    const key = {
      id: keyId,
      name: 'concurrent-observe-anomaly',
      policy: { mode: 'inherit' },
    } as const;
    const evidence = { evaluationEndMs: 420_000, baselineRpm: 1 } as const;
    const stores = Array.from({ length: 50 }, () => new DatabaseAnomalyEvaluationStore());

    // When
    await Promise.all(stores.map((store) => store.recordWouldPauseOnce(key, evidence)));

    // Then
    const events = await db
      .select({
        eventKind: schema.apiKeySecurityEvents.eventKind,
        evaluationWindowEndMs: schema.apiKeySecurityEvents.evaluationWindowEndMs,
        createdAt: schema.apiKeySecurityEvents.createdAt,
      })
      .from(schema.apiKeySecurityEvents)
      .where(eq(schema.apiKeySecurityEvents.keyName, key.name));
    expect(events).toEqual([
      { eventKind: 'would_pause', evaluationWindowEndMs: 420_000, createdAt: 420_000 },
    ]);
  });

  it('uses Task 7 CAS so two enforce schedulers pause once with detector evidence', async () => {
    // Given
    const keyRows = await db
      .insert(schema.apiKeys)
      .values({
        name: 'enforced-anomaly',
        secret: 'sk-enforced-anomaly',
        secretHash: 'hash-enforced-anomaly',
        createdAt: 1,
        updatedAt: 1,
      })
      .returning({ id: schema.apiKeys.id });
    const keyId = keyRows[0]?.id;
    if (keyId === undefined) throw new Error('fixture key was not inserted');
    await new ConfigRepository().saveGlobalAnomalyPolicy({ ...policy, mode: 'enforce' });
    await db.insert(schema.apiKeyRequestBuckets).values([
      { apiKeyId: keyId, bucketStartMs: 0, count: 1 },
      { apiKeyId: keyId, bucketStartMs: 60_000, count: 1 },
      { apiKeyId: keyId, bucketStartMs: 120_000, count: 1 },
      { apiKeyId: keyId, bucketStartMs: 180_000, count: 1 },
      { apiKeyId: keyId, bucketStartMs: 240_000, count: 1 },
      { apiKeyId: keyId, bucketStartMs: 300_000, count: 1 },
      { apiKeyId: keyId, bucketStartMs: 360_000, count: 3 },
    ]);
    const first = new AnomalyEvaluationScheduler({ clock: () => 480_000 });
    const second = new AnomalyEvaluationScheduler({ clock: () => 480_000 });

    // When
    await Promise.all([first.evaluateNow(), second.evaluateNow()]);

    // Then
    const key = await db
      .select({ pausedAt: schema.apiKeys.pausedAt })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.id, keyId));
    const events = await new ApiKeyPauseService({ clock: () => 480_000 }).getEvents(
      'enforced-anomaly'
    );
    expect(key[0]?.pausedAt).toBe(480_000);
    expect(events).toMatchObject([
      {
        eventKind: 'auto_pause',
        source: 'automatic',
        evidence: expect.objectContaining({ evaluationEndMs: 420_000 }),
      },
    ]);
    expect(events).toHaveLength(1);
  });
});

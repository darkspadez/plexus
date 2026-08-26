import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, getDatabase, getSchema, initializeDatabase } from '../../../db/client';
import { runMigrations } from '../../../db/migrate';
import { ApiKeyActivityRecorder, type ActivityBucketWriter } from '../activity-recorder';
import { writeActivityBuckets } from '../activity-recorder-storage';

const MINUTE_MS = 60_000;
let keySequence = 0;

type ActivityBucketRow = {
  readonly bucketStartMs: number;
  readonly count: number;
};

describe('API key activity recorder database integration', () => {
  let db: ReturnType<typeof getDatabase>;
  let schema: ReturnType<typeof getSchema>;

  beforeEach(async () => {
    await closeDatabase();
    process.env.DATABASE_URL = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
    initializeDatabase(process.env.DATABASE_URL);
    await runMigrations();
    db = getDatabase();
    schema = getSchema();
    await db.delete(schema.apiKeyRequestBuckets);
    await db.delete(schema.apiKeys);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await closeDatabase();
  });

  async function insertApiKey(): Promise<number> {
    keySequence += 1;
    const rows = await db
      .insert(schema.apiKeys)
      .values({
        name: `activity-recorder-${keySequence}`,
        secret: `sk-activity-recorder-${keySequence}`,
        createdAt: 1,
        updatedAt: 1,
      })
      .returning({ id: schema.apiKeys.id });
    const id = rows[0]?.id;
    if (id === undefined) {
      throw new Error('activity recorder test key was not inserted');
    }
    return id;
  }

  it('persists one exact coalesced total for 1,000 same-minute records', async () => {
    // Given
    vi.useFakeTimers({ now: 0 });
    const keyId = await insertApiKey();
    const recorder = new ApiKeyActivityRecorder();

    // When
    for (let index = 0; index < 1_000; index += 1) {
      recorder.recordSuccessfulAuth(keyId, 12_345);
    }
    await vi.advanceTimersByTimeAsync(1_000);

    // Then
    const rows = await db.select().from(schema.apiKeyRequestBuckets);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.apiKeyId).toBe(keyId);
    expect(rows[0]?.bucketStartMs).toBe(0);
    expect(rows[0]?.count).toBe(1_000);
    await recorder.stop();
  });

  it('adds totals from two recorder instances atomically instead of overwriting', async () => {
    // Given
    const keyId = await insertApiKey();
    const first = new ApiKeyActivityRecorder();
    const second = new ApiKeyActivityRecorder();

    // When
    for (let index = 0; index < 17; index += 1) {
      first.recordSuccessfulAuth(keyId, MINUTE_MS + 1);
    }
    for (let index = 0; index < 23; index += 1) {
      second.recordSuccessfulAuth(keyId, MINUTE_MS + 2);
    }
    await Promise.all([first.flush(), second.flush()]);

    // Then
    const rows = await db.select().from(schema.apiKeyRequestBuckets);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(40);
    await Promise.all([first.stop(), second.stop()]);
  });

  it('persists separate rows for timestamps on opposite sides of a minute boundary', async () => {
    // Given
    const keyId = await insertApiKey();
    const recorder = new ApiKeyActivityRecorder();

    // When
    recorder.recordSuccessfulAuth(keyId, MINUTE_MS - 1);
    recorder.recordSuccessfulAuth(keyId, MINUTE_MS);
    await recorder.flush();

    // Then
    const rows: readonly ActivityBucketRow[] = await db
      .select({
        bucketStartMs: schema.apiKeyRequestBuckets.bucketStartMs,
        count: schema.apiKeyRequestBuckets.count,
      })
      .from(schema.apiKeyRequestBuckets);
    expect(rows.map((row) => row.bucketStartMs).sort((a, b) => a - b)).toEqual([0, MINUTE_MS]);
    expect(rows.map((row) => row.count).sort((a, b) => a - b)).toEqual([1, 1]);
    await recorder.stop();
  });

  it('keeps failed database writes fail-open and persists the exact retry total', async () => {
    // Given
    const keyId = await insertApiKey();
    let shouldFail = true;
    const writer: ActivityBucketWriter = async (batch) => {
      if (shouldFail) {
        throw new Error('injected database failure');
      }
      await writeActivityBuckets(batch);
    };
    const recorder = new ApiKeyActivityRecorder({ writer });

    // When
    expect(() => recorder.recordSuccessfulAuth(keyId, 12_345)).not.toThrow();
    await recorder.flush();

    // Then
    expect(recorder.getPendingCount(keyId)).toBe(1);
    expect(recorder.droppedSampleCount).toBe(1);

    // When
    shouldFail = false;
    await recorder.flush();

    // Then
    const rows = await db.select().from(schema.apiKeyRequestBuckets);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(1);
    expect(recorder.getPendingCount(keyId)).toBe(0);
    await recorder.stop();
  });

  it('flushes pending activity during shutdown and reset clears the recorder', async () => {
    // Given
    const keyId = await insertApiKey();
    const recorder = new ApiKeyActivityRecorder();
    recorder.recordSuccessfulAuth(keyId, 12_345);

    // When
    await recorder.stop();

    // Then
    const rows = await db.select().from(schema.apiKeyRequestBuckets);
    expect(rows[0]?.count).toBe(1);

    // When
    recorder.resetForTesting();

    // Then
    expect(recorder.getPendingCount(keyId)).toBe(0);
    expect(recorder.droppedSampleCount).toBe(0);
  });

  it('does not create buckets for invalid unresolved key identifiers', async () => {
    // Given
    const recorder = new ApiKeyActivityRecorder();

    // When
    recorder.recordSuccessfulAuth(0, 12_345);
    recorder.recordSuccessfulAuth(-1, 12_345);
    recorder.recordSuccessfulAuth(Number.NaN, 12_345);
    await recorder.flush();

    // Then
    expect(await db.select().from(schema.apiKeyRequestBuckets)).toEqual([]);
    await recorder.stop();
  });
});

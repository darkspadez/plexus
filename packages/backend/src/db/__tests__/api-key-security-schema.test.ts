import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDatabase,
  getCurrentDialect,
  getDatabase,
  getSchema,
  initializeDatabase,
} from '../client';
import { runMigrations } from '../migrate';

describe('API key security schema', () => {
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

  async function insertPausedApiKey(): Promise<number> {
    const anomalyPolicy =
      getCurrentDialect() === 'postgres'
        ? { mode: 'disabled', reason: 'schema test' }
        : JSON.stringify({ mode: 'disabled', reason: 'schema test' });
    const rows = await db
      .insert(schema.apiKeys)
      .values({
        name: 'security-schema-key',
        secret: 'sk-security-schema',
        secretHash: 'security-schema-hash',
        pausedAt: 1_750_000_000_000,
        pauseSource: 'automatic',
        pauseReason: 'sustained request anomaly',
        anomalyPolicy,
        createdAt: 1_749_999_000_000,
        updatedAt: 1_750_000_000_000,
      })
      .returning({ id: schema.apiKeys.id });

    const id = rows[0]?.id;
    expect(id).toBeTypeOf('number');
    return id;
  }

  it('persists nullable pause state and a dialect-appropriate anomaly policy', async () => {
    // Given
    const apiKeyId = await insertPausedApiKey();

    // When
    const rows = await db.select().from(schema.apiKeys);

    // Then
    const row = rows[0];
    expect(row?.id).toBe(apiKeyId);
    expect(row).toMatchObject({
      pausedAt: 1_750_000_000_000,
      pauseSource: 'automatic',
      pauseReason: 'sustained request anomaly',
    });
    expect(
      getCurrentDialect() === 'postgres' ? row?.anomalyPolicy : JSON.parse(row?.anomalyPolicy)
    ).toEqual({ mode: 'disabled', reason: 'schema test' });
  });

  it('rejects a duplicate minute bucket', async () => {
    // Given
    const apiKeyId = await insertPausedApiKey();
    await db.insert(schema.apiKeyRequestBuckets).values({
      apiKeyId,
      bucketStartMs: 1_750_000_020_000,
      count: 1,
    });

    // When / Then
    await expect(
      db.insert(schema.apiKeyRequestBuckets).values({
        apiKeyId,
        bucketStartMs: 1_750_000_020_000,
        count: 2,
      })
    ).rejects.toThrow();
  });

  it('rejects a negative bucket count', async () => {
    // Given
    const apiKeyId = await insertPausedApiKey();

    // When / Then
    await expect(
      db.insert(schema.apiKeyRequestBuckets).values({
        apiKeyId,
        bucketStartMs: 1_750_000_080_000,
        count: -1,
      })
    ).rejects.toThrow();
  });

  it('cascades buckets and preserves immutable event identity when a key is deleted', async () => {
    // Given
    const apiKeyId = await insertPausedApiKey();
    await db.insert(schema.apiKeyRequestBuckets).values({
      apiKeyId,
      bucketStartMs: 1_750_000_020_000,
      count: 4,
    });
    await db.insert(schema.apiKeySecurityEvents).values({
      apiKeyId,
      keyName: 'security-schema-key',
      eventKind: 'auto_pause',
      source: 'system',
      reason: 'sustained request anomaly',
      evidence:
        getCurrentDialect() === 'postgres'
          ? { thresholdRpm: 50 }
          : JSON.stringify({ thresholdRpm: 50 }),
      createdAt: 1_750_000_000_000,
    });

    // When
    await db.delete(schema.apiKeys);

    // Then
    expect(await db.select().from(schema.apiKeyRequestBuckets)).toEqual([]);
    expect(await db.select().from(schema.apiKeySecurityEvents)).toMatchObject([
      {
        apiKeyId: null,
        keyName: 'security-schema-key',
        eventKind: 'auto_pause',
      },
    ]);
  });

  it('rejects a bucket for an unknown API key', async () => {
    // Given
    const missingApiKeyId = 2_147_483_647;

    // When / Then
    await expect(
      db.insert(schema.apiKeyRequestBuckets).values({
        apiKeyId: missingApiKeyId,
        bucketStartMs: 1_750_000_020_000,
        count: 1,
      })
    ).rejects.toThrow();
  });
});

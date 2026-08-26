import { sql } from 'drizzle-orm';
import { getDatabase, getSchema } from '../../db/client';
import type { ActivityBucketDelta, ActivityBucketWriter } from './activity-recorder';

export const writeActivityBuckets: ActivityBucketWriter = async (buckets) => {
  if (buckets.length === 0) return;

  const db = getDatabase();
  const schema = getSchema();

  await db.transaction(async (tx: typeof db) => {
    for (const bucket of buckets) {
      await tx
        .insert(schema.apiKeyRequestBuckets)
        .values({
          apiKeyId: bucket.keyId,
          bucketStartMs: bucket.bucketStartMs,
          count: bucket.count,
        })
        .onConflictDoUpdate({
          target: [schema.apiKeyRequestBuckets.apiKeyId, schema.apiKeyRequestBuckets.bucketStartMs],
          set: {
            count: sql`${schema.apiKeyRequestBuckets.count} + ${bucket.count}`,
          },
        });
    }
  });
};

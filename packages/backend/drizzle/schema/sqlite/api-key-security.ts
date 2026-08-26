import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { apiKeys } from './api-keys';

export const apiKeyRequestBuckets = sqliteTable(
  'api_key_request_buckets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    apiKeyId: integer('api_key_id')
      .notNull()
      .references(() => apiKeys.id, { onDelete: 'cascade' }),
    bucketStartMs: integer('bucket_start_ms').notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [
    uniqueIndex('uq_api_key_request_buckets_key_bucket').on(table.apiKeyId, table.bucketStartMs),
    index('idx_api_key_request_buckets_bucket_start').on(table.bucketStartMs),
    check('chk_api_key_request_buckets_count_nonnegative', sql`${table.count} >= 0`),
  ]
);

export const apiKeySecurityEvents = sqliteTable(
  'api_key_security_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    apiKeyId: integer('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
    keyName: text('key_name').notNull(),
    eventKind: text('event_kind').notNull(),
    source: text('source').notNull(),
    actor: text('actor'),
    reason: text('reason'),
    evidence: text('evidence'),
    evaluationWindowEndMs: integer('evaluation_window_end_ms'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_api_key_security_events_would_pause_window').on(
      table.apiKeyId,
      table.eventKind,
      table.evaluationWindowEndMs
    ),
    index('idx_api_key_security_events_key_name_created_at').on(table.keyName, table.createdAt),
    index('idx_api_key_security_events_created_at').on(table.createdAt),
  ]
);

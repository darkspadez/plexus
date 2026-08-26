import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { apiKeys } from './api-keys';

export const apiKeyRequestBuckets = pgTable(
  'api_key_request_buckets',
  {
    id: serial('id').primaryKey(),
    apiKeyId: integer('api_key_id')
      .notNull()
      .references(() => apiKeys.id, { onDelete: 'cascade' }),
    bucketStartMs: bigint('bucket_start_ms', { mode: 'number' }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [
    uniqueIndex('uq_api_key_request_buckets_key_bucket').on(table.apiKeyId, table.bucketStartMs),
    index('idx_api_key_request_buckets_bucket_start').on(table.bucketStartMs),
    check('chk_api_key_request_buckets_count_nonnegative', sql`${table.count} >= 0`),
  ]
);

export const apiKeySecurityEvents = pgTable(
  'api_key_security_events',
  {
    id: serial('id').primaryKey(),
    apiKeyId: integer('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
    keyName: text('key_name').notNull(),
    eventKind: text('event_kind').notNull(),
    source: text('source').notNull(),
    actor: text('actor'),
    reason: text('reason'),
    evidence: jsonb('evidence'),
    evaluationWindowEndMs: bigint('evaluation_window_end_ms', { mode: 'number' }),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
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

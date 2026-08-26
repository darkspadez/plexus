import { describe, expect, it } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { getTableConfig as getPgTableConfig } from 'drizzle-orm/pg-core';
import { getTableConfig as getSqliteTableConfig } from 'drizzle-orm/sqlite-core';
import {
  apiKeyRequestBuckets as pgApiKeyRequestBuckets,
  apiKeySecurityEvents as pgApiKeySecurityEvents,
} from '../../../drizzle/schema/postgres/api-key-security';
import { apiKeys as pgApiKeys } from '../../../drizzle/schema/postgres/api-keys';
import {
  apiKeyRequestBuckets as sqliteApiKeyRequestBuckets,
  apiKeySecurityEvents as sqliteApiKeySecurityEvents,
} from '../../../drizzle/schema/sqlite/api-key-security';
import { apiKeys as sqliteApiKeys } from '../../../drizzle/schema/sqlite/api-keys';

describe('API key security schema parity', () => {
  it('declares equivalent logical fields and dialect-specific storage metadata', () => {
    // Given
    const sqliteBucketConfig = getSqliteTableConfig(sqliteApiKeyRequestBuckets);
    const pgBucketConfig = getPgTableConfig(pgApiKeyRequestBuckets);
    const sqliteEventConfig = getSqliteTableConfig(sqliteApiKeySecurityEvents);
    const pgEventConfig = getPgTableConfig(pgApiKeySecurityEvents);
    const sqliteApiKeyConfig = getSqliteTableConfig(sqliteApiKeys);
    const pgApiKeyConfig = getPgTableConfig(pgApiKeys);
    const sqliteBucketId = sqliteBucketConfig.columns.find((column) => column.name === 'id');
    const pgBucketId = pgBucketConfig.columns.find((column) => column.name === 'id');
    const sqliteBucketAutoIncrement =
      sqliteBucketId === undefined
        ? undefined
        : Reflect.get(sqliteBucketId, 'autoIncrement') === true;

    // When
    const sqliteBucketForeignKey = sqliteBucketConfig.foreignKeys[0];
    const pgBucketForeignKey = pgBucketConfig.foreignKeys[0];
    const sqliteEventForeignKey = sqliteEventConfig.foreignKeys[0];
    const pgEventForeignKey = pgEventConfig.foreignKeys[0];
    const sqliteBucketReference = sqliteBucketForeignKey?.reference();
    const pgBucketReference = pgBucketForeignKey?.reference();
    const sqliteEventReference = sqliteEventForeignKey?.reference();
    const pgEventReference = pgEventForeignKey?.reference();
    const sqliteShape = {
      bucketColumns: sqliteBucketConfig.columns.map((column) => column.name),
      bucketIndexes: sqliteBucketConfig.indexes.map((tableIndex) => ({
        name: tableIndex.config.name,
        unique: tableIndex.config.unique,
        columns: tableIndex.config.columns.map((column) => ('name' in column ? column.name : null)),
      })),
      bucketChecks: sqliteBucketConfig.checks.map((constraint) => constraint.name),
      bucketPrimaryKey: {
        name: sqliteBucketId?.name,
        primary: sqliteBucketId?.primary,
        hasDefault: sqliteBucketId?.hasDefault,
      },
      bucketForeignKey: {
        columns: sqliteBucketReference?.columns.map((column) => column.name),
        foreignColumns: sqliteBucketReference?.foreignColumns.map((column) => column.name),
        foreignTable: sqliteBucketReference
          ? getTableName(sqliteBucketReference.foreignTable)
          : undefined,
        sourceRequired: sqliteBucketReference
          ? sqliteBucketConfig.columns.find(
              (column) => column.name === sqliteBucketReference.columns[0]?.name
            )?.notNull
          : undefined,
        onDelete: sqliteBucketForeignKey?.onDelete,
      },
      eventColumns: sqliteEventConfig.columns.map((column) => ({
        name: column.name,
        notNull: column.notNull,
      })),
      eventIndexes: sqliteEventConfig.indexes.map((tableIndex) => ({
        name: tableIndex.config.name,
        unique: tableIndex.config.unique,
        columns: tableIndex.config.columns.map((column) => ('name' in column ? column.name : null)),
      })),
      eventForeignKey: {
        columns: sqliteEventReference?.columns.map((column) => column.name),
        foreignColumns: sqliteEventReference?.foreignColumns.map((column) => column.name),
        foreignTable: sqliteEventReference
          ? getTableName(sqliteEventReference.foreignTable)
          : undefined,
        sourceRequired: sqliteEventReference
          ? sqliteEventConfig.columns.find(
              (column) => column.name === sqliteEventReference.columns[0]?.name
            )?.notNull
          : undefined,
        onDelete: sqliteEventForeignKey?.onDelete,
      },
      pauseColumns: sqliteApiKeyConfig.columns
        .filter((column) =>
          ['paused_at', 'pause_source', 'pause_reason', 'anomaly_policy'].includes(column.name)
        )
        .map((column) => ({ name: column.name, notNull: column.notNull })),
    };
    const pgShape = {
      bucketColumns: pgBucketConfig.columns.map((column) => column.name),
      bucketIndexes: pgBucketConfig.indexes.map((tableIndex) => ({
        name: tableIndex.config.name,
        unique: tableIndex.config.unique,
        columns: tableIndex.config.columns.map((column) => ('name' in column ? column.name : null)),
      })),
      bucketChecks: pgBucketConfig.checks.map((constraint) => constraint.name),
      bucketPrimaryKey: {
        name: pgBucketId?.name,
        primary: pgBucketId?.primary,
        hasDefault: pgBucketId?.hasDefault,
      },
      bucketForeignKey: {
        columns: pgBucketReference?.columns.map((column) => column.name),
        foreignColumns: pgBucketReference?.foreignColumns.map((column) => column.name),
        foreignTable: pgBucketReference ? getTableName(pgBucketReference.foreignTable) : undefined,
        sourceRequired: pgBucketReference
          ? pgBucketConfig.columns.find(
              (column) => column.name === pgBucketReference.columns[0]?.name
            )?.notNull
          : undefined,
        onDelete: pgBucketForeignKey?.onDelete,
      },
      eventColumns: pgEventConfig.columns.map((column) => ({
        name: column.name,
        notNull: column.notNull,
      })),
      eventIndexes: pgEventConfig.indexes.map((tableIndex) => ({
        name: tableIndex.config.name,
        unique: tableIndex.config.unique,
        columns: tableIndex.config.columns.map((column) => ('name' in column ? column.name : null)),
      })),
      eventForeignKey: {
        columns: pgEventReference?.columns.map((column) => column.name),
        foreignColumns: pgEventReference?.foreignColumns.map((column) => column.name),
        foreignTable: pgEventReference ? getTableName(pgEventReference.foreignTable) : undefined,
        sourceRequired: pgEventReference
          ? pgEventConfig.columns.find(
              (column) => column.name === pgEventReference.columns[0]?.name
            )?.notNull
          : undefined,
        onDelete: pgEventForeignKey?.onDelete,
      },
      pauseColumns: pgApiKeyConfig.columns
        .filter((column) =>
          ['paused_at', 'pause_source', 'pause_reason', 'anomaly_policy'].includes(column.name)
        )
        .map((column) => ({ name: column.name, notNull: column.notNull })),
    };

    // Then
    expect(pgShape).toEqual(sqliteShape);
    expect(sqliteShape).toMatchObject({
      bucketColumns: ['id', 'api_key_id', 'bucket_start_ms', 'count'],
      bucketIndexes: [
        {
          name: 'uq_api_key_request_buckets_key_bucket',
          unique: true,
          columns: ['api_key_id', 'bucket_start_ms'],
        },
        {
          name: 'idx_api_key_request_buckets_bucket_start',
          unique: false,
          columns: ['bucket_start_ms'],
        },
      ],
      bucketChecks: ['chk_api_key_request_buckets_count_nonnegative'],
      bucketPrimaryKey: { name: 'id', primary: true, hasDefault: true },
      bucketForeignKey: {
        columns: ['api_key_id'],
        foreignColumns: ['id'],
        foreignTable: 'api_keys',
        sourceRequired: true,
        onDelete: 'cascade',
      },
      eventColumns: [
        { name: 'id', notNull: true },
        { name: 'api_key_id', notNull: false },
        { name: 'key_name', notNull: true },
        { name: 'event_kind', notNull: true },
        { name: 'source', notNull: true },
        { name: 'actor', notNull: false },
        { name: 'reason', notNull: false },
        { name: 'evidence', notNull: false },
        { name: 'evaluation_window_end_ms', notNull: false },
        { name: 'created_at', notNull: true },
      ],
      eventIndexes: [
        {
          name: 'uq_api_key_security_events_would_pause_window',
          unique: true,
          columns: ['api_key_id', 'event_kind', 'evaluation_window_end_ms'],
        },
        {
          name: 'idx_api_key_security_events_key_name_created_at',
          unique: false,
          columns: ['key_name', 'created_at'],
        },
        {
          name: 'idx_api_key_security_events_created_at',
          unique: false,
          columns: ['created_at'],
        },
      ],
      eventForeignKey: {
        columns: ['api_key_id'],
        foreignColumns: ['id'],
        foreignTable: 'api_keys',
        sourceRequired: false,
        onDelete: 'set null',
      },
      pauseColumns: [
        { name: 'paused_at', notNull: false },
        { name: 'pause_source', notNull: false },
        { name: 'pause_reason', notNull: false },
        { name: 'anomaly_policy', notNull: false },
      ],
    });
    expect(sqliteBucketId?.getSQLType()).toBe('integer');
    expect(sqliteBucketAutoIncrement).toBe(true);
    expect(pgBucketId?.getSQLType()).toBe('serial');
    expect(
      sqliteBucketConfig.columns.find((column) => column.name === 'api_key_id')?.getSQLType()
    ).toBe('integer');
    expect(
      pgBucketConfig.columns.find((column) => column.name === 'api_key_id')?.getSQLType()
    ).toBe('integer');
    expect(
      sqliteApiKeyConfig.columns
        .filter((column) =>
          ['paused_at', 'pause_source', 'pause_reason', 'anomaly_policy'].includes(column.name)
        )
        .map((column) => [column.name, column.getSQLType()])
    ).toEqual([
      ['paused_at', 'integer'],
      ['pause_source', 'text'],
      ['pause_reason', 'text'],
      ['anomaly_policy', 'text'],
    ]);
    expect(
      pgApiKeyConfig.columns
        .filter((column) =>
          ['paused_at', 'pause_source', 'pause_reason', 'anomaly_policy'].includes(column.name)
        )
        .map((column) => [column.name, column.getSQLType()])
    ).toEqual([
      ['paused_at', 'bigint'],
      ['pause_source', 'text'],
      ['pause_reason', 'text'],
      ['anomaly_policy', 'jsonb'],
    ]);
  });
});

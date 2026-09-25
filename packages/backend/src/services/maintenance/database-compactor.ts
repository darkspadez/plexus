import fs from 'node:fs';
import { sql } from 'drizzle-orm';
import type postgres from 'postgres';
import { getCurrentDialect, getDatabase, getSqliteDatabasePath } from '../../db/client';
import { logger } from '../../utils/logger';

export type DatabaseDialect = 'sqlite' | 'postgres';

export interface DatabaseSize {
  dialect: DatabaseDialect;
  /** SQLite: db + -wal + -shm file sizes. Postgres: pg_database_size(current_database()). */
  totalBytes: number;
  /** SQLite only: free pages (freelist_count * page_size) that VACUUM can return to the OS. */
  reclaimableBytes?: number;
}

export interface CompactionResult {
  dialect: DatabaseDialect;
  beforeBytes: number;
  afterBytes: number;
  reclaimedBytes: number;
  durationMs: number;
  /** True only when a Postgres VACUUM FULL ran; SQLite always reports false. */
  full: boolean;
}

export interface CompactionOptions {
  /** Postgres only: run VACUUM FULL (rewrites tables, takes exclusive locks). */
  full?: boolean;
}

/** Thrown when a compaction is requested while another one is still running. */
export class CompactionInProgressError extends Error {
  constructor() {
    super('Database compaction already in progress');
    this.name = 'CompactionInProgressError';
  }
}

/** Minimal surface of the bun:sqlite `Database` the compactor needs. */
interface SqliteClient {
  exec(statement: string): unknown;
  query(statement: string): { get(): unknown };
}

/** Minimal surface of a PGlite instance (used in dev/tests). */
interface PgliteClient {
  exec(statement: string): Promise<unknown>;
}

type PostgresClient = postgres.Sql | PgliteClient;

let compactionInProgress = false;

export function isCompactionInProgress(): boolean {
  return compactionInProgress;
}

function rawClient(): unknown {
  return (getDatabase() as { $client: unknown }).$client;
}

function isPostgresJsClient(client: PostgresClient): client is postgres.Sql {
  return typeof (client as postgres.Sql).reserve === 'function';
}

function fileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function sqlitePragma(client: SqliteClient, name: string): number {
  const row = client.query(`PRAGMA ${name}`).get() as Record<string, unknown> | null;
  return Number(row?.[name] ?? 0);
}

function getSqliteSize(): DatabaseSize {
  const client = rawClient() as SqliteClient;
  const pageSize = sqlitePragma(client, 'page_size');
  const pageCount = sqlitePragma(client, 'page_count');
  const freePages = sqlitePragma(client, 'freelist_count');
  const dbPath = getSqliteDatabasePath();
  const totalBytes = dbPath
    ? fileSize(dbPath) + fileSize(`${dbPath}-wal`) + fileSize(`${dbPath}-shm`)
    : pageCount * pageSize;
  return { dialect: 'sqlite', totalBytes, reclaimableBytes: freePages * pageSize };
}

async function getPostgresSize(): Promise<DatabaseSize> {
  const result = (await getDatabase().execute(
    sql`SELECT pg_database_size(current_database()) AS size`
  )) as Array<{ size: unknown }> | { rows: Array<{ size: unknown }> };
  const rows = Array.isArray(result) ? result : result.rows;
  return { dialect: 'postgres', totalBytes: Number(rows[0]?.size ?? 0) };
}

/** Current on-disk size of the database for the active dialect. */
export async function getDatabaseSize(): Promise<DatabaseSize> {
  return getCurrentDialect() === 'sqlite' ? getSqliteSize() : getPostgresSize();
}

/**
 * Rebuild the SQLite file and fold the WAL back into it.
 *
 * bun:sqlite is synchronous, so VACUUM blocks the event loop (and therefore
 * all request handling) until it finishes — seconds for a typical database,
 * longer for multi-GB files. It also needs temporary disk space up to the size
 * of the database. Admins trigger this deliberately from the UI.
 */
function vacuumSqlite(): void {
  const client = rawClient() as SqliteClient;
  client.exec('VACUUM');
  client.query('PRAGMA wal_checkpoint(TRUNCATE)').get();
}

/**
 * VACUUM cannot run inside a transaction block, so postgres-js runs it on a
 * reserved connection with the statement timeout lifted (the pool default
 * would abort a long VACUUM). PGlite has a single connection and no timeout.
 */
async function vacuumPostgres(full: boolean): Promise<void> {
  const statement = full ? 'VACUUM (FULL, ANALYZE)' : 'VACUUM (ANALYZE)';
  const client = rawClient() as PostgresClient;
  if (!isPostgresJsClient(client)) {
    await client.exec(statement);
    return;
  }
  const reserved = await client.reserve();
  try {
    await reserved`SET statement_timeout = 0`;
    await reserved.unsafe(statement);
  } finally {
    try {
      await reserved`RESET statement_timeout`;
    } catch (error) {
      logger.warn(`Failed to reset statement_timeout after VACUUM: ${error}`);
    }
    reserved.release();
  }
}

/**
 * Compact the database (SQLite VACUUM + WAL truncate, Postgres VACUUM).
 * Only one compaction may run at a time; a concurrent call rejects with
 * {@link CompactionInProgressError}.
 */
export async function compactDatabase(options: CompactionOptions = {}): Promise<CompactionResult> {
  if (compactionInProgress) {
    throw new CompactionInProgressError();
  }
  compactionInProgress = true;
  const startedAt = Date.now();
  try {
    const dialect = getCurrentDialect();
    const full = dialect === 'postgres' && options.full === true;
    const before = await getDatabaseSize();

    if (dialect === 'sqlite') {
      vacuumSqlite();
    } else {
      await vacuumPostgres(full);
    }

    const after = await getDatabaseSize();
    const result: CompactionResult = {
      dialect,
      beforeBytes: before.totalBytes,
      afterBytes: after.totalBytes,
      reclaimedBytes: Math.max(0, before.totalBytes - after.totalBytes),
      durationMs: Date.now() - startedAt,
      full,
    };
    logger.info(
      `Database compaction (${dialect}${full ? ', full' : ''}) finished in ${result.durationMs}ms: ` +
        `${result.beforeBytes} -> ${result.afterBytes} bytes`
    );
    return result;
  } finally {
    compactionInProgress = false;
  }
}

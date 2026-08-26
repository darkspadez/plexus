import type { getCurrentDialect } from '../../db/client';
import type { ApiKeyPauseEvidence } from './pause-contract';

export type DatabaseDialect = ReturnType<typeof getCurrentDialect>;

export type ApiKeyStateRow = {
  readonly id: number;
  readonly name: string;
  readonly pausedAt: number | null;
  readonly disabledAt: number | null;
  readonly expiresAt: number | null;
};

export type ApiKeyState = 'not_found' | 'disabled' | 'paused' | 'active';

export type PauseSelectQuery<T> = PromiseLike<readonly T[]> & {
  from(table: unknown): PauseSelectQuery<T>;
  where(condition: unknown): PauseSelectQuery<T>;
  orderBy(...orders: readonly unknown[]): PauseSelectQuery<T>;
  limit(value: number): PauseSelectQuery<T>;
  offset(value: number): Promise<readonly T[]>;
};

export type PauseUpdateQuery = PromiseLike<unknown> & {
  set(values: unknown): PauseUpdateQuery;
  where(condition: unknown): PauseUpdateQuery;
  returning(fields: unknown): Promise<readonly { readonly id: number }[]>;
};

export type PauseInsertQuery = PromiseLike<unknown> & {
  values(values: unknown): Promise<unknown>;
};

export type PauseTransactionExecutor = {
  select<T = unknown>(fields?: unknown): PauseSelectQuery<T>;
  update(table: unknown): PauseUpdateQuery;
  insert(table: unknown): PauseInsertQuery;
  delete(table: unknown): PauseDeleteQuery;
};

export type PauseDeleteQuery = PromiseLike<unknown> & {
  where(condition: unknown): PauseDeleteQuery;
  returning(fields: unknown): Promise<readonly { readonly id: number }[]>;
};

export type PauseDatabaseExecutor = PauseTransactionExecutor & {
  transaction<T>(callback: (tx: PauseTransactionExecutor) => Promise<T>): Promise<T>;
};

export type ApiKeySecurityEventRow = {
  readonly id: number;
  readonly apiKeyId: number | null;
  readonly keyName: string;
  readonly eventKind: string;
  readonly source: string;
  readonly actor: string | null;
  readonly reason: string | null;
  readonly evidence: unknown;
  readonly createdAt: number;
};

type DatabaseResult = {
  readonly rowsAffected?: unknown;
  readonly changes?: unknown;
  readonly rowCount?: unknown;
};

function isDatabaseResult(value: unknown): value is DatabaseResult {
  return typeof value === 'object' && value !== null;
}

function toCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  return null;
}

export function getRowsAffected(result: unknown, dialect: DatabaseDialect): number {
  if (dialect === 'postgres' && Array.isArray(result)) return result.length;
  if (!isDatabaseResult(result)) return 0;

  const affected =
    dialect === 'sqlite'
      ? (toCount(result.rowsAffected) ?? toCount(result.changes))
      : (toCount(result.rowCount) ?? toCount(result.rowsAffected));
  return affected ?? 0;
}

export function classifyApiKeyState(row: ApiKeyStateRow | undefined, now: number): ApiKeyState {
  if (row === undefined) return 'not_found';
  if (row.disabledAt !== null || (row.expiresAt !== null && row.expiresAt <= now)) {
    return 'disabled';
  }
  if (row.pausedAt !== null) return 'paused';
  return 'active';
}

export function encodeEvidence(
  evidence: ApiKeyPauseEvidence | null,
  dialect: DatabaseDialect
): string | ApiKeyPauseEvidence | null {
  if (evidence === null || dialect === 'postgres') return evidence;
  return JSON.stringify(evidence);
}

function isEvidenceRecord(value: unknown): value is ApiKeyPauseEvidence {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function decodeEvidence(value: unknown): ApiKeyPauseEvidence | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return isEvidenceRecord(value) ? value : null;

  try {
    const parsed: unknown = JSON.parse(value);
    return isEvidenceRecord(parsed) ? parsed : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

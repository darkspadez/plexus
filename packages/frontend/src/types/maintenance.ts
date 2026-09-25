/**
 * Database maintenance: orphaned-data scan, purge, and compaction (VACUUM).
 * Mirrors the /v0/management/database/* endpoints.
 */

export type CleanupCategoryId =
  | 'oauth-credentials'
  | 'meter-snapshots'
  | 'provider-performance'
  | 'quota-state'
  | 'unused-quotas'
  | 'obsolete-settings'
  | 'unknown-settings'
  | 'legacy-files'
  | 'dead-rows';

export interface CleanupItem {
  id: string;
  label: string;
  detail?: string;
  count?: number;
  /** Shown for information only; never deleted by a purge. */
  reportOnly?: boolean;
}

export interface CleanupCategory {
  id: CleanupCategoryId;
  label: string;
  description: string;
  defaultSelected: boolean;
  /** Deletable units; excludes reportOnly items. */
  count: number;
  /** Capped at 500 entries by the backend. */
  items: CleanupItem[];
  truncated?: boolean;
}

export interface DatabaseSize {
  dialect: 'sqlite' | 'postgres';
  totalBytes: number;
  reclaimableBytes?: number;
}

/** GET /v0/management/database/cleanup */
export interface DatabaseCleanupScan {
  scannedAt: number;
  categories: CleanupCategory[];
  size: DatabaseSize;
}

/** POST /v0/management/database/purge */
export interface DatabasePurgeResult {
  deleted: Partial<Record<CleanupCategoryId, number>>;
  errors: Partial<Record<CleanupCategoryId, string>>;
}

export interface CompactDatabaseOptions {
  /** Postgres only: VACUUM FULL (locks tables, needs extra disk). */
  full?: boolean;
}

/** POST /v0/management/database/compact */
export interface DatabaseCompactResult {
  dialect: DatabaseSize['dialect'];
  beforeBytes: number;
  afterBytes: number;
  reclaimedBytes: number;
  durationMs: number;
  full: boolean;
}

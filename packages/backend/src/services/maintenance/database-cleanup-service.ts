import { and, count, eq, inArray, isNotNull, max, or, type SQL } from 'drizzle-orm';
import { getDatabase, getSchema } from '../../db/client';
import {
  KNOWN_SYSTEM_SETTING_KEYS,
  OBSOLETE_SYSTEM_SETTING_KEYS,
} from '../../db/system-settings-repository';
import type { KeyConfig, PlexusConfig, ProviderConfig, QuotaDefinition } from '../../config';
import { logger } from '../../utils/logger';
import { toEpochMs } from '../../utils/normalize';
import { ConfigService } from '../configuration/config-service';
import { OAuthAuthManager } from '../oauth/oauth-auth-manager';
import { resolveQuotaNames, SHARED_OWNER } from '../quota/quota-enforcer';
import { type DatabaseSize, getDatabaseSize } from './database-compactor';
import { deleteLegacyFiles, findLegacyFiles, type LegacyFile } from './legacy-files';

export type { DatabaseSize } from './database-compactor';

// ─── Public contract ─────────────────────────────────────────────────

export const CLEANUP_CATEGORY_IDS = [
  'oauth-credentials',
  'meter-snapshots',
  'provider-performance',
  'quota-state',
  'unused-quotas',
  'obsolete-settings',
  'unknown-settings',
  'legacy-files',
  'dead-rows',
] as const;

export type CleanupCategoryId = (typeof CLEANUP_CATEGORY_IDS)[number];

export interface CleanupItem {
  /** Stable id within the category. */
  id: string;
  label: string;
  detail?: string;
  /** Rows represented by this item (grouped rows). */
  count?: number;
  /** Shown but never deleted (read-only/bind-mounted file, YAML config). */
  reportOnly?: boolean;
}

export interface CleanupCategory {
  id: CleanupCategoryId;
  label: string;
  description: string;
  defaultSelected: boolean;
  /** Deletable units (rows, credentials, definitions, keys, files); excludes reportOnly items. */
  count: number;
  items: CleanupItem[];
  truncated?: boolean;
}

export interface CleanupScanResult {
  scannedAt: number;
  categories: CleanupCategory[];
  size: DatabaseSize;
}

export interface CleanupPurgeResult {
  deleted: Partial<Record<CleanupCategoryId, number>>;
  errors: Partial<Record<CleanupCategoryId, string>>;
}

// ─── Category metadata ───────────────────────────────────────────────

const MAX_ITEMS_PER_CATEGORY = 500;
const OAUTH_GRACE_MS = 24 * 60 * 60 * 1000;
const IN_LIST_CHUNK = 500;
const PAIR_CHUNK = 100;

const CATEGORY_META: Record<
  CleanupCategoryId,
  { label: string; description: string; defaultSelected: boolean }
> = {
  'oauth-credentials': {
    label: 'Orphaned OAuth credentials',
    description:
      'Stored OAuth logins that no provider or quota checker references. Credentials created in the last 24 hours are kept so a login can finish before its provider is saved.',
    defaultSelected: true,
  },
  'meter-snapshots': {
    label: 'Orphaned quota meter history',
    description: 'Quota checker snapshots whose checker no longer exists on any provider.',
    defaultSelected: true,
  },
  'provider-performance': {
    label: 'Stale provider performance data',
    description:
      'Latency and throughput samples for providers that were removed, or for models no longer configured on their provider or used by an alias.',
    defaultSelected: true,
  },
  'quota-state': {
    label: 'Stale quota usage counters',
    description:
      'User-quota counters for deleted keys or quota definitions, or for quotas no longer attached to the key.',
    defaultSelected: true,
  },
  'unused-quotas': {
    label: 'Unused quota definitions',
    description:
      'User quota definitions not assigned to any key and not listed in the default quotas. They may be kept on purpose for future use.',
    defaultSelected: false,
  },
  'obsolete-settings': {
    label: 'Obsolete system settings',
    description: 'Settings written by older Plexus versions that are no longer read.',
    defaultSelected: true,
  },
  'unknown-settings': {
    label: 'Unrecognized system settings',
    description:
      'Settings this Plexus version does not recognize. They may belong to a newer version or a custom integration.',
    defaultSelected: false,
  },
  'legacy-files': {
    label: 'Legacy configuration files',
    description:
      'Old auth.json credential files and YAML config files that Plexus no longer reads. Files Plexus cannot delete itself are listed for manual removal.',
    defaultSelected: true,
  },
  'dead-rows': {
    label: 'Dead table rows',
    description:
      'Rows in the retired quota_snapshots table and cooldowns for providers that no longer exist.',
    defaultSelected: true,
  },
};

/** Categories whose purge changes config the ConfigService cache holds. */
const CONFIG_CATEGORIES = new Set<CleanupCategoryId>([
  'oauth-credentials',
  'unused-quotas',
  'obsolete-settings',
  'unknown-settings',
]);

// ─── Internals ───────────────────────────────────────────────────────

interface ScanContext {
  now: number;
  providers: Record<string, ProviderConfig>;
  keys: Record<string, KeyConfig>;
  quotas: Record<string, QuotaDefinition>;
  defaultQuotas: string[];
}

interface CategoryPlan {
  category: CleanupCategory;
  /** Deletes exactly what this plan's scan classified; returns units deleted. */
  purge: () => Promise<number>;
}

type CategoryScanner = (ctx: ScanContext) => Promise<CategoryPlan | null>;

/** A purge that failed part-way; `deleted` counts what was removed before the failure. */
class PartialPurgeError extends Error {
  constructor(
    message: string,
    readonly deleted: number
  ) {
    super(message);
    this.name = 'PartialPurgeError';
  }
}

// Drizzle table objects differ per dialect; getSchema() is untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any;

function db() {
  return getDatabase();
}

function schema() {
  return getSchema();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

function formatDate(value: unknown): string | null {
  const ms = toEpochMs(value as Date | number | string | null | undefined);
  return ms == null ? null : new Date(ms).toISOString().slice(0, 10);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function rowsDetail(rows: number, last: unknown, suffix?: string): string {
  const lastDate = formatDate(last);
  return [`${formatCount(rows)} rows`, lastDate ? `last ${lastDate}` : null, suffix ?? null]
    .filter(Boolean)
    .join(' · ');
}

function pairKey(a: string, b: string): string {
  return `${a}\u0000${b}`;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

function buildCategory(
  id: CleanupCategoryId,
  items: CleanupItem[],
  total: number
): CleanupCategory {
  const truncated = items.length > MAX_ITEMS_PER_CATEGORY;
  return {
    id,
    ...CATEGORY_META[id],
    count: total,
    items: truncated ? items.slice(0, MAX_ITEMS_PER_CATEGORY) : items,
    ...(truncated ? { truncated: true } : {}),
  };
}

/** Count matching rows, then delete them (mirrors the retention jobs). */
async function countAndDelete(table: AnyTable, where: SQL | undefined): Promise<number> {
  const rows = (await db().select({ n: count() }).from(table).where(where)) as Array<{
    n: number;
  }>;
  const n = Number(rows[0]?.n ?? 0);
  if (n > 0) await db().delete(table).where(where);
  return n;
}

async function deleteInChunks<T>(
  table: AnyTable,
  values: T[],
  size: number,
  where: (batch: T[]) => SQL | undefined
): Promise<number> {
  let deleted = 0;
  for (const batch of chunk(values, size)) {
    deleted += await countAndDelete(table, where(batch));
  }
  return deleted;
}

/** Quota names attached to a key — its own list, else `default_quotas`. */
function attachedQuotaNames(key: KeyConfig, ctx: ScanContext): string[] {
  const config = { default_quotas: ctx.defaultQuotas } as Pick<
    PlexusConfig,
    'default_quotas'
  > as PlexusConfig;
  return resolveQuotaNames(key, config)?.names ?? [];
}

function modelNames(provider: ProviderConfig): Set<string> {
  const models = provider.models;
  if (!models) return new Set();
  return new Set(Array.isArray(models) ? models : Object.keys(models));
}

/**
 * Loads the authoritative config straight from the database. Any failure
 * (including a provider secret that cannot be decrypted) aborts the whole
 * scan so nothing is ever misclassified as orphaned.
 */
async function loadContext(): Promise<ScanContext> {
  const repo = ConfigService.getInstance().getRepository();
  const providers = await repo.getAllProviders();
  const keys = await repo.getAllKeys();
  const quotas = await repo.getAllUserQuotas();
  const settings = await repo.getAllSettings();
  const defaultQuotas = Array.isArray(settings.default_quotas)
    ? (settings.default_quotas as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  return { now: Date.now(), providers, keys, quotas, defaultQuotas };
}

// ─── oauth-credentials ───────────────────────────────────────────────

interface CredentialRow {
  id: number;
  providerType: string;
  accountId: string;
  createdAt: number;
  updatedAt: number;
}

interface CredentialUsage {
  /** Credential ids a provider row links to directly. */
  linkedIds: Set<number>;
  /** (provider type, account) pairs a provider or quota checker resolves to. */
  pairs: Set<string>;
  /** Accounts a quota checker names without a resolvable provider type. */
  anyTypeAccounts: Set<string>;
  /**
   * Provider types resolved at runtime by the legacy / single-credential
   * fallback without a fixed account (e.g. an unlinked provider whose account
   * is ambiguous). Every credential of such a type is kept.
   */
  wholeTypes: Set<string>;
}

function addProviderUsage(slug: string, provider: ProviderConfig, usage: CredentialUsage): void {
  const type = provider.oauth_provider;
  if (!type) return;
  // (a) linked or hydrated (legacy / single-credential) account
  if (provider.oauth_account) usage.pairs.add(pairKey(type, provider.oauth_account));
  else usage.wholeTypes.add(type);
  // (b) credential named after the slug, pending its 1:1 link
  usage.pairs.add(pairKey(type, slug));
}

/**
 * OAuth provider type each OAuth-backed quota checker falls back to when
 * neither its options nor its provider name one (see the checkers'
 * `getOption('oauthProvider', <default>)`).
 */
const OAUTH_CHECKER_DEFAULT_TYPES: Readonly<Record<string, string>> = {
  'claude-code': 'anthropic',
  'openai-codex': 'openai-codex',
  copilot: 'github-copilot',
  'muse-code': 'meta',
};

function addQuotaCheckerUsage(provider: ProviderConfig, usage: CredentialUsage): void {
  const checkerType = provider.quota_checker?.type;
  const options = (provider.quota_checker?.options ?? {}) as Record<string, unknown>;
  const account = typeof options.oauthAccountId === 'string' ? options.oauthAccountId.trim() : '';
  const explicitType =
    typeof options.oauthProvider === 'string' ? options.oauthProvider.trim() : '';
  const type =
    explicitType ||
    provider.oauth_provider ||
    (checkerType ? OAUTH_CHECKER_DEFAULT_TYPES[checkerType] : undefined);
  // (c) quota checker bound to an explicit OAuth account
  if (account && type) usage.pairs.add(pairKey(type, account));
  else if (account) usage.anyTypeAccounts.add(account);
  // An OAuth checker without an account resolves through the legacy /
  // single-credential fallback of its type, so keep that whole type. (An OAuth
  // provider's own account is already covered by addProviderUsage.)
  else if (explicitType) usage.wholeTypes.add(explicitType);
  else if (type && !provider.oauth_provider) usage.wholeTypes.add(type);
}

async function collectCredentialUsage(ctx: ScanContext): Promise<CredentialUsage> {
  const s = schema();
  const linked = (await db()
    .select({ id: s.providers.oauthCredentialId })
    .from(s.providers)
    .where(isNotNull(s.providers.oauthCredentialId))) as Array<{ id: number }>;
  const usage: CredentialUsage = {
    linkedIds: new Set(linked.map((row) => Number(row.id))),
    pairs: new Set(),
    anyTypeAccounts: new Set(),
    wholeTypes: new Set(),
  };
  for (const [slug, provider] of Object.entries(ctx.providers)) {
    addProviderUsage(slug, provider, usage);
    addQuotaCheckerUsage(provider, usage);
  }
  return usage;
}

function isCredentialInUse(row: CredentialRow, usage: CredentialUsage): boolean {
  return (
    usage.linkedIds.has(Number(row.id)) ||
    usage.pairs.has(pairKey(row.providerType, row.accountId)) ||
    usage.anyTypeAccounts.has(row.accountId) ||
    usage.wholeTypes.has(row.providerType)
  );
}

const scanOAuthCredentials: CategoryScanner = async (ctx) => {
  const s = schema();
  // Never select token columns.
  const rows = (await db()
    .select({
      id: s.oauthCredentials.id,
      providerType: s.oauthCredentials.oauthProviderType,
      accountId: s.oauthCredentials.accountId,
      createdAt: s.oauthCredentials.createdAt,
      updatedAt: s.oauthCredentials.updatedAt,
    })
    .from(s.oauthCredentials)) as CredentialRow[];
  const usage = await collectCredentialUsage(ctx);
  const orphans = rows.filter(
    (row) => ctx.now - Number(row.createdAt) >= OAUTH_GRACE_MS && !isCredentialInUse(row, usage)
  );

  const items = orphans.map((row) => {
    const refreshed = formatDate(Number(row.updatedAt));
    return {
      id: `${row.providerType}/${row.accountId}`,
      label: `${row.accountId} (${row.providerType})`,
      ...(refreshed ? { detail: `last refreshed ${refreshed}` } : {}),
    };
  });

  return {
    category: buildCategory('oauth-credentials', items, orphans.length),
    purge: async () => {
      const configService = ConfigService.getInstance();
      const authManager = OAuthAuthManager.getInstance();
      // Let any in-flight load finish first so it cannot re-add evicted rows.
      await authManager.initialize();
      let deleted = 0;
      for (const row of orphans) {
        try {
          await configService.deleteOAuthCredentials(row.providerType, row.accountId);
        } catch (error) {
          throw new PartialPurgeError(
            `Failed to delete ${row.providerType}/${row.accountId}: ${errorMessage(error)}`,
            deleted
          );
        }
        authManager.evictCredentials(row.providerType, row.accountId);
        deleted++;
      }
      return deleted;
    },
  };
};

// ─── meter-snapshots ─────────────────────────────────────────────────

/** Checker ids of every configured quota checker, enabled or not. */
function configuredCheckerIds(ctx: ScanContext): Set<string> {
  const ids = new Set<string>();
  for (const [slug, provider] of Object.entries(ctx.providers)) {
    if (!provider.quota_checker) continue;
    const id = (provider.quota_checker.id ?? slug).trim();
    if (id) ids.add(id);
  }
  return ids;
}

const scanMeterSnapshots: CategoryScanner = async (ctx) => {
  const t = schema().meterSnapshots;
  const groups = (await db()
    .select({ checkerId: t.checkerId, provider: t.provider, rows: count(), last: max(t.checkedAt) })
    .from(t)
    .groupBy(t.checkerId, t.provider)) as Array<{
    checkerId: string;
    provider: string;
    rows: number;
    last: unknown;
  }>;
  const live = configuredCheckerIds(ctx);
  const orphans = groups
    .filter((g) => !live.has(g.checkerId))
    .sort((a, b) => Number(b.rows) - Number(a.rows));
  const orphanIds = [...new Set(orphans.map((g) => g.checkerId))];

  const items = orphans.map((g) => ({
    id: `${g.checkerId}|${g.provider}`,
    label: g.checkerId === g.provider ? g.checkerId : `${g.checkerId} (${g.provider})`,
    detail: rowsDetail(Number(g.rows), g.last),
    count: Number(g.rows),
  }));
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return {
    category: buildCategory('meter-snapshots', items, total),
    purge: () => deleteInChunks(t, orphanIds, IN_LIST_CHUNK, (ids) => inArray(t.checkerId, ids)),
  };
};

// ─── provider-performance ────────────────────────────────────────────

interface ProviderModelPair {
  provider: string;
  model: string;
}

function performanceOrphanReason(
  pair: ProviderModelPair,
  ctx: ScanContext,
  aliasTargets: Set<string>
): string | null {
  const provider = ctx.providers[pair.provider];
  if (!provider) return 'provider removed';
  const models = modelNames(provider);
  if (models.size === 0 || models.has(pair.model)) return null;
  if (aliasTargets.has(pairKey(pair.provider, pair.model))) return null;
  return 'model not configured';
}

const scanProviderPerformance: CategoryScanner = async (ctx) => {
  const s = schema();
  const t = s.providerPerformance;
  const groups = (await db()
    .select({ provider: t.provider, model: t.model, rows: count(), last: max(t.createdAt) })
    .from(t)
    .groupBy(t.provider, t.model)) as Array<ProviderModelPair & { rows: number; last: unknown }>;
  const targets = (await db()
    .select({ provider: s.modelAliasTargets.providerSlug, model: s.modelAliasTargets.modelName })
    .from(s.modelAliasTargets)) as Array<{ provider: string | null; model: string | null }>;
  const aliasTargets = new Set(
    targets.filter((r) => r.provider && r.model).map((r) => pairKey(r.provider!, r.model!))
  );

  const orphans = groups
    .map((g) => ({ ...g, reason: performanceOrphanReason(g, ctx, aliasTargets) }))
    .filter((g) => g.reason !== null)
    .sort((a, b) => Number(b.rows) - Number(a.rows));

  const items = orphans.map((g) => ({
    id: `${g.provider}|${g.model}`,
    label: `${g.provider} / ${g.model}`,
    detail: rowsDetail(Number(g.rows), g.last, g.reason ?? undefined),
    count: Number(g.rows),
  }));
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return {
    category: buildCategory('provider-performance', items, total),
    purge: () =>
      deleteInChunks(t, orphans, PAIR_CHUNK, (batch) =>
        or(...batch.map((p) => and(eq(t.provider, p.provider), eq(t.model, p.model))))
      ),
  };
};

// ─── quota-state ─────────────────────────────────────────────────────

interface QuotaStateRow {
  keyName: string;
  quotaName: string;
  lastUpdated: unknown;
}

function quotaStateStaleReason(
  row: QuotaStateRow,
  ctx: ScanContext,
  quotasInUse: Set<string>
): string | null {
  const shared = row.keyName === SHARED_OWNER;
  const key = shared ? undefined : ctx.keys[row.keyName];
  if (!shared && !key) return 'key no longer exists';
  const def = ctx.quotas[row.quotaName];
  if (!def) return 'quota definition no longer exists';
  if (def.shared && !shared) return 'quota is shared — per-key counter unused';
  if (!def.shared && shared) return 'quota is not shared — pooled counter unused';
  if (key && !attachedQuotaNames(key, ctx).includes(row.quotaName)) {
    return 'quota no longer attached to this key';
  }
  if (shared && !quotasInUse.has(row.quotaName)) return 'no key uses this shared quota';
  return null;
}

/** Every quota name attached to at least one key (own list or defaults). */
function quotasAttachedToKeys(ctx: ScanContext): Set<string> {
  const names = new Set<string>();
  for (const key of Object.values(ctx.keys)) {
    for (const name of attachedQuotaNames(key, ctx)) names.add(name);
  }
  return names;
}

const scanQuotaState: CategoryScanner = async (ctx) => {
  const t = schema().quotaState;
  const rows = (await db()
    .select({ keyName: t.keyName, quotaName: t.quotaName, lastUpdated: t.lastUpdated })
    .from(t)) as QuotaStateRow[];
  const quotasInUse = quotasAttachedToKeys(ctx);
  const stale = rows
    .map((row) => ({ ...row, reason: quotaStateStaleReason(row, ctx, quotasInUse) }))
    .filter((row) => row.reason !== null);

  const items = stale.map((row) => {
    const updated = formatDate(row.lastUpdated);
    return {
      id: `${row.keyName}|${row.quotaName}`,
      label:
        row.keyName === SHARED_OWNER
          ? `${row.quotaName} (shared)`
          : `${row.keyName} · ${row.quotaName}`,
      detail: [row.reason, updated ? `updated ${updated}` : null].filter(Boolean).join(' · '),
    };
  });

  return {
    category: buildCategory('quota-state', items, stale.length),
    purge: () =>
      deleteInChunks(t, stale, PAIR_CHUNK, (batch) =>
        or(...batch.map((r) => and(eq(t.keyName, r.keyName), eq(t.quotaName, r.quotaName))))
      ),
  };
};

// ─── unused-quotas ───────────────────────────────────────────────────

const scanUnusedQuotas: CategoryScanner = async (ctx) => {
  const referenced = quotasAttachedToKeys(ctx);
  for (const name of ctx.defaultQuotas) referenced.add(name);
  const unused = Object.keys(ctx.quotas)
    .filter((name) => !referenced.has(name))
    .sort();

  const items = unused.map((name) => {
    const def = ctx.quotas[name]!;
    return {
      id: name,
      label: name,
      detail: `${def.type} · limit ${formatCount(def.limit)} ${def.limitType}`,
    };
  });

  return {
    category: buildCategory('unused-quotas', items, unused.length),
    purge: async () => {
      const configService = ConfigService.getInstance();
      const t = schema().quotaState;
      let deleted = 0;
      for (const name of unused) {
        try {
          await configService.deleteUserQuota(name);
          await countAndDelete(t, eq(t.quotaName, name));
        } catch (error) {
          throw new PartialPurgeError(
            `Failed to delete quota '${name}': ${errorMessage(error)}`,
            deleted
          );
        }
        deleted++;
      }
      return deleted;
    },
  };
};

// ─── obsolete-settings / unknown-settings ────────────────────────────

function settingsScanner(
  id: 'obsolete-settings' | 'unknown-settings',
  matches: (key: string) => boolean
): CategoryScanner {
  return async () => {
    const t = schema().systemSettings;
    const rows = (await db().select({ key: t.key, updatedAt: t.updatedAt }).from(t)) as Array<{
      key: string;
      updatedAt: unknown;
    }>;
    const selected = rows
      .filter((row) => matches(row.key))
      .sort((a, b) => a.key.localeCompare(b.key));
    const items = selected.map((row) => {
      const updated = formatDate(row.updatedAt);
      return { id: row.key, label: row.key, ...(updated ? { detail: `updated ${updated}` } : {}) };
    });
    return {
      category: buildCategory(id, items, selected.length),
      purge: () => ConfigService.getInstance().deleteSystemSettings(selected.map((r) => r.key)),
    };
  };
}

const OBSOLETE_KEYS = new Set(OBSOLETE_SYSTEM_SETTING_KEYS);
const KNOWN_KEYS = new Set(KNOWN_SYSTEM_SETTING_KEYS);

const scanObsoleteSettings = settingsScanner('obsolete-settings', (key) => OBSOLETE_KEYS.has(key));
const scanUnknownSettings = settingsScanner(
  'unknown-settings',
  (key) => !OBSOLETE_KEYS.has(key) && !KNOWN_KEYS.has(key)
);

// ─── legacy-files ────────────────────────────────────────────────────

function legacyFileItem(file: LegacyFile): CleanupItem {
  const modified = formatDate(file.modifiedAt);
  const detail = file.purgeable
    ? [formatBytes(file.sizeBytes), modified ? `modified ${modified}` : null]
        .filter(Boolean)
        .join(' · ')
    : file.blockedReason;
  return {
    id: file.path,
    label: file.path,
    ...(detail ? { detail } : {}),
    ...(file.purgeable ? {} : { reportOnly: true }),
  };
}

const scanLegacyFiles: CategoryScanner = async () => {
  const files = findLegacyFiles();
  const purgeable = files.filter((file) => file.purgeable);
  return {
    category: buildCategory('legacy-files', files.map(legacyFileItem), purgeable.length),
    purge: async () => {
      const { deleted, failures } = deleteLegacyFiles(purgeable);
      if (failures.length > 0) {
        throw new PartialPurgeError(`Failed to delete ${failures.join('; ')}`, deleted);
      }
      return deleted;
    },
  };
};

// ─── dead-rows ───────────────────────────────────────────────────────

const QUOTA_SNAPSHOTS_ITEM_ID = 'quota_snapshots';

const scanDeadRows: CategoryScanner = async (ctx) => {
  const s = schema();
  const snapshotRows = (await db().select({ n: count() }).from(s.quotaSnapshots)) as Array<{
    n: number;
  }>;
  const snapshots = Number(snapshotRows[0]?.n ?? 0);
  const cooldownGroups = (await db()
    .select({ provider: s.providerCooldowns.provider, rows: count() })
    .from(s.providerCooldowns)
    .groupBy(s.providerCooldowns.provider)) as Array<{ provider: string; rows: number }>;
  const orphanCooldowns = cooldownGroups.filter((g) => !ctx.providers[g.provider]);

  const items: CleanupItem[] = [];
  if (snapshots > 0) {
    items.push({
      id: QUOTA_SNAPSHOTS_ITEM_ID,
      label: 'Legacy quota_snapshots table',
      detail: `${formatCount(snapshots)} rows · superseded by quota meter snapshots`,
      count: snapshots,
    });
  }
  for (const group of orphanCooldowns) {
    items.push({
      id: `provider_cooldowns|${group.provider}`,
      label: `Cooldowns for removed provider ${group.provider}`,
      detail: `${formatCount(Number(group.rows))} rows`,
      count: Number(group.rows),
    });
  }
  const total = items.reduce((sum, item) => sum + (item.count ?? 0), 0);
  if (total === 0) return null;

  const orphanProviders = orphanCooldowns.map((g) => g.provider);
  return {
    category: buildCategory('dead-rows', items, total),
    purge: async () => {
      const snapshotsDeleted =
        snapshots > 0 ? await countAndDelete(s.quotaSnapshots, undefined) : 0;
      const cooldownsDeleted = await deleteInChunks(
        s.providerCooldowns,
        orphanProviders,
        IN_LIST_CHUNK,
        (providers) => inArray(s.providerCooldowns.provider, providers)
      );
      return snapshotsDeleted + cooldownsDeleted;
    },
  };
};

// ─── Orchestration ───────────────────────────────────────────────────

const SCANNERS: Record<CleanupCategoryId, CategoryScanner> = {
  'oauth-credentials': scanOAuthCredentials,
  'meter-snapshots': scanMeterSnapshots,
  'provider-performance': scanProviderPerformance,
  'quota-state': scanQuotaState,
  'unused-quotas': scanUnusedQuotas,
  'obsolete-settings': scanObsoleteSettings,
  'unknown-settings': scanUnknownSettings,
  'legacy-files': scanLegacyFiles,
  'dead-rows': scanDeadRows,
};

/**
 * Classify orphaned and unused data across every category. Read-only.
 * Throws if the config cannot be loaded, so nothing is misreported.
 */
export async function scanDatabase(): Promise<CleanupScanResult> {
  const ctx = await loadContext();
  const categories: CleanupCategory[] = [];
  for (const id of CLEANUP_CATEGORY_IDS) {
    const plan = await SCANNERS[id](ctx);
    if (plan) categories.push(plan.category);
  }
  return { scannedAt: ctx.now, categories, size: await getDatabaseSize() };
}

/**
 * Re-scan the requested categories and delete exactly what the fresh scan
 * classifies (report-only items are never touched). A failing category is
 * reported in `errors` without stopping the others.
 */
export async function purgeDatabase(categories: CleanupCategoryId[]): Promise<CleanupPurgeResult> {
  const requested = new Set(categories);
  const ctx = await loadContext();
  const result: CleanupPurgeResult = { deleted: {}, errors: {} };
  let configTouched = false;

  for (const id of CLEANUP_CATEGORY_IDS) {
    if (!requested.has(id)) continue;
    try {
      const plan = await SCANNERS[id](ctx);
      const deleted = plan && plan.category.count > 0 ? await plan.purge() : 0;
      result.deleted[id] = deleted;
      if (deleted > 0 && CONFIG_CATEGORIES.has(id)) configTouched = true;
    } catch (error) {
      result.errors[id] = errorMessage(error);
      if (error instanceof PartialPurgeError) result.deleted[id] = error.deleted;
      if (CONFIG_CATEGORIES.has(id)) configTouched = true;
      logger.error(`Database cleanup: purging '${id}' failed`, error);
    }
  }

  if (configTouched) {
    try {
      await ConfigService.getInstance().flush();
    } catch (error) {
      logger.warn(`Database cleanup: config cache rebuild failed: ${errorMessage(error)}`);
    }
  }

  logger.info(
    `Database cleanup purged ${JSON.stringify(result.deleted)}` +
      (Object.keys(result.errors).length > 0 ? ` with errors in ${Object.keys(result.errors)}` : '')
  );
  return result;
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  closeDatabase,
  getCurrentDialect,
  getDatabase,
  getSchema,
  initializeDatabase,
} from '../../../db/client';
import { runMigrations } from '../../../db/migrate';
import type { ConfigRepository } from '../../../db/config-repository';
import { toDbTimestampMs } from '../../../utils/normalize';
import { registerSpy } from '../../../../test/test-utils';
import { ConfigService } from '../../configuration/config-service';
import { ModelAutosyncScheduler } from '../../models/model-autosync-scheduler';
import { OAuthAuthManager } from '../../oauth/oauth-auth-manager';
import {
  CLEANUP_CATEGORY_IDS,
  type CleanupCategory,
  type CleanupCategoryId,
  type CleanupScanResult,
  purgeDatabase,
  scanDatabase,
} from '../database-cleanup-service';
import { READ_ONLY_REASON, YAML_CONFIG_REASON } from '../legacy-files';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACCESS_TOKEN = 'plain-access-token-do-not-leak';
const REFRESH_TOKEN = 'plain-refresh-token-do-not-leak';
const MANAGED_ENV = ['DATA_DIR', 'CONFIG_FILE'] as const;

let repo: ConfigRepository;
let tmpDir: string;
const originalEnv = new Map(MANAGED_ENV.map((key) => [key, process.env[key]]));

const RESET_TABLES = [
  'modelAliasTargets',
  'modelAliases',
  'providers',
  'oauthCredentials',
  'apiKeys',
  'userQuotaDefinitions',
  'systemSettings',
  'meterSnapshots',
  'providerPerformance',
  'quotaState',
  'quotaSnapshots',
  'providerCooldowns',
] as const;

function db(): any {
  return getDatabase();
}

function schema(): any {
  return getSchema();
}

function category(result: CleanupScanResult, id: CleanupCategoryId): CleanupCategory {
  const found = result.categories.find((c) => c.id === id);
  if (!found) throw new Error(`category ${id} missing from scan`);
  return found;
}

function itemIds(result: CleanupScanResult, id: CleanupCategoryId): string[] {
  return category(result, id)
    .items.map((item) => item.id)
    .sort();
}

async function seedCredential(type: string, account: string, ageMs = 2 * DAY_MS) {
  await repo.setOAuthCredentials(type, account, {
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  });
  const at = Date.now() - ageMs;
  const t = schema().oauthCredentials;
  await db()
    .update(t)
    .set({ createdAt: at, updatedAt: at })
    .where(and(eq(t.oauthProviderType, type), eq(t.accountId, account)));
}

async function saveOAuthProvider(slug: string, type: string, account?: string) {
  await repo.saveProvider(slug, {
    api_base_url: 'oauth://',
    oauth_provider: type,
    ...(account ? { oauth_account: account } : {}),
    models: {},
  } as any);
}

async function saveApiProvider(slug: string, extra: Record<string, unknown> = {}) {
  await repo.saveProvider(slug, {
    api_base_url: 'https://api.example.com/v1',
    api_key: 'sk-test',
    ...extra,
  } as any);
}

async function insertMeterSnapshots(checkerId: string, provider: string, rows: number) {
  const dialect = getCurrentDialect();
  for (let i = 0; i < rows; i++) {
    const at = toDbTimestampMs(Date.now() - i * 1000, dialect);
    await db()
      .insert(schema().meterSnapshots)
      .values({
        checkerId,
        checkerType: 'test',
        provider,
        meterKey: `meter-${i}`,
        kind: 'allowance',
        unit: '',
        label: 'test',
        utilizationState: 'reported',
        status: 'ok',
        checkedAt: at,
        createdAt: at,
      });
  }
}

async function insertPerformance(provider: string, model: string, rows = 1) {
  for (let i = 0; i < rows; i++) {
    await db()
      .insert(schema().providerPerformance)
      .values({
        provider,
        model,
        durationMs: 100,
        successCount: 1,
        createdAt: Date.now() - i,
      });
  }
}

async function insertQuotaState(keyName: string, quotaName: string) {
  await db()
    .insert(schema().quotaState)
    .values({
      keyName,
      quotaName,
      limitType: 'requests',
      currentUsage: 1,
      lastUpdated: toDbTimestampMs(Date.now(), getCurrentDialect()),
    });
}

async function insertCooldown(provider: string, model: string) {
  await db()
    .insert(schema().providerCooldowns)
    .values({
      provider,
      model,
      expiry: Date.now() + 60_000,
      consecutiveFailures: 1,
      createdAt: Date.now(),
    });
}

async function insertQuotaSnapshot() {
  const at = toDbTimestampMs(Date.now(), getCurrentDialect());
  await db().insert(schema().quotaSnapshots).values({
    provider: 'legacy',
    checkerId: 'legacy',
    windowType: 'daily',
    checkedAt: at,
    createdAt: at,
  });
}

async function rowCount(table: string): Promise<number> {
  return (await db().select().from(schema()[table])).length;
}

beforeEach(async () => {
  await closeDatabase();
  initializeDatabase(process.env.DATABASE_URL);
  await runMigrations();
  for (const table of RESET_TABLES) {
    await db().delete(schema()[table]);
  }
  ConfigService.resetInstance();
  OAuthAuthManager.resetForTesting();
  repo = ConfigService.getInstance().getRepository();

  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'plexus-cleanup-')));
  process.env.DATA_DIR = tmpDir;
  delete process.env.CONFIG_FILE;
});

afterEach(async () => {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.chmodSync(tmpDir, 0o755);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  ModelAutosyncScheduler.getInstance().stop();
  ModelAutosyncScheduler.resetInstance();
  OAuthAuthManager.resetForTesting();
  ConfigService.resetInstance();
  await closeDatabase();
});

describe('scanDatabase — shape', () => {
  it('returns every category with contract defaults and omits empty dead-rows', async () => {
    const result = await scanDatabase();

    expect(result.scannedAt).toBeGreaterThan(Date.now() - 60_000);
    expect(result.categories.map((c) => c.id)).toEqual(
      CLEANUP_CATEGORY_IDS.filter((id) => id !== 'dead-rows')
    );
    const defaults = Object.fromEntries(result.categories.map((c) => [c.id, c.defaultSelected]));
    expect(defaults).toEqual({
      'oauth-credentials': true,
      'meter-snapshots': true,
      'provider-performance': true,
      'quota-state': true,
      'unused-quotas': false,
      'obsolete-settings': true,
      'unknown-settings': false,
      'legacy-files': true,
    });
    for (const c of result.categories) {
      expect(c.label).toBeTruthy();
      expect(c.description).toBeTruthy();
      expect(c.count).toBe(0);
    }
    expect(result.size.dialect).toBe(getCurrentDialect());
    expect(result.size.totalBytes).toBeGreaterThan(0);
  });
});

describe('scanDatabase — oauth-credentials', () => {
  it('keeps credentials used via a link, a pending slug link, and a quota checker', async () => {
    await seedCredential('openai-codex', 'acct-linked');
    await saveOAuthProvider('codex-linked', 'openai-codex', 'acct-linked');
    // Grandfathered link to another account; the slug-named credential that
    // arrives later is left unlinked but still belongs to this provider.
    await seedCredential('openai-codex', 'acct-other');
    await saveOAuthProvider('slug-pending', 'openai-codex', 'acct-other');
    await seedCredential('openai-codex', 'slug-pending');
    await saveApiProvider('api-with-checker', {
      quota_checker: {
        type: 'claude-code',
        enabled: true,
        intervalMinutes: 30,
        options: { oauthProvider: 'anthropic', oauthAccountId: 'acct-qc' },
      },
    });
    await seedCredential('anthropic', 'acct-qc');
    await seedCredential('openai-codex', 'acct-stale');
    await seedCredential('anthropic', 'acct-gone');

    const result = await scanDatabase();

    expect(itemIds(result, 'oauth-credentials')).toEqual([
      'anthropic/acct-gone',
      'openai-codex/acct-stale',
    ]);
    expect(category(result, 'oauth-credentials').count).toBe(2);
  });

  it('keeps credentials resolved through the legacy and single-credential fallback', async () => {
    await seedCredential('anthropic', 'legacy');
    await seedCredential('anthropic', 'acct-extra');
    await saveOAuthProvider('claude', 'anthropic');
    await seedCredential('github-copilot', 'only-account');
    await saveOAuthProvider('copilot', 'github-copilot');

    const result = await scanDatabase();

    expect(itemIds(result, 'oauth-credentials')).toEqual(['anthropic/acct-extra']);
  });

  it('keeps every credential of a type whose unlinked provider is ambiguous', async () => {
    await seedCredential('openai-codex', 'a1');
    await seedCredential('openai-codex', 'a2');
    await saveOAuthProvider('codex', 'openai-codex');

    const result = await scanDatabase();

    expect(category(result, 'oauth-credentials').count).toBe(0);
  });

  it("keeps the checker's default type when an API-key provider runs an OAuth checker", async () => {
    // A claude-code checker with no oauthProvider / oauthAccountId on a
    // non-OAuth provider resolves `anthropic` through the fallback at runtime.
    await saveApiProvider('api-claude-checker', {
      quota_checker: { type: 'claude-code', enabled: true, intervalMinutes: 30, options: {} },
    });
    await seedCredential('anthropic', 'a1');
    await seedCredential('anthropic', 'a2');
    await seedCredential('openai-codex', 'unused');

    const result = await scanDatabase();

    expect(itemIds(result, 'oauth-credentials')).toEqual(['openai-codex/unused']);
  });

  it('skips credentials created within the last 24 hours', async () => {
    await seedCredential('anthropic', 'fresh-login', 60_000);
    await seedCredential('anthropic', 'old-login', 25 * 60 * 60 * 1000);

    const result = await scanDatabase();

    expect(itemIds(result, 'oauth-credentials')).toEqual(['anthropic/old-login']);
  });

  it('never returns token material', async () => {
    await seedCredential('anthropic', 'acct-gone');

    const result = await scanDatabase();

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(ACCESS_TOKEN);
    expect(serialized).not.toContain(REFRESH_TOKEN);
    const [item] = category(result, 'oauth-credentials').items;
    expect(Object.keys(item!).sort()).toEqual(['detail', 'id', 'label']);
    expect(item!.detail).toMatch(/^last refreshed \d{4}-\d{2}-\d{2}$/);
  });

  it('throws instead of classifying when providers cannot be loaded', async () => {
    await seedCredential('anthropic', 'acct-gone');
    registerSpy(repo, 'getAllProviders').mockRejectedValue(new Error('cannot decrypt'));

    await expect(scanDatabase()).rejects.toThrow('cannot decrypt');
    await expect(purgeDatabase(['oauth-credentials'])).rejects.toThrow('cannot decrypt');
    expect(await rowCount('oauthCredentials')).toBe(1);
  });
});

describe('scanDatabase — meter-snapshots', () => {
  it('flags snapshots of checkers no provider defines, keeping disabled ones', async () => {
    await saveApiProvider('naga', {
      quota_checker: { type: 'naga', enabled: true, intervalMinutes: 30, options: {} },
    });
    await saveApiProvider('disabled-provider', {
      enabled: false,
      quota_checker: {
        type: 'naga',
        id: 'custom-id',
        enabled: false,
        intervalMinutes: 30,
        options: {},
      },
    });
    await insertMeterSnapshots('naga', 'naga', 2);
    await insertMeterSnapshots('custom-id', 'disabled-provider', 1);
    await insertMeterSnapshots('poe', 'poe', 3);
    await insertMeterSnapshots('old-checker', 'naga', 1);

    const result = await scanDatabase();
    const meters = category(result, 'meter-snapshots');

    expect(itemIds(result, 'meter-snapshots')).toEqual(['old-checker|naga', 'poe|poe']);
    expect(meters.count).toBe(4);
    const poe = meters.items.find((item) => item.id === 'poe|poe')!;
    expect(poe.count).toBe(3);
    expect(poe.detail).toMatch(/^3 rows · last \d{4}-\d{2}-\d{2}$/);
  });
});

describe('scanDatabase — provider-performance', () => {
  it('keeps configured, alias-targeted, and model-less provider pairs', async () => {
    await saveApiProvider('naga', { models: ['grok-4'] });
    await saveApiProvider('bare');
    await repo.saveAlias('alias-a', {
      target_groups: [
        { name: 'primary', selector: 'random', targets: [{ provider: 'naga', model: 'aliased' }] },
      ],
    } as any);
    await insertPerformance('naga', 'grok-4');
    await insertPerformance('naga', 'aliased');
    await insertPerformance('naga', 'removed-model', 2);
    await insertPerformance('bare', 'anything');
    await insertPerformance('ghost', 'm1');

    const result = await scanDatabase();
    const perf = category(result, 'provider-performance');

    expect(itemIds(result, 'provider-performance')).toEqual(['ghost|m1', 'naga|removed-model']);
    expect(perf.count).toBe(3);
    expect(perf.items.find((i) => i.id === 'ghost|m1')!.detail).toContain('provider removed');
    expect(perf.items.find((i) => i.id === 'naga|removed-model')!.detail).toContain(
      'model not configured'
    );
  });
});

async function seedQuotaScenario() {
  await repo.saveUserQuota('daily', { type: 'daily', limitType: 'requests', limit: 100 } as any);
  await repo.saveUserQuota('pool', {
    type: 'daily',
    limitType: 'tokens',
    limit: 1000,
    shared: true,
  } as any);
  await repo.saveUserQuota('default-q', {
    type: 'monthly',
    limitType: 'cost',
    limit: 5,
  } as any);
  await repo.saveUserQuota('unused-shared', {
    type: 'weekly',
    limitType: 'requests',
    limit: 10,
    shared: true,
  } as any);
  await repo.saveUserQuota('spare', { type: 'daily', limitType: 'requests', limit: 1 } as any);
  await repo.saveKey('alice', { secret: 'sk-alice', quotas: ['daily', 'pool'] } as any);
  await repo.saveKey('bob', { secret: 'sk-bob' } as any);
  await repo.setSetting('default_quotas', ['default-q']);
}

describe('scanDatabase — quota-state and unused-quotas', () => {
  it('flags counters for missing keys/definitions, owner mismatches, and detached quotas', async () => {
    await seedQuotaScenario();
    await insertQuotaState('alice', 'daily'); // keep
    await insertQuotaState('*', 'pool'); // keep (shared bucket used by alice)
    await insertQuotaState('bob', 'default-q'); // keep (default_quotas fallback)
    await insertQuotaState('alice', 'pool'); // shared quota, per-key owner
    await insertQuotaState('*', 'daily'); // unshared quota, pooled owner
    await insertQuotaState('bob', 'daily'); // not attached to bob
    await insertQuotaState('ghost', 'daily'); // key deleted
    await insertQuotaState('alice', 'deleted-quota'); // definition deleted
    await insertQuotaState('*', 'unused-shared'); // shared, no key uses it

    const result = await scanDatabase();
    const state = category(result, 'quota-state');

    expect(itemIds(result, 'quota-state')).toEqual([
      '*|daily',
      '*|unused-shared',
      'alice|deleted-quota',
      'alice|pool',
      'bob|daily',
      'ghost|daily',
    ]);
    expect(state.count).toBe(6);
    const details = Object.fromEntries(state.items.map((i) => [i.id, i.detail]));
    expect(details['ghost|daily']).toContain('key no longer exists');
    expect(details['alice|deleted-quota']).toContain('quota definition no longer exists');
    expect(details['alice|pool']).toContain('quota is shared');
    expect(details['*|daily']).toContain('quota is not shared');
    expect(details['bob|daily']).toContain('no longer attached');
    expect(details['*|unused-shared']).toContain('no key uses this shared quota');
  });

  it('lists definitions no key or default references, unselected by default', async () => {
    await seedQuotaScenario();

    const result = await scanDatabase();
    const unused = category(result, 'unused-quotas');

    expect(unused.defaultSelected).toBe(false);
    expect(itemIds(result, 'unused-quotas')).toEqual(['spare', 'unused-shared']);
    expect(unused.count).toBe(2);
  });
});

describe('scanDatabase — settings', () => {
  it('splits stored keys into obsolete and unknown', async () => {
    await repo.setSetting('system.bootstrapped', true);
    await repo.setSetting('grafanaUrl', 'http://grafana');
    await repo.setSetting('failover.enabled', true);
    await repo.setSetting('mcpEnabled', false);
    await repo.setSetting('mystery.flag', 1);

    const result = await scanDatabase();

    expect(itemIds(result, 'obsolete-settings')).toEqual(['grafanaUrl', 'system.bootstrapped']);
    expect(itemIds(result, 'unknown-settings')).toEqual(['mystery.flag']);
    expect(category(result, 'unknown-settings').defaultSelected).toBe(false);
  });
});

describe('scanDatabase — dead-rows', () => {
  it('reports legacy quota snapshots and cooldowns of removed providers', async () => {
    await saveApiProvider('naga');
    await insertQuotaSnapshot();
    await insertQuotaSnapshot();
    await insertCooldown('naga', 'm1'); // live provider — kept
    await insertCooldown('ghost', 'm1');
    await insertCooldown('ghost', 'm2');

    const result = await scanDatabase();
    const dead = category(result, 'dead-rows');

    expect(dead.count).toBe(4);
    expect(dead.items.map((i) => [i.id, i.count])).toEqual([
      ['quota_snapshots', 2],
      ['provider_cooldowns|ghost', 2],
    ]);
  });
});

describe('scanDatabase — legacy-files', () => {
  it('lists a writable auth.json as purgeable and YAML config as report-only', async () => {
    const authJson = path.join(tmpDir, 'auth.json');
    const yaml = path.join(tmpDir, 'plexus.yaml');
    fs.writeFileSync(authJson, '{}');
    fs.writeFileSync(yaml, 'providers: {}\n');
    process.env.CONFIG_FILE = yaml;

    const result = await scanDatabase();
    const files = category(result, 'legacy-files');
    const byId = Object.fromEntries(files.items.map((i) => [i.id, i]));

    expect(byId[authJson]).toMatchObject({ label: authJson });
    expect(byId[authJson]!.reportOnly).toBeUndefined();
    expect(byId[yaml]).toMatchObject({ reportOnly: true, detail: YAML_CONFIG_REASON });
    expect(files.count).toBe(1);
  });

  it.skipIf(process.getuid?.() === 0)('reports a file in a read-only directory', async () => {
    const authJson = path.join(tmpDir, 'auth.json');
    fs.writeFileSync(authJson, '{}');
    fs.chmodSync(tmpDir, 0o555);

    const result = await scanDatabase();
    const files = category(result, 'legacy-files');

    expect(files.items.find((i) => i.id === authJson)).toMatchObject({
      reportOnly: true,
      detail: READ_ONLY_REASON,
    });
    expect(files.count).toBe(0);

    const purge = await purgeDatabase(['legacy-files']);
    expect(purge.deleted['legacy-files']).toBe(0);
    expect(fs.existsSync(authJson)).toBe(true);
  });
});

describe('purgeDatabase', () => {
  async function seedEverything() {
    await seedQuotaScenario();
    await saveApiProvider('naga', {
      models: ['grok-4'],
      quota_checker: { type: 'naga', enabled: true, intervalMinutes: 30, options: {} },
    });
    await seedCredential('anthropic', 'acct-gone');
    await insertMeterSnapshots('naga', 'naga', 1);
    await insertMeterSnapshots('poe', 'poe', 2);
    await insertPerformance('naga', 'grok-4');
    await insertPerformance('ghost', 'm1', 3);
    await insertQuotaState('alice', 'daily');
    await insertQuotaState('ghost', 'daily');
    await insertQuotaState('bob', 'spare');
    await repo.setSetting('grafanaUrl', 'http://grafana');
    await repo.setSetting('mystery.flag', 1);
    await insertQuotaSnapshot();
    await insertCooldown('ghost', 'm1');
    fs.writeFileSync(path.join(tmpDir, 'auth.json'), '{}');
  }

  it('deletes every requested category and leaves live data alone', async () => {
    await seedEverything();
    await ConfigService.getInstance().initialize();

    const result = await purgeDatabase([...CLEANUP_CATEGORY_IDS]);

    expect(result.errors).toEqual({});
    expect(result.deleted).toEqual({
      'oauth-credentials': 1,
      'meter-snapshots': 2,
      'provider-performance': 3,
      'quota-state': 2,
      'unused-quotas': 2,
      'obsolete-settings': 1,
      'unknown-settings': 1,
      'legacy-files': 1,
      'dead-rows': 2,
    });
    expect(await rowCount('oauthCredentials')).toBe(0);
    expect(await rowCount('meterSnapshots')).toBe(1);
    expect(await rowCount('providerPerformance')).toBe(1);
    expect(await rowCount('quotaState')).toBe(1);
    expect(await rowCount('quotaSnapshots')).toBe(0);
    expect(await rowCount('providerCooldowns')).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, 'auth.json'))).toBe(false);
    expect(Object.keys(await repo.getAllUserQuotas()).sort()).toEqual([
      'daily',
      'default-q',
      'pool',
    ]);
    expect(Object.keys(await repo.getAllSettings()).sort()).toEqual(['default_quotas']);
    // The config cache was rebuilt, not left with the deleted definitions.
    expect(Object.keys(ConfigService.getInstance().getConfig().user_quotas ?? {}).sort()).toEqual([
      'daily',
      'default-q',
      'pool',
    ]);

    const rescan = await scanDatabase();
    expect(rescan.categories.every((c) => c.count === 0)).toBe(true);
  });

  it('only touches the requested categories', async () => {
    await seedEverything();

    const result = await purgeDatabase(['meter-snapshots']);

    expect(result).toEqual({ deleted: { 'meter-snapshots': 2 }, errors: {} });
    expect(await rowCount('oauthCredentials')).toBe(1);
    expect(await rowCount('providerPerformance')).toBe(4);
  });

  it('acts on a fresh scan rather than an earlier one', async () => {
    await seedCredential('anthropic', 'acct-gone');
    await insertMeterSnapshots('poe', 'poe', 1);
    const before = await scanDatabase();
    expect(category(before, 'oauth-credentials').count).toBe(1);

    // Between scan and purge: the credential gains a provider, and a new
    // orphan snapshot appears.
    await saveOAuthProvider('acct-gone', 'anthropic');
    await insertMeterSnapshots('gone-checker', 'gone', 2);

    const result = await purgeDatabase(['oauth-credentials', 'meter-snapshots']);

    expect(result.deleted).toEqual({ 'oauth-credentials': 0, 'meter-snapshots': 3 });
    expect(await rowCount('oauthCredentials')).toBe(1);
  });

  it('evicts purged credentials from OAuthAuthManager and flushes the config cache', async () => {
    await seedCredential('anthropic', 'acct-gone');
    const authManager = OAuthAuthManager.getInstance();
    await authManager.initialize();
    expect(authManager.hasProvider('anthropic', 'acct-gone')).toBe(true);
    const evict = registerSpy(authManager, 'evictCredentials');
    const flush = registerSpy(ConfigService.getInstance(), 'flush');

    const result = await purgeDatabase(['oauth-credentials']);

    expect(result.deleted['oauth-credentials']).toBe(1);
    expect(evict).toHaveBeenCalledWith('anthropic', 'acct-gone');
    expect(authManager.hasProvider('anthropic', 'acct-gone')).toBe(false);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('reports a failing category and still purges the others', async () => {
    await repo.setSetting('grafanaUrl', 'http://grafana');
    await insertMeterSnapshots('poe', 'poe', 2);
    registerSpy(ConfigService.getInstance(), 'deleteSystemSettings').mockRejectedValue(
      new Error('settings table locked')
    );

    const result = await purgeDatabase(['obsolete-settings', 'meter-snapshots']);

    expect(result.errors).toEqual({ 'obsolete-settings': 'settings table locked' });
    expect(result.deleted).toEqual({ 'meter-snapshots': 2 });
    expect(await rowCount('systemSettings')).toBe(1);
  });
});

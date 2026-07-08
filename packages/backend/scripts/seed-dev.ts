#!/usr/bin/env bun
/**
 * seed-dev.ts
 *
 * In-process seeder that migrates a fresh dev database and populates every
 * *config* entity (providers, quotas, aliases, keys, MCP servers, settings,
 * OAuth credentials) through ConfigRepository, so the admin panel's config
 * pages are fully populated and the mock upstream (scripts/mock-upstream.ts)
 * is wired in as the provider fleet.
 *
 * Telemetry/history backfill (usage, errors, traces) is a separate phase —
 * see the "Phase 2" marker in main() below, where it appends.
 *
 * Runtime model: lives in packages/backend/scripts/ and is run with cwd
 * packages/backend (see root package.json's "seed-dev" script). Runs BEFORE
 * the backend server boots and owns the DB exclusively.
 *
 * Usage (from repo root):
 *   bun run seed-dev
 *   bun run seed-dev -- --force
 */

import path, { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import fs from 'node:fs';
import { initializeDatabase, closeDatabase } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { ConfigRepository } from '../src/db/config-repository';
import type {
  KeyConfig,
  McpServerConfig,
  ModelConfig,
  ProviderConfig,
  QuotaDefinition,
} from '../src/config';
import {
  buildAliases,
  buildKeys,
  buildMcpServers,
  buildOAuthAccounts,
  buildProviders,
  buildSettings,
  buildUserQuotas,
  type OAuthAccountSeed,
} from './seed-data';
import { resolveSeedAnchor, seedTelemetryPhase } from './seed-telemetry';

const FORCE = process.argv.includes('--force');

// ─── Repo root / worktree dir name ──────────────────────────────────────
// cwd here is packages/backend (see usage above) — but the worktree-derived
// port/DB defaults must match scripts/dev.ts and scripts/dev-config.ts,
// which both run with cwd = repo root. Resolve two levels up rather than
// using process.cwd() directly, or every default would be wrong.
const REPO_ROOT = path.resolve(process.cwd(), '../..');
const ROOT_DIR_NAME = basename(REPO_ROOT);

// ─── Mock port ───────────────────────────────────────────────────────────
// Identical derivation to scripts/mock-upstream.ts (run from the repo root,
// hence ROOT_DIR_NAME here rather than process.cwd()) — duplicated rather
// than imported, same precedent as scripts/dev.ts / scripts/dev-config.ts.
function derivePort(): number {
  const override = process.env.PLEXUS_MOCK_PORT;
  if (override) {
    const parsed = Number(override);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  let hash = 5381;
  for (let i = 0; i < ROOT_DIR_NAME.length; i++) {
    hash = (hash * 33) ^ ROOT_DIR_NAME.charCodeAt(i);
  }
  return 20000 + (Math.abs(hash) % 10000);
}
const MOCK_PORT = derivePort();

// ─── DATABASE_URL ────────────────────────────────────────────────────────
// Falls back to the same per-worktree default scripts/dev.ts computes when
// DATABASE_URL isn't already set, so a standalone run targets the exact DB
// the dev server will later open.
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.PLEXUS_POSTGRES_DRIVER === 'pglite') {
    if (!process.env.PLEXUS_PGLITE_DATA_DIR) {
      process.env.PLEXUS_PGLITE_DATA_DIR = join(tmpdir(), `plexus-${ROOT_DIR_NAME}.pglite`);
    }
    // Placeholder — dialect detection only needs the postgres:// prefix;
    // actual storage is PLEXUS_PGLITE_DATA_DIR (matches scripts/dev.ts).
    return 'postgres://localhost/plexus';
  }
  return `sqlite://${join(tmpdir(), `plexus-${ROOT_DIR_NAME}.db`)}`;
}
const DATABASE_URL = resolveDatabaseUrl();
process.env.DATABASE_URL = DATABASE_URL;

const MARKER_PATH = join(tmpdir(), `plexus-${ROOT_DIR_NAME}.seeded`);

function log(message: string): void {
  console.log(`[seed-dev] ${message}`);
}

/** dev.ts gates spawning the mock upstream + ticker on this file's presence. */
function writeMarkerFile(seededAt: number, mockPort: number): void {
  fs.writeFileSync(
    MARKER_PATH,
    JSON.stringify({ seededAt, mockPort, databaseUrl: DATABASE_URL }, null, 2)
  );
}

/** Everything the config phase produced — Task 3's backfill phase reads this. */
export interface ConfigSeedResult {
  providers: Record<string, ProviderConfig>;
  userQuotas: Record<string, QuotaDefinition>;
  aliases: Record<string, ModelConfig>;
  keys: Record<string, KeyConfig>;
  mcpServers: Record<string, McpServerConfig>;
  settings: Record<string, unknown>;
  oauthAccounts: OAuthAccountSeed[];
  mockPort: number;
}

/**
 * Seeds every config entity through ConfigRepository, in referential order:
 * providers -> user quotas -> aliases -> keys, then MCP servers, settings,
 * OAuth credentials.
 *
 * One deliberate wrinkle: `saveProvider` only resolves a provider's
 * `oauth_credential_id` FK by looking up an existing `oauth_credentials` row
 * at save time (db/config-repository.ts). Since OAuth credentials are seeded
 * last (per the order above), the disabled OAuth-mode provider's link would
 * otherwise be silently dropped — its `oauth_account` would round-trip as
 * missing even though we set it. So after OAuth credentials exist, we
 * re-save just the provider(s) that reference one, which is enough to make
 * the FK resolve. See the task report for how this was found.
 */
async function seedConfigPhase(
  repo: ConfigRepository,
  mockPort: number
): Promise<ConfigSeedResult> {
  const providers = buildProviders({ mockPort });
  log(`Seeding ${Object.keys(providers).length} providers...`);
  for (const [slug, config] of Object.entries(providers)) {
    await repo.saveProvider(slug, config);
  }

  const userQuotas = buildUserQuotas();
  log(`Seeding ${Object.keys(userQuotas).length} user quotas...`);
  for (const [name, quota] of Object.entries(userQuotas)) {
    await repo.saveUserQuota(name, quota);
  }

  const aliases = buildAliases();
  log(`Seeding ${Object.keys(aliases).length} aliases...`);
  for (const [slug, config] of Object.entries(aliases)) {
    await repo.saveAlias(slug, config);
  }

  const keys = buildKeys();
  log(`Seeding ${Object.keys(keys).length} API keys...`);
  for (const [name, config] of Object.entries(keys)) {
    await repo.saveKey(name, config);
  }

  const mcpServers = buildMcpServers({ mockPort });
  log(`Seeding ${Object.keys(mcpServers).length} MCP servers...`);
  for (const [name, config] of Object.entries(mcpServers)) {
    await repo.saveMcpServer(name, config);
  }

  const settings = buildSettings({ mockPort });
  log(`Seeding ${Object.keys(settings).length} system settings...`);
  await repo.setSettingsBulk(settings);

  const oauthAccounts = buildOAuthAccounts();
  log(`Seeding ${oauthAccounts.length} OAuth credential rows...`);
  for (const account of oauthAccounts) {
    await repo.setOAuthCredentials(account.providerType, account.accountId, {
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      expiresAt: account.expiresAt,
    });
  }

  const oauthLinkedSlugs = Object.entries(providers)
    .filter(([, config]) => config.oauth_provider && config.oauth_account)
    .map(([slug]) => slug);
  if (oauthLinkedSlugs.length > 0) {
    log(`Re-saving ${oauthLinkedSlugs.length} OAuth-linked provider(s) to resolve their FK...`);
    for (const slug of oauthLinkedSlugs) {
      await repo.saveProvider(slug, providers[slug]!);
    }
  }

  return { providers, userQuotas, aliases, keys, mcpServers, settings, oauthAccounts, mockPort };
}

async function main(): Promise<void> {
  const start = Date.now();

  log(`repo root:    ${REPO_ROOT}`);
  log(`mock port:    ${MOCK_PORT}`);
  log(`database url: ${DATABASE_URL}`);

  initializeDatabase(DATABASE_URL);
  await runMigrations();

  const repo = new ConfigRepository();

  const [existingProviders, existingKeys] = await Promise.all([
    repo.getAllProviders(),
    repo.getAllKeys(),
  ]);
  const providerCount = Object.keys(existingProviders).length;
  const keyCount = Object.keys(existingKeys).length;
  const hasExisting = providerCount > 0 || keyCount > 0;

  if (hasExisting && !FORCE) {
    log(
      `Database already has ${providerCount} provider(s) and ${keyCount} key(s) — refusing to reseed.`
    );
    log('Re-run with --force to wipe existing config and reseed.');
    // Lost-marker recovery: macOS periodically purges tmpdir, and a purged
    // marker would otherwise permanently orphan the mock upstream + ticker
    // for an already-seeded DB (dev.ts gates on the marker file). If this DB
    // carries our dev.seeded settings row, (re)write the marker from it —
    // crucially with the persisted mockPort, which is what the seeded
    // providers actually point at. A DB without dev.seeded (a user's own
    // config) gets no marker, so dev.ts won't spawn mock/ticker against it.
    const seeded = await repo.getSetting<{ seededAt?: number; mockPort?: number } | null>(
      'dev.seeded',
      null
    );
    if (seeded && typeof seeded === 'object') {
      writeMarkerFile(seeded.seededAt ?? Date.now(), seeded.mockPort ?? MOCK_PORT);
      log(`Marker file (re)written from dev.seeded setting: ${MARKER_PATH}`);
    }
    await closeDatabase();
    process.exit(0);
  }

  if (hasExisting && FORCE) {
    log('--force: clearing all existing config...');
    await repo.clearAllData();
  }

  // ─── Phase 1: config (this task) ──────────────────────────────────────
  const result = await seedConfigPhase(repo, MOCK_PORT);

  // ─── Phase 2: telemetry/history backfill (Task 3) ─────────────────────
  // `PLEXUS_SEED_ANCHOR` (epoch ms) pins "now" for every generated
  // timestamp — fixing it across two runs against scratch DBs is Task 3's
  // determinism proof. Left unset, it defaults to the real current time.
  const anchor = resolveSeedAnchor();
  const telemetry = await seedTelemetryPhase(result, anchor);

  writeMarkerFile(Date.now(), MOCK_PORT);

  const elapsedMs = Date.now() - start;

  console.log('');
  console.log('Plexus dev seed complete:');
  console.log(`  providers:      ${Object.keys(result.providers).length}`);
  console.log(`  user quotas:    ${Object.keys(result.userQuotas).length}`);
  console.log(`  aliases:        ${Object.keys(result.aliases).length}`);
  console.log(`  api keys:       ${Object.keys(result.keys).length}`);
  console.log(`  mcp servers:    ${Object.keys(result.mcpServers).length}`);
  console.log(`  settings:       ${Object.keys(result.settings).length}`);
  console.log(`  oauth accounts: ${result.oauthAccounts.length}`);
  console.log(`  request usage:  ${telemetry.requestUsage}`);
  console.log(`  debug logs:     ${telemetry.debugLogs}`);
  console.log(`  inf. errors:    ${telemetry.inferenceErrors}`);
  console.log(`  mcp usage:      ${telemetry.mcpRequestUsage}`);
  console.log(`  meter snaps:    ${telemetry.meterSnapshots}`);
  console.log(`  quota state:    ${telemetry.quotaState}`);
  console.log(`  mock port:      ${MOCK_PORT}`);
  console.log(`  marker file:    ${MARKER_PATH}`);
  console.log(`  elapsed:        ${elapsedMs}ms (telemetry: ${telemetry.elapsedMs}ms)`);

  await closeDatabase();
}

main().catch(async (err) => {
  console.error('[seed-dev] FAILED:', err);
  try {
    await closeDatabase();
  } catch {
    // already closed / never opened
  }
  process.exit(1);
});

/**
 * seed-telemetry.ts
 *
 * Phase 2 of the dev seeder (see seed-dev.ts's "Phase 2" marker): backfills
 * 30 days of deterministic synthetic telemetry — request_usage, debug_logs,
 * inference_errors, mcp_request_usage, meter_snapshots and (see the
 * quota_state section below) quota_state — so every history-driven admin
 * surface (Dashboard, Requests, Errors, Traces, MCP logs, Quotas) renders
 * like a busy 30-day-old production instance the moment the dev stack boots.
 *
 * Determinism:
 *   - A single seeded PRNG (mulberry32, fixed numeric seed — see SEED below)
 *     drives every shape/count/choice in this file. Never Math.random.
 *   - Every generated timestamp derives from a single `anchor` epoch-ms value
 *     (see resolveSeedAnchor()), captured once by the caller and threaded
 *     through. With a fixed PLEXUS_SEED_ANCHOR, two runs against scratch DBs
 *     produce byte-identical `.dump` output (see task report).
 *
 * Scope: telemetry only. Config entities (providers/keys/aliases/quotas/MCP
 * servers/settings/OAuth) are Task 2's (seed-data.ts / seedConfigPhase in
 * seed-dev.ts) — this module only reads the already-built `ConfigSeedResult`
 * to attribute usage correctly; it never re-derives or duplicates that data.
 */

import { sql } from 'drizzle-orm';
import { getDatabase, getSchema, getCurrentDialect } from '../src/db/client';
import { UsageStorageService } from '../src/services/observability/usage-storage';
import type { DebugLogRecord } from '../src/services/observability/debug-manager';
import { McpUsageStorageService } from '../src/services/mcp-proxy/mcp-usage-storage';
import { SHARED_OWNER } from '../src/services/quota/quota-enforcer';
import { toDbTimestampMs } from '../src/utils/normalize';
import type { KeyConfig, ModelConfig, ModelTarget, ProviderConfig } from '../src/config';
import type { ConfigSeedResult } from './seed-dev';
import parseDuration from 'parse-duration';

// ─────────────────────────────────────────────────────────────────────────
// PRNG — mulberry32, fixed seed. This is the ONLY source of randomness in
// this module; Math.random and Date.now() (outside of anchor resolution)
// must never appear below this point.
// ─────────────────────────────────────────────────────────────────────────

type Rng = () => number;

/** Fixed, arbitrary constant — never derived from anchor/time, so the RNG's
 * output sequence is identical across process runs regardless of wall-clock
 * time. Determinism comes from (this seed) x (anchor-derived time math), not
 * from anything environment-specific. */
const SEED = 0x506c6578; // 'Plex' in hex, arbitrary but fixed

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function rng(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randFloat(rng: Rng, min: number, max: number): number {
  return rng() * (max - min) + min;
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

interface Weighted {
  weight: number;
}

function pickWeighted<T extends Weighted>(rng: Rng, items: readonly T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let r = rng() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1]!;
}

/** Deterministic UUID-shaped hex string from the PRNG (not a real v4 UUID —
 * just uuid-shaped, per the task brief). */
function uuidLike(rng: Rng): string {
  const hex = () => Math.floor(rng() * 16).toString(16);
  const block = (n: number) => Array.from({ length: n }, hex).join('');
  return `${block(8)}-${block(4)}-${block(4)}-${block(4)}-${block(12)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Anchor resolution
// ─────────────────────────────────────────────────────────────────────────

/** `PLEXUS_SEED_ANCHOR` — epoch-ms override for "now" during seeding. Every
 * generated timestamp in this module derives from the returned value. Fixing
 * it across two runs against scratch DBs is the determinism proof (see task
 * report); leaving it unset defaults to the real current time, which is what
 * a normal `bun run seed-dev` invocation wants. */
export function resolveSeedAnchor(): number {
  const raw = process.env.PLEXUS_SEED_ANCHOR;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return Date.now();
}

// ─────────────────────────────────────────────────────────────────────────
// Time constants
// ─────────────────────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const THIRTY_DAYS_MS = 30 * DAY_MS;

// ─────────────────────────────────────────────────────────────────────────
// Mock-upstream facts (read from scripts/mock-upstream.ts; not imported —
// importing it would start an HTTP server as a side effect). Keeping these
// numbers aligned means the historical meter_snapshots series ends exactly
// where a live check against the same mock would naturally continue.
// ─────────────────────────────────────────────────────────────────────────

const MOCK_QUOTA = {
  rollingMax: 1000,
  hourlyLimit: 100,
  weeklyMax: 500,
} as const;

const MOCK_BALANCE_RANGE: readonly [number, number] = [5, 500];

// ─────────────────────────────────────────────────────────────────────────
// Attribution weighting tables
//
// These key/alias weight tables reference alias/key NAMES that seed-data.ts
// (via ConfigSeedResult) already defines — they don't duplicate any config
// VALUES (pricing, targets, quotas, ...), just express relative traffic
// share for the synthetic backfill. Any alias/key not listed falls back to
// a default weight of 1 so the seeder never crashes if seed-data.ts's set
// changes.
// ─────────────────────────────────────────────────────────────────────────

const ALIAS_WEIGHTS: Record<string, number> = {
  'gpt-4o-mini': 20,
  'gpt-4o': 14,
  'claude-sonnet-4-5': 14,
  'claude-haiku-4-5': 10,
  'gemini-2.5-flash': 10,
  'gemini-2.5-pro': 6,
  smart: 8,
  balanced: 6,
  resilient: 5,
  'flaky-model-v1': 4,
  'text-embedding-3-small': 3,
};

const KEY_WEIGHTS: Record<string, number> = {
  'dev-admin': 25,
  'premium-tier': 20,
  'internal-tools': 12,
  'mobile-app': 10,
  'qa-automation': 8,
  'ci-pipeline': 7,
  'partner-acme': 6,
  'readonly-viewer': 5,
  'dev-ticker': 4,
  'free-tier': 3,
};

/** Alias's "home" client wire family, for incomingApiType weighting. Aliases
 * not listed here (currently only the embeddings alias) get special-cased
 * directly in buildUsageRow. */
const ALIAS_HOME_FAMILY: Record<string, 'chat' | 'messages' | 'gemini'> = {
  'gpt-4o': 'chat',
  'gpt-4o-mini': 'chat',
  'claude-sonnet-4-5': 'messages',
  'claude-haiku-4-5': 'messages',
  'gemini-2.5-pro': 'gemini',
  'gemini-2.5-flash': 'gemini',
  'flaky-model-v1': 'chat',
  resilient: 'chat',
  smart: 'chat',
  balanced: 'chat',
};

/** 24 relative hourly weights (index = UTC hour), a soft office-hours bell
 * peaking mid-day UTC — the "diurnal curve" the brief asks for. */
const DIURNAL_WEIGHTS: readonly number[] = [
  0.3, 0.25, 0.2, 0.2, 0.22, 0.3, 0.45, 0.65, 0.85, 1.05, 1.2, 1.3, 1.35, 1.35, 1.3, 1.25, 1.2,
  1.15, 1.0, 0.85, 0.7, 0.55, 0.45, 0.35,
];

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

/** Mirrors the non-exported `RetryAttemptRecord` interface at
 * services/dispatcher.ts:50 exactly (index/provider/model/apiType/status/
 * reason/statusCode/retryable) — dispatcher.ts doesn't export it, so this is
 * a structural shadow, not an import. */
interface RetryAttemptRecordLike {
  index: number;
  provider: string;
  model: string;
  apiType?: string;
  status: 'success' | 'failed' | 'skipped';
  reason: string;
  statusCode?: number;
  retryable?: boolean;
}

interface GeneratedRow {
  requestId: string;
  date: string;
  sourceIp: string | null;
  apiKey: string;
  attribution: string | null;
  incomingApiType: string;
  provider: string;
  attemptCount: number;
  retryHistory: string;
  incomingModelAlias: string;
  canonicalModelName: string;
  selectedModelName: string;
  finalAttemptProvider: string | null;
  finalAttemptModel: string | null;
  allAttemptedProviders: string;
  outgoingApiType: string;
  tokensInput: number | null;
  tokensOutput: number | null;
  tokensReasoning: number | null;
  tokensCached: number | null;
  tokensCacheWrite: number | null;
  costInput: number | null;
  costOutput: number | null;
  costCached: number | null;
  costCacheWrite: number | null;
  costTotal: number | null;
  costSource: string | null;
  costMetadata: string | null;
  startTime: number;
  durationMs: number | null;
  ttftMs: number | null;
  tokensPerSec: number | null;
  isStreamed: 0 | 1;
  isPassthrough: 0 | 1;
  responseStatus: 'success' | 'error' | 'stall' | 'timeout';
  tokensEstimated: 0 | 1;
  createdAt: number;
  toolsDefined: number | null;
  messageCount: number | null;
  parallelToolCallsEnabled: 0 | 1 | null;
  toolCallsCount: number | null;
  finishReason: string | null;
  isVisionFallthrough: 0 | 1;
  isDescriptorRequest: 0 | 1;
  visionFallthroughModel: string | null;
  kwhUsed: number | null;
  providerReportedCost: number | null;
}

interface CheckerInfo {
  checkerId: string;
  checkerType: string;
  provider: string;
}

export interface TelemetrySeedResult {
  anchor: number;
  requestUsage: number;
  debugLogs: number;
  inferenceErrors: number;
  mcpRequestUsage: number;
  meterSnapshots: number;
  quotaState: number;
  elapsedMs: number;
  requestUsageInsertMode: 'raw-batch';
  nearLimitKey: { key: string; quota: string; usage: number; limit: number };
}

// ─────────────────────────────────────────────────────────────────────────
// Config-derived helpers
// ─────────────────────────────────────────────────────────────────────────

/** Mirrors config.ts's getProviderTypes() record-form branch exactly (see
 * task report): a record `api_base_url` declares the provider's true wire
 * family via its key(s); a plain string always infers 'chat'. Only ever
 * called on providers that some alias target actually points at, so the
 * disabled oauth/ollama providers (never targeted) never reach here. */
function outgoingApiTypeForProvider(
  providerSlug: string,
  providers: Record<string, ProviderConfig>
): 'chat' | 'messages' | 'gemini' {
  const base = providers[providerSlug]?.api_base_url;
  if (base && typeof base === 'object') {
    if ('messages' in base) return 'messages';
    if ('gemini' in base) return 'gemini';
  }
  return 'chat';
}

/** Only `enabled !== false` targets are ever routable — this is exactly why
 * whisper-1/tts-1/dall-e-3's targets (all disabled) fall out of every pool
 * below without a hardcoded exclusion list. */
function enabledTargets(alias: ModelConfig): ModelTarget[] {
  return (alias.target_groups ?? []).flatMap((g) => g.targets).filter((t) => t.enabled !== false);
}

function providerAllowed(key: KeyConfig, provider: string): boolean {
  if (
    key.allowedProviders &&
    key.allowedProviders.length > 0 &&
    !key.allowedProviders.includes(provider)
  ) {
    return false;
  }
  if (key.excludedProviders && key.excludedProviders.includes(provider)) return false;
  return true;
}

function modelAllowed(key: KeyConfig, aliasName: string): boolean {
  if (key.allowedModels && key.allowedModels.length > 0 && !key.allowedModels.includes(aliasName)) {
    return false;
  }
  if (key.excludedModels && key.excludedModels.includes(aliasName)) return false;
  return true;
}

interface AliasPoolEntry extends Weighted {
  name: string;
  config: ModelConfig;
  targets: ModelTarget[];
}

/** Precomputes, for every key, the set of aliases it may legitimately use
 * (respecting `allowedModels`/`excludedModels`) with each alias's target
 * list narrowed to providers that key may reach (respecting
 * `allowedProviders`/`excludedProviders`) — see key-access-policy.ts /
 * scope-match.ts for the real enforcement this mirrors. An alias whose
 * every target is filtered away for a given key (e.g. `flaky-model-v1` for
 * `readonly-viewer`, which excludes `flaky-lab`) simply drops out of that
 * key's pool. */
function buildKeyAliasPools(
  aliases: Record<string, ModelConfig>,
  keys: Record<string, KeyConfig>
): Record<string, AliasPoolEntry[]> {
  const basePool = Object.entries(aliases)
    .map(([name, config]) => ({ name, config, targets: enabledTargets(config) }))
    .filter((a) => a.targets.length > 0);

  const result: Record<string, AliasPoolEntry[]> = {};
  for (const [keyName, keyConfig] of Object.entries(keys)) {
    result[keyName] = basePool
      .filter((a) => modelAllowed(keyConfig, a.name))
      .map((a) => ({
        name: a.name,
        config: a.config,
        weight: ALIAS_WEIGHTS[a.name] ?? 1,
        targets: a.targets.filter((t) => providerAllowed(keyConfig, t.provider)),
      }))
      .filter((a) => a.targets.length > 0);
  }
  return result;
}

/** Mirrors config-service.ts's buildProviderQuotaConfigs() checkerId
 * derivation EXACTLY: `(quota_checker.id ?? providerSlug).trim()`. This is
 * the critical alignment point — since none of Task 2's seeded providers set
 * an explicit quota_checker.id, checkerId === provider slug for all five
 * enabled checkers, and this function stays correct even if that changes. */
function deriveActiveCheckers(providers: Record<string, ProviderConfig>): CheckerInfo[] {
  const checkers: CheckerInfo[] = [];
  const seenIds = new Set<string>();
  for (const [providerId, providerConfig] of Object.entries(providers)) {
    if (providerConfig.enabled === false) continue;
    const qc = providerConfig.quota_checker;
    if (!qc || qc.enabled === false) continue;
    const checkerId = (qc.id ?? providerId).trim();
    if (!checkerId || seenIds.has(checkerId)) continue;
    seenIds.add(checkerId);
    checkers.push({ checkerId, checkerType: qc.type, provider: providerId });
  }
  return checkers;
}

/** Per-provider {input, output} $/M-token rates, read directly off
 * seed-data.ts's own provider/model definitions (via ConfigSeedResult) —
 * never duplicated as separate literals. Only 'simple'-sourced models are
 * ever routed to in this dataset (the two 'per_request'-priced models,
 * whisper-1/dall-e-3, have disabled alias targets and are never selected by
 * buildKeyAliasPools). */
function buildPricingMap(
  providers: Record<string, ProviderConfig>
): Record<string, Record<string, { input: number; output: number }>> {
  const out: Record<string, Record<string, { input: number; output: number }>> = {};
  for (const [providerSlug, providerConfig] of Object.entries(providers)) {
    const models = providerConfig.models ?? {};
    const perModel: Record<string, { input: number; output: number }> = {};
    for (const [modelId, modelConfig] of Object.entries(models)) {
      const pricing = (modelConfig as { pricing?: unknown }).pricing as
        | { source: string; input?: number; output?: number }
        | undefined;
      if (pricing && pricing.source === 'simple') {
        perModel[modelId] = { input: pricing.input ?? 0, output: pricing.output ?? 0 };
      }
    }
    out[providerSlug] = perModel;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Calendar window helpers — mirrors QuotaEnforcer's private getWindowStart()
// (services/quota/quota-enforcer.ts) exactly, since that method isn't
// exported. Used both to place the near-limit key's "today" burst and to
// seed quota_state windows consistently with what a live recompute call
// would independently compute.
// ─────────────────────────────────────────────────────────────────────────

type CalendarType = 'daily' | 'weekly' | 'monthly';

function getWindowStart(type: CalendarType, nowMs: number): number {
  const now = new Date(nowMs);
  if (type === 'daily') {
    now.setUTCHours(0, 0, 0, 0);
    return now.getTime();
  } else if (type === 'weekly') {
    const daysSinceMonday = (now.getUTCDay() + 6) % 7;
    now.setUTCDate(now.getUTCDate() - daysSinceMonday);
    now.setUTCHours(0, 0, 0, 0);
    return now.getTime();
  }
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Time distribution — diurnal curve, weekday > weekend, extra density in the
// last 48h and last hour, smooth 30-day taper.
// ─────────────────────────────────────────────────────────────────────────

const HOURLY_BUCKETS = (THIRTY_DAYS_MS / HOUR_MS) | 0; // 720

/** Builds a cumulative-weight array over 720 hourly buckets spanning
 * [anchor-30d, anchor]. Bucket i covers [anchor-30d+i*1h, anchor-30d+(i+1)h). */
function buildHourlyCumWeights(anchor: number): number[] {
  const cum: number[] = new Array(HOURLY_BUCKETS);
  let sum = 0;
  for (let i = 0; i < HOURLY_BUCKETS; i++) {
    const bucketStart = anchor - THIRTY_DAYS_MS + i * HOUR_MS;
    const bucketEnd = bucketStart + HOUR_MS;
    const ageMs = Math.max(0, anchor - bucketEnd); // ~0 for the most recent bucket
    const ageDays = ageMs / DAY_MS;

    const recencyFactor = 1 + 2 * Math.exp(-ageDays / 3); // smooth 30d taper
    const bucketDate = new Date(bucketStart);
    const diurnal = DIURNAL_WEIGHTS[bucketDate.getUTCHours()]!;
    const dow = bucketDate.getUTCDay();
    const weekday = dow === 0 || dow === 6 ? 0.45 : 1.0;

    let weight = recencyFactor * diurnal * weekday;
    if (ageMs <= 48 * HOUR_MS) weight *= 1.8; // last-48h bump
    if (ageMs <= HOUR_MS) weight *= 3.5; // last-hour bump

    sum += weight;
    cum[i] = sum;
  }
  return cum;
}

function sampleBucket(rng: Rng, cum: readonly number[]): number {
  const r = rng() * cum[cum.length - 1]!;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! < r) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function pickTimestamp(rng: Rng, anchor: number, cum: readonly number[]): number {
  const bucketIdx = sampleBucket(rng, cum);
  const bucketStart = anchor - THIRTY_DAYS_MS + bucketIdx * HOUR_MS;
  const bucketEnd = Math.min(bucketStart + HOUR_MS, anchor);
  const span = Math.max(1, bucketEnd - bucketStart);
  return bucketStart + Math.floor(rng() * span);
}

// ─────────────────────────────────────────────────────────────────────────
// Attempt-story generation — the shared model behind attemptCount,
// retryHistory, allAttemptedProviders, and the terminal outcome.
//
// Every real successful dispatch produces a NON-null retryHistory with at
// least one entry (dispatcher.ts always calls appendSuccessAttempt on the
// winning attempt — see task report) — so every row gets a populated
// retryHistory, not just the "attemptCount > 1" subset.
// ─────────────────────────────────────────────────────────────────────────

const FAILURE_REASONS: ReadonlyArray<{ reason: string; statusCode?: number; retryable: boolean }> =
  [
    { reason: 'HTTP 500: Internal Server Error', statusCode: 500, retryable: true },
    { reason: 'HTTP 503: Service Unavailable', statusCode: 503, retryable: true },
    { reason: 'HTTP 429: Too Many Requests', statusCode: 429, retryable: true },
    { reason: 'HTTP 502: Bad Gateway', statusCode: 502, retryable: true },
    { reason: 'fetch failed: ECONNRESET', retryable: true },
    { reason: 'The operation timed out.', retryable: true },
    { reason: 'HTTP 400: Bad Request', statusCode: 400, retryable: false },
  ];

/** Per-target failure probability. `flaky-lab` gets the mock upstream's own
 * documented ~30% flaky rate (mock-upstream.ts: "Models with 'flaky' in the
 * name fail ~30% of the time") — this single rule covers BOTH the direct
 * `flaky-model-v1` alias and `resilient`'s deliberately-first flaky-lab leg
 * without a separate case. Non-flaky legs get a modest baseline, with the
 * first leg of a multi-target alias slightly elevated so enough organic
 * failover stories occur to land attemptCount>1 near the brief's ~6% target
 * (measured, not just assumed — see task report). */
function targetFailRate(provider: string, targetIndex: number, totalTargets: number): number {
  if (provider === 'flaky-lab') return 0.3;
  if (totalTargets === 1) return 0.025;
  return targetIndex === 0 ? 0.08 : 0.02;
}

interface AttemptStory {
  attempts: RetryAttemptRecordLike[];
  finalProvider: string;
  finalModel: string;
  outcome: 'success' | 'error';
}

function buildAttemptStory(
  rng: Rng,
  orderedTargetsIn: readonly ModelTarget[],
  providers: Record<string, ProviderConfig>,
  forceSuccess: boolean
): AttemptStory {
  const attempts: RetryAttemptRecordLike[] = [];
  let orderedTargets = orderedTargetsIn;

  // Occasionally (multi-target only) the first candidate is skipped outright
  // (provider on cooldown) rather than attempted and failed — exercises the
  // 'skipped' status variant.
  if (!forceSuccess && orderedTargets.length > 1 && rng() < 0.04) {
    const skipped = orderedTargets[0]!;
    attempts.push({
      index: 1,
      provider: skipped.provider,
      model: skipped.model,
      apiType: outgoingApiTypeForProvider(skipped.provider, providers),
      status: 'skipped',
      reason: `Provider ${skipped.provider}/${skipped.model} is on cooldown`,
      retryable: false,
    });
    orderedTargets = orderedTargets.slice(1);
  }

  for (let i = 0; i < orderedTargets.length; i++) {
    const target = orderedTargets[i]!;
    const failRate = forceSuccess ? 0 : targetFailRate(target.provider, i, orderedTargets.length);
    const apiType = outgoingApiTypeForProvider(target.provider, providers);

    if (rng() < failRate) {
      const fr = pick(rng, FAILURE_REASONS);
      attempts.push({
        index: attempts.length + 1,
        provider: target.provider,
        model: target.model,
        apiType,
        status: 'failed',
        reason: fr.reason,
        statusCode: fr.statusCode,
        retryable: fr.retryable,
      });
      continue;
    }

    attempts.push({
      index: attempts.length + 1,
      provider: target.provider,
      model: target.model,
      apiType,
      status: 'success',
      reason: 'Request completed successfully',
      retryable: false,
    });
    return {
      attempts,
      finalProvider: target.provider,
      finalModel: target.model,
      outcome: 'success',
    };
  }

  // Every real candidate failed (or the skip left nothing usable) — terminal.
  const lastFailed = attempts[attempts.length - 1]!;
  return {
    attempts,
    finalProvider: lastFailed.provider,
    finalModel: lastFailed.model,
    outcome: 'error',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Cost — matches utils/calculate-costs.ts's costSource/costMetadata shapes
// exactly for each of the five variants. Most rows use 'simple' (the only
// pricing source any seeded model actually has); the other four variants
// are deliberately sprinkled in for structural UI coverage, using
// synthesized-but-shape-correct metadata (documented in the task report).
// ─────────────────────────────────────────────────────────────────────────

interface CostFields {
  costInput: number;
  costOutput: number;
  costCached: number;
  costCacheWrite: number;
  costTotal: number;
  costSource: string;
  costMetadata: string;
}

function round8(n: number): number {
  return Number(n.toFixed(8));
}

function buildCostFields(
  rng: Rng,
  tokensInput: number,
  tokensOutput: number,
  tokensCached: number,
  tokensCacheWrite: number,
  simplePricing: { input: number; output: number }
): CostFields {
  const variantRoll = rng();
  const M = 1_000_000;

  if (variantRoll < 0.9) {
    // 'simple' — the real seeded input/output rates for this provider/model,
    // plus conventional cached (0.5x input) / cache-write (1.25x input)
    // rates. The exact rates used in the cost math also appear in the
    // metadata (calculate-costs.ts emits `{...pricing, discount}`), so the
    // stored costs and the stored pricing never contradict each other.
    const cachedRate = simplePricing.input * 0.5;
    const cacheWriteRate = simplePricing.input * 1.25;
    const inputCost = (tokensInput / M) * simplePricing.input;
    const outputCost = (tokensOutput / M) * simplePricing.output;
    const cachedCost = (tokensCached / M) * cachedRate;
    const cacheWriteCost = (tokensCacheWrite / M) * cacheWriteRate;
    return {
      costInput: round8(inputCost),
      costOutput: round8(outputCost),
      costCached: round8(cachedCost),
      costCacheWrite: round8(cacheWriteCost),
      costTotal: round8(inputCost + outputCost + cachedCost + cacheWriteCost),
      costSource: 'simple',
      costMetadata: JSON.stringify({
        source: 'simple',
        input: simplePricing.input,
        output: simplePricing.output,
        cached: cachedRate,
        cache_write: cacheWriteRate,
        discount: undefined,
      }),
    };
  } else if (variantRoll < 0.93) {
    // 'default' — no resolvable pricing; zero-cost sentinel (matches
    // calculate-costs.ts's un-conditional default exactly).
    return {
      costInput: 0,
      costOutput: 0,
      costCached: 0,
      costCacheWrite: 0,
      costTotal: 0,
      costSource: 'default',
      costMetadata: JSON.stringify({ input: 0, output: 0, cached: 0, cache_write: 0 }),
    };
  } else if (variantRoll < 0.96) {
    // 'openrouter' — per-token prompt/completion rates derived from this
    // model's own simple $/M rates (kept internally consistent) rather than
    // a second, disconnected literal.
    const promptRate = simplePricing.input / M;
    const completionRate = simplePricing.output / M;
    const inputCost = tokensInput * promptRate;
    const outputCost = tokensOutput * completionRate;
    return {
      costInput: round8(inputCost),
      costOutput: round8(outputCost),
      costCached: 0,
      costCacheWrite: 0,
      costTotal: round8(inputCost + outputCost),
      costSource: 'openrouter',
      costMetadata: JSON.stringify({
        slug: 'synthetic/mock-route',
        prompt: promptRate,
        completion: completionRate,
        input_cache_read: 0,
        input_cache_write: 0,
        discount: undefined,
      }),
    };
  } else if (variantRoll < 0.98) {
    // 'defined' — tiered pricing keyed by input-token range.
    const tierInput = simplePricing.input * 0.8;
    const tierOutput = simplePricing.output * 0.8;
    const inputCost = (tokensInput / M) * tierInput;
    const outputCost = (tokensOutput / M) * tierOutput;
    const range = {
      lower_bound: 0,
      upper_bound: 128_000,
      input_per_m: tierInput,
      output_per_m: tierOutput,
    };
    return {
      costInput: round8(inputCost),
      costOutput: round8(outputCost),
      costCached: 0,
      costCacheWrite: 0,
      costTotal: round8(inputCost + outputCost),
      costSource: 'defined',
      costMetadata: JSON.stringify({
        source: 'defined',
        input: tierInput,
        output: tierOutput,
        cached: 0,
        cache_write: 0,
        range,
        discount: undefined,
      }),
    };
  }
  // 'per_request' — flat fee, attributed entirely to the input bucket (see
  // calculate-costs.ts's own comment on why).
  const amount = round8(randFloat(rng, 0.001, 0.05));
  return {
    costInput: amount,
    costOutput: 0,
    costCached: 0,
    costCacheWrite: 0,
    costTotal: amount,
    costSource: 'per_request',
    costMetadata: JSON.stringify({ amount }),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Row builder
// ─────────────────────────────────────────────────────────────────────────

interface RowBuildContext {
  rng: Rng;
  providers: Record<string, ProviderConfig>;
  pricing: Record<string, Record<string, { input: number; output: number }>>;
}

function wireFamilyOf(apiType: string): 'chat' | 'messages' | 'gemini' {
  if (apiType === 'messages') return 'messages';
  if (apiType === 'gemini') return 'gemini';
  return 'chat'; // 'chat' and 'responses' are both OpenAI-wire
}

function pickIncomingApiType(rng: Rng, home: 'chat' | 'messages' | 'gemini'): string {
  const r = rng();
  if (r < 0.8) return home;
  if (home === 'chat' && r < 0.9) return 'responses';
  const others = (['chat', 'messages', 'gemini'] as const).filter((t) => t !== home);
  return pick(rng, others);
}

function buildUsageRow(
  ctx: RowBuildContext,
  startTime: number,
  keyName: string,
  aliasEntry: AliasPoolEntry,
  forceSuccess: boolean
): GeneratedRow {
  const { rng, providers, pricing } = ctx;
  const aliasName = aliasEntry.name;
  const isEmbeddings = aliasEntry.config.type === 'embeddings';

  // In-order aliases (resilient) must try targets in the configured order;
  // everything else is a selector without a meaningfully-modeled order, so
  // we just use the configured order as a stand-in "preference" order.
  const story = buildAttemptStory(rng, aliasEntry.targets, providers, forceSuccess);

  const finalPricing = pricing[story.finalProvider]?.[story.finalModel] ?? { input: 0, output: 0 };

  const home = isEmbeddings ? 'chat' : (ALIAS_HOME_FAMILY[aliasName] ?? 'chat');
  const incomingApiType = isEmbeddings ? 'embeddings' : pickIncomingApiType(rng, home);
  const outgoingApiType = isEmbeddings
    ? 'embeddings'
    : outgoingApiTypeForProvider(story.finalProvider, providers);
  const isPassthrough = isEmbeddings || wireFamilyOf(incomingApiType) === outgoingApiType;

  // isStreamed: embeddings requests are never streamed (embeddings.ts has no
  // streaming branch at all); otherwise ~40% streamed.
  let isStreamed = !isEmbeddings && rng() < 0.4;

  // Terminal outcome: attempt-level failure is always 'error'. A successful
  // attempt can rarely turn into a post-hoc stream anomaly ('stall' requires
  // an active stream; 'timeout' can happen either way).
  let responseStatus: GeneratedRow['responseStatus'];
  if (story.outcome === 'error') {
    responseStatus = 'error';
  } else if (!forceSuccess && !isEmbeddings && rng() < 0.02) {
    if (isStreamed && rng() < 0.5) {
      responseStatus = 'stall';
      isStreamed = true; // stall is a streaming-only concept
    } else {
      responseStatus = 'timeout';
    }
  } else {
    responseStatus = 'success';
  }

  const retryHistory = JSON.stringify(story.attempts);
  const allAttemptedProviders = JSON.stringify(
    story.attempts.filter((a) => a.status !== 'skipped').map((a) => `${a.provider}/${a.model}`)
  );
  const attemptCount = story.attempts.length;

  // Tokens/cost/duration/energy depend heavily on the terminal outcome — see
  // task report for why (matches response-handler.ts/finalizeUsage.ts
  // exactly: no usage data at all on an outright failure; partial usage on a
  // stream that got cut off mid-flight).
  let tokensInput: number | null = null;
  let tokensOutput: number | null = null;
  let tokensReasoning: number | null = null;
  let tokensCached: number | null = null;
  let tokensCacheWrite: number | null = null;
  let cost: CostFields | null = null;
  let durationMs: number;
  let ttftMs: number | null = null;
  let tokensPerSec: number | null = null;
  let kwhUsed: number | null = null;
  let providerReportedCost: number | null = null;
  let tokensEstimated: 0 | 1 = 0;

  if (responseStatus === 'error') {
    durationMs = randInt(rng, 50, 600);
  } else {
    // Skewed toward shorter responses (most chat replies run a few hundred
    // tokens; very long ones are the tail, not the median) — rng()^4
    // concentrates mass near 0 before scaling up to the 1800 ceiling.
    const fullOutput = isEmbeddings ? 0 : Math.round(20 + Math.pow(rng(), 4) * 1780);
    tokensInput = randInt(rng, 80, 3000);
    tokensOutput = isEmbeddings
      ? 0
      : responseStatus === 'success'
        ? fullOutput
        : Math.max(1, Math.round(fullOutput * randFloat(rng, 0.05, 0.4))); // stall/timeout: partial stream

    if (!isEmbeddings && responseStatus === 'success') {
      if (rng() < 0.15) tokensReasoning = randInt(rng, 10, 300);
      if (rng() < 0.15)
        tokensCached = randInt(rng, 10, Math.max(10, Math.round(tokensInput * 0.4)));
      if (rng() < 0.08) tokensCacheWrite = randInt(rng, 10, 200);
      if (rng() < 0.03) tokensEstimated = 1;
    }

    cost = buildCostFields(
      rng,
      tokensInput,
      tokensOutput,
      tokensCached ?? 0,
      tokensCacheWrite ?? 0,
      finalPricing
    );

    const outlier = !isEmbeddings && rng() < 0.1;
    // ~800-2000 tokens/sec generation (fast mock inference) plus fixed
    // connection/prefill overhead — keeps the non-outlier bulk snappy
    // (<2s for ~90% of the output-length distribution) so the explicit 10%
    // outlier band, plus the natural tail from the longest responses,
    // together land close to the brief's "~10% slow (2-5s)" target
    // (measured — see task report).
    const baseDuration = isEmbeddings
      ? randInt(rng, 80, 400)
      : randInt(rng, 150, 500) + tokensOutput * randFloat(rng, 0.5, 1.3);
    durationMs =
      responseStatus === 'stall' || responseStatus === 'timeout'
        ? randInt(rng, 3000, 8000)
        : outlier
          ? randInt(rng, 2000, 5000)
          : Math.round(baseDuration);

    if (isEmbeddings) {
      // embeddings.ts never sets ttftMs/tokensPerSec/kwhUsed — leave null.
    } else if (isStreamed) {
      ttftMs = Math.round(durationMs * randFloat(rng, 0.1, 0.35));
      const streamingMs = Math.max(1, durationMs - ttftMs);
      tokensPerSec = (tokensOutput / streamingMs) * 1000;
    } else {
      ttftMs = durationMs; // unary: ttft === full duration (finalizeUsage.ts)
      tokensPerSec = tokensOutput > 0 ? (tokensOutput / durationMs) * 1000 : null;
    }

    if (!isEmbeddings && responseStatus === 'success') {
      kwhUsed = Number((0.00004 + (tokensInput + tokensOutput * 3) * 0.0000008).toFixed(6));
      if (rng() < 0.05)
        providerReportedCost = round8((cost?.costTotal ?? 0) * randFloat(rng, 0.85, 1.15));
    }
  }

  const messageCount = isEmbeddings ? null : randInt(rng, 1, 12);
  const toolsDefined = isEmbeddings ? null : rng() < 0.3 ? randInt(rng, 1, 5) : 0;
  const hasTools = !isEmbeddings && (toolsDefined ?? 0) > 0;
  const parallelToolCallsEnabled = hasTools ? (rng() < 0.5 ? 1 : 0) : null;
  const toolCallsCount =
    hasTools && responseStatus === 'success' ? (rng() < 0.4 ? randInt(rng, 1, 3) : 0) : null;
  const finishReason =
    !isEmbeddings && responseStatus === 'success'
      ? pick(rng, ['stop', 'stop', 'stop', 'stop', 'length', 'tool_calls'])
      : null;

  const requestId = uuidLike(rng);

  return {
    requestId,
    date: new Date(startTime).toISOString(),
    sourceIp: '127.0.0.1',
    apiKey: keyName,
    attribution: null,
    incomingApiType,
    provider: story.finalProvider,
    attemptCount,
    retryHistory,
    incomingModelAlias: aliasName,
    canonicalModelName: aliasName,
    selectedModelName: story.finalModel,
    // Non-chat routes (embeddings/transcriptions/speech/images) write NULL
    // final_attempt_provider/model on the live path (see
    // quota-enforcer.ts's recomputeQuota comment + embeddings.ts, which never
    // assigns these fields) — mirrored here even though retryHistory/
    // allAttemptedProviders ARE populated for embeddings rows.
    finalAttemptProvider: isEmbeddings ? null : story.finalProvider,
    finalAttemptModel: isEmbeddings ? null : story.finalModel,
    allAttemptedProviders,
    outgoingApiType,
    tokensInput,
    tokensOutput,
    tokensReasoning,
    tokensCached,
    tokensCacheWrite,
    costInput: cost?.costInput ?? null,
    costOutput: cost?.costOutput ?? null,
    costCached: cost?.costCached ?? null,
    costCacheWrite: cost?.costCacheWrite ?? null,
    costTotal: cost?.costTotal ?? null,
    costSource: cost?.costSource ?? null,
    costMetadata: cost?.costMetadata ?? null,
    startTime,
    durationMs,
    ttftMs,
    tokensPerSec,
    isStreamed: isStreamed ? 1 : 0,
    isPassthrough: isPassthrough ? 1 : 0,
    responseStatus,
    tokensEstimated,
    createdAt: startTime + (durationMs ?? 0),
    toolsDefined,
    messageCount,
    parallelToolCallsEnabled,
    toolCallsCount,
    finishReason,
    // Task 2's seed-data.ts sets use_image_fallthrough: false on every
    // alias (ALIAS_BASE), so vision fallthrough is architecturally dead code
    // for this dataset — never fabricated true here (see task report).
    isVisionFallthrough: 0,
    isDescriptorRequest: 0,
    visionFallthroughModel: null,
    kwhUsed,
    providerReportedCost,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// request_usage generation + insert
// ─────────────────────────────────────────────────────────────────────────

const TOTAL_REQUESTS = 10_000;
/** The deliberately-tight quota Task 2 seeds (`dev-tiny-daily` on the
 * `free-tier` key). Its in-window (today UTC, so far) success+chat volume is
 * topped up to NEAR_LIMIT_FRACTION of whatever limit seed-data.ts currently
 * gives that quota (read live off ConfigSeedResult in seedTelemetryPhase, not
 * hardcoded) — so the near/over-limit story survives config tuning. */
const NEAR_LIMIT_KEY = 'free-tier';
const NEAR_LIMIT_QUOTA = 'dev-tiny-daily';
const NEAR_LIMIT_FRACTION = 0.92;

interface RequestGenResult {
  rows: GeneratedRow[];
  nearLimitWindowUsage: number;
}

function generateRequestUsageRows(
  rng: Rng,
  anchor: number,
  providers: Record<string, ProviderConfig>,
  keyAliasPools: Record<string, AliasPoolEntry[]>,
  nearLimitTarget: number
): RequestGenResult {
  const pricing = buildPricingMap(providers);
  const ctx: RowBuildContext = { rng, providers, pricing };
  const cumWeights = buildHourlyCumWeights(anchor);

  const keyPool = Object.keys(keyAliasPools).map((name) => ({
    name,
    weight: KEY_WEIGHTS[name] ?? 1,
  }));

  const todayStart = getWindowStart('daily', anchor);
  const rows: GeneratedRow[] = [];
  const usedIds = new Set<string>();
  let nearLimitWindowUsage = 0;

  const pushRow = (row: GeneratedRow) => {
    // uuidLike collisions are astronomically unlikely but guarded anyway —
    // determinism-safe (same PRNG draws either way) and keeps requestId
    // uniqueness guaranteed for the DB's UNIQUE constraint.
    while (usedIds.has(row.requestId)) row.requestId = uuidLike(rng);
    usedIds.add(row.requestId);
    rows.push(row);
    if (
      row.apiKey === NEAR_LIMIT_KEY &&
      row.responseStatus === 'success' &&
      row.finalAttemptProvider != null &&
      row.startTime >= todayStart &&
      row.startTime <= anchor
    ) {
      nearLimitWindowUsage++;
    }
  };

  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    const startTime = pickTimestamp(rng, anchor, cumWeights);
    const keyEntry = pickWeighted(rng, keyPool);
    const aliasEntry = pickWeighted(rng, keyAliasPools[keyEntry.name]!);
    pushRow(buildUsageRow(ctx, startTime, keyEntry.name, aliasEntry, false));
  }

  // Top up the near-limit key's "today so far" volume to the target. Only
  // non-embeddings aliases are eligible so every top-up row counts toward
  // the quota (recompute excludes NULL final_attempt_provider rows).
  const nearLimitPool = (keyAliasPools[NEAR_LIMIT_KEY] ?? []).filter(
    (a) => a.config.type !== 'embeddings'
  );
  if (nearLimitPool.length > 0) {
    while (nearLimitWindowUsage < nearLimitTarget) {
      const startTime = todayStart + Math.floor(rng() * Math.max(1, anchor - todayStart));
      const aliasEntry = pickWeighted(rng, nearLimitPool);
      pushRow(buildUsageRow(ctx, startTime, NEAR_LIMIT_KEY, aliasEntry, true));
    }
  }

  return { rows, nearLimitWindowUsage };
}

async function insertRequestUsageRows(rows: GeneratedRow[]): Promise<void> {
  const db = getDatabase();
  const schema = getSchema();
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db.insert(schema.requestUsage).values(batch);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// debug_logs — via UsageStorageService.saveDebugLog (JSON-stringifies blobs)
// ─────────────────────────────────────────────────────────────────────────

const SAMPLE_USER_MESSAGES = [
  'Summarize the quarterly report in three bullet points.',
  'Write a haiku about distributed systems.',
  'What is the time complexity of quicksort in the average case?',
  'Draft a polite follow-up email to a client.',
  'Explain the difference between TCP and UDP.',
  'Generate a regex that matches US phone numbers.',
  'Translate "good morning" into French, Spanish, and Japanese.',
  'Refactor this function to be more readable.',
];

const SAMPLE_ASSISTANT_MESSAGES = [
  'Here is a concise summary of the quarterly report...',
  'Silent packets flow\nthrough distributed systems now\nconsensus at dawn.',
  'Quicksort runs in O(n log n) time on average...',
  'Subject: Following up on our last conversation...',
  'TCP is connection-oriented and guarantees delivery, while UDP is connectionless...',
  String.raw`^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$`,
  'Bonjour, Buenos dias, Ohayo gozaimasu.',
  'Here is a refactored version of the function...',
];

function buildWireBodies(
  rng: Rng,
  row: GeneratedRow
): { rawRequest: unknown; rawResponse: unknown } {
  const userMsg = pick(rng, SAMPLE_USER_MESSAGES);
  const assistantMsg = pick(rng, SAMPLE_ASSISTANT_MESSAGES);

  if (row.outgoingApiType === 'messages') {
    return {
      rawRequest: {
        model: row.selectedModelName,
        max_tokens: 1024,
        messages: [{ role: 'user', content: userMsg }],
      },
      rawResponse:
        row.responseStatus === 'success'
          ? {
              id: `msg_${uuidLike(rng).replace(/-/g, '').slice(0, 24)}`,
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: assistantMsg }],
              usage: { input_tokens: row.tokensInput ?? 0, output_tokens: row.tokensOutput ?? 0 },
            }
          : { type: 'error', error: { type: 'api_error', message: 'upstream request failed' } },
    };
  }
  if (row.outgoingApiType === 'gemini') {
    return {
      rawRequest: { contents: [{ role: 'user', parts: [{ text: userMsg }] }] },
      rawResponse:
        row.responseStatus === 'success'
          ? {
              candidates: [{ content: { role: 'model', parts: [{ text: assistantMsg }] } }],
              usageMetadata: {
                promptTokenCount: row.tokensInput ?? 0,
                candidatesTokenCount: row.tokensOutput ?? 0,
              },
            }
          : { error: { code: 500, message: 'upstream request failed', status: 'INTERNAL' } },
    };
  }
  return {
    rawRequest: {
      model: row.selectedModelName,
      stream: !!row.isStreamed,
      messages: [{ role: 'user', content: userMsg }],
    },
    rawResponse:
      row.responseStatus === 'success'
        ? {
            id: `chatcmpl-${uuidLike(rng).replace(/-/g, '').slice(0, 24)}`,
            object: 'chat.completion',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: assistantMsg },
                finish_reason: row.finishReason,
              },
            ],
            usage: {
              prompt_tokens: row.tokensInput ?? 0,
              completion_tokens: row.tokensOutput ?? 0,
              total_tokens: (row.tokensInput ?? 0) + (row.tokensOutput ?? 0),
            },
          }
        : { error: { message: 'upstream request failed', type: 'server_error', code: null } },
  };
}

async function generateAndInsertDebugLogs(
  rng: Rng,
  anchor: number,
  rows: GeneratedRow[]
): Promise<number> {
  const usageStorage = new UsageStorageService();
  const errorRows = rows.filter((r) => r.responseStatus !== 'success');
  const recentSuccessRows = rows.filter(
    (r) => r.responseStatus === 'success' && anchor - r.startTime <= 48 * HOUR_MS
  );

  const errorSample = sampleWithoutReplacement(rng, errorRows, 18);
  const successSample = sampleWithoutReplacement(rng, recentSuccessRows, 12);
  const chosen = [...errorSample, ...successSample];

  let written = 0;
  for (let i = 0; i < chosen.length; i++) {
    const row = chosen[i]!;
    const { rawRequest, rawResponse } = buildWireBodies(rng, row);
    const captureHeaders = i < 8; // comfortably >=1 row with headers captured

    const record: DebugLogRecord = {
      requestId: row.requestId,
      apiKey: row.apiKey,
      rawRequest,
      transformedRequest: rawRequest,
      rawResponse,
      transformedResponse: rawResponse,
      requestHeaders: captureHeaders
        ? {
            'content-type': 'application/json',
            authorization: 'Bearer sk-***redacted***',
            'user-agent': 'plexus-dev-seed/1.0',
          }
        : undefined,
      responseHeaders: captureHeaders
        ? { 'content-type': 'application/json', 'x-request-id': row.requestId }
        : undefined,
      // stall/timeout rows got a real 200 response before the stream died
      // mid-flight (see response-handler.ts: both statuses only ever get set
      // inside the streaming branch, after a response was already obtained)
      // — only genuine 'error' rows get an error status code here.
      responseStatus: row.responseStatus === 'error' ? pick(rng, [400, 429, 500, 502]) : 200,
      createdAt: row.startTime + (row.durationMs ?? 0),
    };
    await usageStorage.saveDebugLog(record);
    written++;
  }

  // saveDebugLog() catches insert errors internally (logs, doesn't throw) —
  // `written` alone counts attempts, not persisted rows. The table was
  // cleared at phase start, so an exact COUNT(*) catches any swallowed
  // failure loudly instead of silently under-seeding.
  const persisted = await countRows(getSchema().debugLogs);
  if (persisted !== written) {
    throw new Error(
      `debug_logs backfill: attempted ${written} writes but ${persisted} persisted — ` +
        `saveDebugLog swallowed an insert error (see logger output above)`
    );
  }
  return written;
}

/** Uniform random sample of `count` items without replacement (whole pool if
 * smaller). */
function sampleWithoutReplacement<T>(rng: Rng, pool: T[], count: number): T[] {
  if (pool.length <= count) return pool.slice();
  const copy = pool.slice();
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy[idx]!);
    copy.splice(idx, 1);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// inference_errors — via UsageStorageService.saveError
// ─────────────────────────────────────────────────────────────────────────

/**
 * Mirrors UsageStorageService.saveError()'s private normalizeErrorDetails()
 * exactly: a non-string `providerResponse` gets JSON.stringify'd (2-space
 * indent) in place before the whole `details` object is stringified.
 */
function normalizeErrorDetailsLike(details: Record<string, unknown>): string {
  const providerResponse = details.providerResponse;
  const normalized =
    providerResponse != null && typeof providerResponse !== 'string'
      ? { ...details, providerResponse: JSON.stringify(providerResponse, null, 2) }
      : details;
  return JSON.stringify(normalized);
}

/**
 * Raw insert mirroring UsageStorageService.saveError()'s serialization
 * exactly (field names, normalizeErrorDetails JSON shape) rather than
 * calling the service directly: saveError() hardcodes `date: new
 * Date().toISOString()` and `createdAt: Date.now()` internally with no way
 * to override them, which would make this table non-deterministic across
 * two runs with the same PLEXUS_SEED_ANCHOR (verified — see task report).
 * Every other value here matches what saveError(requestId, error, details,
 * apiKey) would have written.
 */
async function generateAndInsertInferenceErrors(
  rng: Rng,
  rows: GeneratedRow[],
  mockPort: number
): Promise<number> {
  const db = getDatabase();
  const schema = getSchema();
  const errorRows = rows.filter((r) => r.responseStatus === 'error');
  const sample = sampleWithoutReplacement(rng, errorRows, 80);

  const values = sample.map((row, i) => {
    const attempts: RetryAttemptRecordLike[] = JSON.parse(row.retryHistory);
    const lastAttempt = attempts[attempts.length - 1];
    const statusCode = lastAttempt?.statusCode ?? 500;
    const includeExtras = i < 20; // several with providerResponse + headers
    const errorMessage = lastAttempt?.reason ?? 'All targets failed';
    const recordedAt = row.startTime + (row.durationMs ?? 0);

    const details: Record<string, unknown> = {
      provider: row.provider,
      targetModel: row.selectedModelName,
      targetApiType: row.outgoingApiType,
      statusCode,
      url:
        row.outgoingApiType === 'messages'
          ? `http://localhost:${mockPort}/v1/messages`
          : row.outgoingApiType === 'gemini'
            ? `http://localhost:${mockPort}/v1beta/models/${row.selectedModelName}:generateContent`
            : `http://localhost:${mockPort}/v1/chat/completions`,
    };
    if (includeExtras) {
      details.providerResponse = { error: { message: errorMessage, code: statusCode } };
      details.headers = { 'content-type': 'application/json', 'retry-after': '2' };
    }

    return {
      requestId: row.requestId,
      date: new Date(recordedAt).toISOString(),
      apiKey: row.apiKey,
      errorMessage,
      errorStack: `Error: ${errorMessage}\n    at Dispatcher.dispatch (dispatcher.ts:636)\n    at process.processTicksAndRejections (node:internal/process/task_queues)`,
      details: normalizeErrorDetailsLike(details),
      createdAt: recordedAt,
    };
  });

  const BATCH_SIZE = 200;
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    await db.insert(schema.inferenceErrors).values(values.slice(i, i + BATCH_SIZE));
  }
  return values.length;
}

// ─────────────────────────────────────────────────────────────────────────
// mcp_request_usage — via McpUsageStorageService.saveRequest. Mixes the
// Task-2 seeded remote server ('mock-tools') and the built-in management
// server ('plexus' — routes/mcp/plexus.ts hardcodes this name + api_key).
// createdAt is TEXT ISO on SQLite (toDbTimestamp) per the timestamp regime.
// ─────────────────────────────────────────────────────────────────────────

const MCP_TOOL_NAMES = ['echo', 'current_time'] as const;

async function generateAndInsertMcpUsage(
  rng: Rng,
  anchor: number,
  mockToolsUpstreamUrl: string,
  keyNames: string[]
): Promise<number> {
  const mcpUsageStorage = new McpUsageStorageService();
  const cumWeights = buildHourlyCumWeights(anchor);
  const TOTAL_MCP = 300;
  let written = 0;

  for (let i = 0; i < TOTAL_MCP; i++) {
    const startTime = pickTimestamp(rng, anchor, cumWeights);
    const isBuiltin = rng() < 0.15;
    const durationMs = randInt(rng, 30, 1200);
    const success = rng() < 0.94;

    if (isBuiltin) {
      const jsonrpcMethod = pick(rng, [
        'initialize',
        'notifications/initialized',
        'tools/list',
        'tools/list',
      ]);
      await mcpUsageStorage.saveRequest({
        request_id: uuidLike(rng),
        created_at: new Date(startTime).toISOString(),
        start_time: startTime,
        duration_ms: durationMs,
        server_name: 'plexus',
        upstream_url: '/mcp/plexus',
        method: 'POST',
        jsonrpc_method: jsonrpcMethod,
        tool_name: null,
        api_key: 'admin',
        attribution: null,
        source_ip: '127.0.0.1',
        response_status: success ? 200 : pick(rng, [400, 500]),
        is_streamed: false,
        has_debug: false,
        error_code: success ? null : 'MCP_ERROR',
        error_message: success ? null : 'MCP request failed',
      });
    } else {
      const method = rng() < 0.7 ? 'POST' : rng() < 0.67 ? 'GET' : 'DELETE';
      const jsonrpcMethod =
        method === 'POST'
          ? pick(rng, [
              'initialize',
              'notifications/initialized',
              'tools/list',
              'tools/call',
              'tools/call',
              'tools/call',
            ])
          : null;
      const toolName = jsonrpcMethod === 'tools/call' ? pick(rng, MCP_TOOL_NAMES) : null;
      const apiKey = pick(rng, keyNames);
      await mcpUsageStorage.saveRequest({
        request_id: uuidLike(rng),
        created_at: new Date(startTime).toISOString(),
        start_time: startTime,
        duration_ms: durationMs,
        server_name: 'mock-tools',
        upstream_url: mockToolsUpstreamUrl,
        method,
        jsonrpc_method: jsonrpcMethod,
        tool_name: toolName,
        api_key: apiKey,
        attribution: null,
        source_ip: '127.0.0.1',
        response_status: success ? 200 : pick(rng, [400, 404, 500, 502, 504]),
        is_streamed: method === 'GET',
        has_debug: false,
        error_code: success ? null : 'PROXY_ERROR',
        error_message: success ? null : 'upstream proxy error',
      });
    }
    written++;
  }

  // Same swallowed-error guard as debug_logs: McpUsageStorageService
  // .saveRequest() catches insert errors internally, so verify the exact
  // persisted count (table cleared at phase start) and fail loudly.
  const persisted = await countRows(getSchema().mcpRequestUsage);
  if (persisted !== written) {
    throw new Error(
      `mcp_request_usage backfill: attempted ${written} writes but ${persisted} persisted — ` +
        `saveRequest swallowed an insert error (see logger output above)`
    );
  }
  return written;
}

// ─────────────────────────────────────────────────────────────────────────
// meter_snapshots — raw inserts (no public helper exists) matching what
// QuotaScheduler.persistResult writes. checkerId/meterKey are derived via
// deriveActiveCheckers() (mirroring config-service.ts exactly) so live
// checks append to the SAME series. Cadence: hourly for the last 48h,
// ~6-hourly back to 30d (~160 points/meter). timestamp_ms regime throughout
// (toDbTimestampMs).
//
// Multi-account (oauthAccountId) investigation: meter_snapshots has NO
// oauthAccountId (or equivalent) column on either dialect (see
// drizzle/schema/{sqlite,postgres}/meter-snapshots.ts), and the Quotas UI's
// per-checker oauthAccountId (routes/management/quotas.ts's
// getOAuthMetadata()) is sourced live from the checker's CURRENT config
// (`quotaConfig.options.oauthAccountId`), not grouped from history at all —
// `getQuotaHistory` filters strictly by checkerId+meterKey. Since a
// checkerId maps 1:1 to a provider (and thus to at most one linked OAuth
// account), there is no mechanism — live or historical — for one checker's
// series to carry two accounts' data. Skipped per the brief's own escape
// hatch; see task report for the full trail.
// ─────────────────────────────────────────────────────────────────────────

type MeterStatus = 'ok' | 'warning' | 'critical' | 'exhausted';

function deriveMeterStatus(utilizationPercent: number): MeterStatus {
  if (utilizationPercent >= 100) return 'exhausted';
  if (utilizationPercent >= 90) return 'critical';
  if (utilizationPercent >= 75) return 'warning';
  return 'ok';
}

function buildMeterTimestamps(anchor: number): number[] {
  const points: number[] = [];
  for (let ageMs = THIRTY_DAYS_MS; ageMs > 48 * HOUR_MS; ageMs -= 6 * HOUR_MS) {
    points.push(anchor - ageMs);
  }
  for (let ageMs = 48 * HOUR_MS; ageMs >= 0; ageMs -= HOUR_MS) {
    points.push(anchor - ageMs);
  }
  return points; // ascending time order, oldest -> now
}

interface AllowanceMeterSpec {
  key: 'rolling_5h' | 'search_hourly' | 'weekly_credits';
  label: string;
  unit: string;
  group?: string;
  scope?: string;
  periodValue: number;
  periodUnit: string;
  periodCycle: string;
  max: number;
  periodMs: number;
}

/** Mirrors synthetic-checker.ts's three ctx.allowance() calls exactly. */
const ALLOWANCE_METERS: AllowanceMeterSpec[] = [
  {
    key: 'rolling_5h',
    label: 'Rolling 5-hour limit',
    unit: 'requests',
    periodValue: 5,
    periodUnit: 'hour',
    periodCycle: 'rolling',
    max: MOCK_QUOTA.rollingMax,
    periodMs: 5 * HOUR_MS,
  },
  {
    key: 'search_hourly',
    label: 'Search',
    unit: 'requests',
    scope: 'search',
    periodValue: 1,
    periodUnit: 'hour',
    periodCycle: 'fixed',
    max: MOCK_QUOTA.hourlyLimit,
    periodMs: HOUR_MS,
  },
  {
    key: 'weekly_credits',
    label: 'Weekly token credits',
    unit: 'usd',
    periodValue: 7,
    periodUnit: 'day',
    periodCycle: 'rolling',
    max: MOCK_QUOTA.weeklyMax,
    periodMs: 7 * DAY_MS,
  },
];

/** Per-checker utilization-fraction trajectory (oldest -> now), matching the
 * brief's stories: ok stable low, warning trending up, critical climbing,
 * exhausted pinned at 100%. */
function fracTrajectory(
  story: 'ok' | 'warning' | 'critical' | 'exhausted',
  t: number,
  rng: Rng
): number {
  const jitter = randFloat(rng, -0.02, 0.02);
  if (story === 'exhausted') return 1;
  if (story === 'ok') return clamp01(0.32 + jitter);
  if (story === 'warning') return clamp01(0.35 + t * 0.48 + jitter); // -> ~0.83
  return clamp01(0.55 + t * 0.4 + jitter); // critical: -> ~0.95
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

interface MeterSnapshotRow {
  checkerId: string;
  checkerType: string;
  provider: string;
  meterKey: string;
  kind: 'balance' | 'allowance';
  unit: string;
  label: string;
  group: string | null;
  scope: string | null;
  limit: number | null;
  used: number | null;
  remaining: number | null;
  utilizationState: 'reported' | 'not_applicable';
  utilizationPercent: number | null;
  status: MeterStatus;
  periodValue: number | null;
  periodUnit: string | null;
  periodCycle: string | null;
  resetsAt: Date | number | null;
  success: boolean;
  errorMessage: null;
  checkedAt: Date | number;
  createdAt: Date | number;
}

/** Provider -> story mapping, grounded in seed-data.ts's own quota_checker
 * endpoints (mock-openai -> /quota/warning, mock-anthropic ->
 * /quota/critical, mock-gemini -> /quota/ok, mock-cohere ->
 * /quota/exhausted, mock-openrouter -> /balance; flaky-lab deliberately has
 * NO checker — see the seed-data.ts comment there). */
const PROVIDER_STORY: Record<string, 'ok' | 'warning' | 'critical' | 'exhausted'> = {
  'mock-openai': 'warning',
  'mock-anthropic': 'critical',
  'mock-gemini': 'ok',
  'mock-cohere': 'exhausted',
};

function generateMeterSnapshotRows(
  rng: Rng,
  anchor: number,
  checkers: CheckerInfo[],
  dialect: 'sqlite' | 'postgres'
): MeterSnapshotRow[] {
  const timestamps = buildMeterTimestamps(anchor);
  const rows: MeterSnapshotRow[] = [];

  for (const checker of checkers) {
    if (checker.checkerType === 'synthetic') {
      const story = PROVIDER_STORY[checker.provider] ?? 'ok';
      for (const meterSpec of ALLOWANCE_METERS) {
        for (let idx = 0; idx < timestamps.length; idx++) {
          const checkedAtMs = timestamps[idx]!;
          const t = idx / Math.max(1, timestamps.length - 1);
          const frac = fracTrajectory(story, t, rng);
          const used = Math.round(meterSpec.max * frac);
          const remaining = Math.max(0, meterSpec.max - used);
          const utilizationPercent = Math.min(100, (used / meterSpec.max) * 100);
          const resetsAtMs =
            checkedAtMs + randInt(rng, Math.floor(meterSpec.periodMs * 0.1), meterSpec.periodMs);

          rows.push({
            checkerId: checker.checkerId,
            checkerType: checker.checkerType,
            provider: checker.provider,
            meterKey: meterSpec.key,
            kind: 'allowance',
            unit: meterSpec.unit,
            label: meterSpec.label,
            group: meterSpec.group ?? null,
            scope: meterSpec.scope ?? null,
            limit: meterSpec.max,
            used,
            remaining,
            utilizationState: 'reported',
            utilizationPercent,
            status: deriveMeterStatus(utilizationPercent),
            periodValue: meterSpec.periodValue,
            periodUnit: meterSpec.periodUnit,
            periodCycle: meterSpec.periodCycle,
            resetsAt: toDbTimestampMs(resetsAtMs, dialect),
            success: true,
            errorMessage: null,
            checkedAt: toDbTimestampMs(checkedAtMs, dialect)!,
            createdAt: toDbTimestampMs(checkedAtMs, dialect)!,
          });
        }
      }
    } else if (checker.checkerType === 'hyper') {
      for (let idx = 0; idx < timestamps.length; idx++) {
        const checkedAtMs = timestamps[idx]!;
        const t = idx / Math.max(1, timestamps.length - 1);
        // Balance decays from ~$480 toward ~$310 (see brief), within the
        // mock's own /balance range [5, 500].
        const remaining = clampRange(480 - t * 170 + randFloat(rng, -8, 8), MOCK_BALANCE_RANGE);
        rows.push({
          checkerId: checker.checkerId,
          checkerType: checker.checkerType,
          provider: checker.provider,
          meterKey: 'balance',
          kind: 'balance',
          unit: 'credits',
          label: 'Account balance',
          group: null,
          scope: null,
          limit: null,
          used: null,
          remaining: Number(remaining.toFixed(2)),
          utilizationState: 'not_applicable',
          utilizationPercent: null,
          // Matches the real hyper-checker: with no limit/used, ctx.balance()
          // always derives utilization='not_applicable' -> status 'ok'.
          status: 'ok',
          periodValue: null,
          periodUnit: null,
          periodCycle: null,
          resetsAt: null,
          success: true,
          errorMessage: null,
          checkedAt: toDbTimestampMs(checkedAtMs, dialect)!,
          createdAt: toDbTimestampMs(checkedAtMs, dialect)!,
        });
      }
    }
  }
  return rows;
}

function clampRange(n: number, range: readonly [number, number]): number {
  return Math.max(range[0], Math.min(range[1], n));
}

async function insertMeterSnapshotRows(rows: MeterSnapshotRow[]): Promise<void> {
  const db = getDatabase();
  const schema = getSchema();
  const BATCH_SIZE = 400;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db.insert(schema.meterSnapshots).values(batch);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// quota_state
//
// Investigation verdict (see task report for the full trail): the live
// `POST /v0/management/quota/recompute` route (routes/management/
// quota-enforcement.ts) is a TARGETED per-(key,quota) repair tool — it
// requires an explicit key+quota body and only reconstructs THAT ONE bucket
// from request_usage (QuotaEnforcer.recomputeQuota). It does not rebuild
// quota_state wholesale. Since Task 4's ticker calls it once at startup for
// (presumably) just the near-limit demo pair, every OTHER quota/key
// combination would show no quota_state row at all — an empty Quotas/Keys
// page — unless seeded directly. So: seed quota_state directly for every
// resolved (key, quota) pair from Task 2's config, timestamp_ms regime,
// including the near-limit key at ~92% and the rest healthy (one -
// dev-warn-cost - deliberately just above its warnAt threshold as a bonus).
// This is also why the near-limit key's request_usage volume is engineered
// to match this row exactly: whichever path a later task takes (trust this
// seeded row, or call recompute live), the numbers agree.
// ─────────────────────────────────────────────────────────────────────────

interface QuotaStateRow {
  keyName: string;
  quotaName: string;
  limitType: string;
  currentUsage: number;
  lastUpdated: Date | number;
  windowStart: Date | number | null;
}

function generateQuotaStateRows(
  anchor: number,
  config: ConfigSeedResult,
  dialect: 'sqlite' | 'postgres',
  nearLimitWindowUsage: number
): QuotaStateRow[] {
  const rows: QuotaStateRow[] = [];
  const lastUpdated = toDbTimestampMs(anchor, dialect)!;
  const defaultQuotaNames = (config.settings['default_quotas'] as string[] | undefined) ?? [];

  const resolveNames = (key: KeyConfig): string[] =>
    key.quotas && key.quotas.length > 0 ? key.quotas : defaultQuotaNames;

  // Group keys by resolved quota name (mirrors QuotaEnforcer.keysAttachingQuota).
  const keysByQuota = new Map<string, string[]>();
  for (const [keyName, keyConfig] of Object.entries(config.keys)) {
    for (const quotaName of resolveNames(keyConfig)) {
      const list = keysByQuota.get(quotaName) ?? [];
      list.push(keyName);
      keysByQuota.set(quotaName, list);
    }
  }

  for (const [quotaName, def] of Object.entries(config.userQuotas)) {
    const attachedKeys = keysByQuota.get(quotaName) ?? [];
    if (attachedKeys.length === 0) continue;
    const owner = def.shared ? SHARED_OWNER : null;

    if (def.type === 'rolling' && def.limitType !== 'cost') {
      // Leaky bucket — windowStart is always null (see upsertQuotaState).
      // Shared defs pool into ONE '*' bucket regardless of how many keys
      // attach (emitting one row per attached key would collide on the
      // (key_name, quota_name) composite PK).
      const bucketOwners = owner === SHARED_OWNER ? [SHARED_OWNER] : attachedKeys;
      for (const bucketOwner of bucketOwners) {
        // Healthy, well under limit; the ticker key idles lower.
        const fraction = bucketOwner === 'dev-ticker' ? 0.12 : 0.68;
        rows.push({
          keyName: bucketOwner,
          quotaName,
          limitType: def.limitType,
          currentUsage: Math.round(def.limit * fraction),
          lastUpdated,
          windowStart: null,
        });
      }
      continue;
    }

    // Calendar (daily/weekly/monthly) or rolling-cost — windowStart aligns
    // to the current period boundary as of `anchor`.
    let windowStartMs: number;
    if (def.type === 'rolling') {
      const durationMs = parseDuration(def.duration ?? '') ?? undefined;
      windowStartMs = durationMs ? Math.floor(anchor / durationMs) * durationMs : anchor;
    } else {
      windowStartMs = getWindowStart(def.type, anchor);
    }
    const windowStart = toDbTimestampMs(windowStartMs, dialect);

    if (owner === SHARED_OWNER) {
      // Single pooled bucket regardless of how many keys attach.
      const currentUsage = quotaName === 'dev-weekly-cost' ? 62 : def.limit * 0.4;
      rows.push({
        keyName: SHARED_OWNER,
        quotaName,
        limitType: def.limitType,
        currentUsage: Number(currentUsage.toFixed(4)),
        lastUpdated,
        windowStart,
      });
      continue;
    }

    for (const keyName of attachedKeys) {
      let currentUsage: number;
      if (keyName === NEAR_LIMIT_KEY && quotaName === NEAR_LIMIT_QUOTA) {
        currentUsage = nearLimitWindowUsage;
      } else if (quotaName === 'dev-warn-cost') {
        currentUsage = def.limit * 0.88; // just above warnAt (0.8), under limit
      } else if (quotaName === 'dev-monthly-requests') {
        currentUsage = Math.round(def.limit * 0.15);
      } else if (quotaName === 'dev-scoped-anthropic') {
        currentUsage = Math.round(def.limit * 0.36);
      } else {
        currentUsage = Math.round(def.limit * 0.3);
      }
      rows.push({
        keyName,
        quotaName,
        limitType: def.limitType,
        currentUsage: Number(currentUsage.toFixed(4)),
        lastUpdated,
        windowStart,
      });
    }
  }

  return rows;
}

async function insertQuotaStateRows(rows: QuotaStateRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDatabase();
  const schema = getSchema();
  await db.insert(schema.quotaState).values(rows);
}

// ─────────────────────────────────────────────────────────────────────────
// Phase-owned table lifecycle
// ─────────────────────────────────────────────────────────────────────────

/**
 * Clears the six telemetry tables this phase owns before backfilling.
 *
 * Required for `--force` re-seeds: `ConfigRepository.clearAllData()` clears
 * only CONFIG tables, so prior telemetry survives it — and since the
 * fixed-seed PRNG regenerates identical requestIds, the very first
 * request_usage batch would then violate its UNIQUE(request_id) constraint
 * (quota_state's composite PK and mcp_request_usage.request_id collide the
 * same way), crashing Phase 2 after Phase 1 already mutated config and
 * before the marker file is written. Clearing here makes a re-seed REPLACE
 * old telemetry outright (also preventing mixed-anchor history). On a fresh
 * DB these deletes are cheap no-ops. Only ever reached when seed-dev.ts has
 * decided to seed (fresh DB or explicit --force) — the existing-DB guard
 * exits before Phase 2, so a user's own telemetry is never touched.
 */
async function clearTelemetryTables(): Promise<void> {
  const db = getDatabase();
  const schema = getSchema();
  await db.delete(schema.debugLogs);
  await db.delete(schema.inferenceErrors);
  await db.delete(schema.mcpRequestUsage);
  await db.delete(schema.meterSnapshots);
  await db.delete(schema.quotaState);
  await db.delete(schema.requestUsage);
}

/** Exact COUNT(*) of a phase-owned table (exact because the phase clears its
 * tables first). Lets callers fail loudly when a service write path
 * swallowed an insert error internally instead of throwing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countRows(table: any): Promise<number> {
  const db = getDatabase();
  const rows = await db.select({ n: sql<number>`COUNT(*)` }).from(table);
  return Number(rows[0]?.n ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────

export async function seedTelemetryPhase(
  config: ConfigSeedResult,
  anchor: number
): Promise<TelemetrySeedResult> {
  const start = Date.now();
  const dialect = getCurrentDialect();
  const rng = mulberry32(SEED);

  // Phase 2 owns these tables — always start from empty (see the
  // clearTelemetryTables doc for why this is load-bearing on --force).
  await clearTelemetryTables();

  const keyAliasPools = buildKeyAliasPools(config.aliases, config.keys);

  // Near-limit story target: ~92% of whatever limit the config phase gave
  // the tight quota — derived live, never hardcoded, so it tracks
  // seed-data.ts tuning.
  const nearLimitLimit = config.userQuotas[NEAR_LIMIT_QUOTA]?.limit ?? 50;
  const nearLimitTarget = Math.round(nearLimitLimit * NEAR_LIMIT_FRACTION);

  // ── request_usage ──────────────────────────────────────────────────────
  const { rows, nearLimitWindowUsage } = generateRequestUsageRows(
    rng,
    anchor,
    config.providers,
    keyAliasPools,
    nearLimitTarget
  );
  await insertRequestUsageRows(rows);

  // ── debug_logs ──────────────────────────────────────────────────────────
  const debugLogsWritten = await generateAndInsertDebugLogs(rng, anchor, rows);

  // ── inference_errors ────────────────────────────────────────────────────
  const inferenceErrorsWritten = await generateAndInsertInferenceErrors(rng, rows, config.mockPort);

  // ── mcp_request_usage ───────────────────────────────────────────────────
  const mockTools = config.mcpServers['mock-tools'];
  const mockToolsUpstreamUrl = mockTools?.mode === 'remote_http' ? mockTools.upstream_url : '';
  const mcpWritten = await generateAndInsertMcpUsage(
    rng,
    anchor,
    mockToolsUpstreamUrl,
    Object.keys(config.keys)
  );

  // ── meter_snapshots ─────────────────────────────────────────────────────
  const checkers = deriveActiveCheckers(config.providers);
  const meterRows = generateMeterSnapshotRows(rng, anchor, checkers, dialect);
  await insertMeterSnapshotRows(meterRows);

  // ── quota_state ─────────────────────────────────────────────────────────
  const quotaStateRows = generateQuotaStateRows(anchor, config, dialect, nearLimitWindowUsage);
  await insertQuotaStateRows(quotaStateRows);

  const elapsedMs = Date.now() - start;

  console.log('');
  console.log('Plexus telemetry backfill complete:');
  console.log(`  request_usage:     ${rows.length}`);
  console.log(`  debug_logs:        ${debugLogsWritten}`);
  console.log(`  inference_errors:  ${inferenceErrorsWritten}`);
  console.log(`  mcp_request_usage: ${mcpWritten}`);
  console.log(`  meter_snapshots:   ${meterRows.length}`);
  console.log(`  quota_state:       ${quotaStateRows.length}`);
  console.log(`  anchor:            ${new Date(anchor).toISOString()} (${anchor})`);
  console.log(`  elapsed:           ${elapsedMs}ms`);

  return {
    anchor,
    requestUsage: rows.length,
    debugLogs: debugLogsWritten,
    inferenceErrors: inferenceErrorsWritten,
    mcpRequestUsage: mcpWritten,
    meterSnapshots: meterRows.length,
    quotaState: quotaStateRows.length,
    elapsedMs,
    requestUsageInsertMode: 'raw-batch',
    nearLimitKey: {
      key: NEAR_LIMIT_KEY,
      quota: NEAR_LIMIT_QUOTA,
      usage: nearLimitWindowUsage,
      limit: nearLimitLimit,
    },
  };
}

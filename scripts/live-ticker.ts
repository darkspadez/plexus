#!/usr/bin/env bun
/**
 * live-ticker.ts
 *
 * Long-running HTTP client that drives real traffic through a seeded dev
 * Plexus instance so its admin panels visibly update: chat/embeddings
 * completions through the OpenAI-compatible gateway (the seeded providers
 * route these to the Task-1 mock upstream), periodic MCP gateway calls, and
 * organic failures/retries via the seeded flaky/resilient aliases.
 *
 * Runs as a managed child of `scripts/dev.ts` (a later task), but is fully
 * runnable standalone:
 *   bun run ticker
 *   bun run scripts/live-ticker.ts
 *
 * Runtime model: plain `fetch` client, Bun/Node built-ins only, zero new
 * dependencies. No runtime backend imports — the one sanctioned exception is
 * `packages/backend/scripts/seed-data.ts` (pure data: its only import is a
 * type-only `import type` from backend/src/config, which is erased entirely
 * at transpile time, so calling `buildKeys()`/`buildAliases()` here drags in
 * no runtime backend/DB module). Everything else this script knows about
 * Plexus's HTTP surface (route paths, auth headers, response shapes) comes
 * from reading the actual route source, not from importing it.
 *
 * Env:
 *   PLEXUS_PORT                 Target port (else derived like dev-config.ts:
 *                                DJB2 hash of the worktree dir name, same as
 *                                scripts/dev.ts — assumes cwd is the repo root).
 *   ADMIN_KEY                   Admin key for management-API calls (default 'password').
 *   PLEXUS_TICKER=0|off         Disable entirely; exits 0 immediately, before any
 *                                network activity.
 *   PLEXUS_TICKER_INTERVAL_MS   Override the base tick cadence (default 5500ms;
 *                                the actual per-tick delay is jittered to roughly
 *                                55%-145% of this, i.e. ~3-8s at the default).
 *   PLEXUS_TICKER_VERBOSE=1     Per-action log lines (default: terse, heartbeat only).
 *
 * Exit codes: 0 for every "nothing is wrong, there's just no traffic to send"
 * case (PLEXUS_TICKER=0/off, or a non-seeded instance via the marker gate) and
 * for a clean SIGINT/SIGTERM shutdown; 1 for an actual startup problem (health
 * check timeout, or the system-settings probe failing e.g. due to a bad
 * ADMIN_KEY). Once past startup the process runs forever and never exits on
 * its own — traffic errors are logged, not fatal (see "Never crash" below).
 */

import { basename } from 'node:path';
import { buildAliases, buildKeys } from '../packages/backend/scripts/seed-data';

// ─── PLEXUS_TICKER=0|off — checked first, before any setup or network I/O ──

const tickerFlag = (process.env.PLEXUS_TICKER ?? '').trim().toLowerCase();
if (tickerFlag === '0' || tickerFlag === 'off') {
  console.log(`[ticker] PLEXUS_TICKER=${process.env.PLEXUS_TICKER} — disabled, exiting.`);
  process.exit(0);
}

const VERBOSE = process.env.PLEXUS_TICKER_VERBOSE === '1';

function logAlways(line: string): void {
  console.log(`[ticker] ${line}`);
}

function logVerbose(line: string): void {
  if (VERBOSE) logAlways(line);
}

// ─── Port / target ───────────────────────────────────────────────────────
// Same DJB2 hash as scripts/dev-config.ts / scripts/dev.ts (root-relative —
// assumes cwd is the repo root, same precedent as every sibling dev script).

function derivePort(): number {
  const override = process.env.PLEXUS_PORT;
  if (override) {
    const parsed = Number(override);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const dirName = basename(process.cwd());
  let hash = 5381;
  for (let i = 0; i < dirName.length; i++) {
    hash = (hash * 33) ^ dirName.charCodeAt(i);
  }
  return 10000 + (Math.abs(hash) % 10000);
}

const PORT = derivePort();
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ADMIN_KEY = process.env.ADMIN_KEY || 'password';

// ─── Small helpers ───────────────────────────────────────────────────────

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[]): T {
  const item = items[randomInt(0, items.length - 1)];
  if (item === undefined) throw new Error('pick() called with an empty array');
  return item;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Weighted<T> {
  value: T;
  weight: number;
}

function weightedPick<T>(items: readonly Weighted<T>[]): T {
  const total = items.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of items) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return items[items.length - 1]!.value;
}

// Covers the WHOLE request including body consumption (see fetchWithTimeout),
// so it needs headroom over the worst honest path: a resilient call whose
// flaky leg stalls ~12s at the mock before failing over to a second leg that
// can itself take ~5s plus streaming time.
const REQUEST_TIMEOUT_MS = 30_000;

interface FetchedResponse {
  status: number;
  ok: boolean;
  text: string;
}

/**
 * fetch + FULL body consumption under one AbortController deadline. The
 * timer stays armed until `.text()` resolves — aborting the signal rejects
 * an in-flight body read — so a mid-body stall (upstream stops sending
 * without closing or erroring) aborts and surfaces as a catchable error
 * instead of wedging the tick forever with the deadline already disarmed.
 * Buffering via `.text()` is deliberate: it fully consumes streamed (SSE)
 * responses, which is all this ticker needs from a body.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<FetchedResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    return { status: response.status, ok: response.ok, text };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Seed data (single source of truth — see seed-data.ts) ──────────────

const SEED_KEYS = buildKeys();
const SEED_ALIASES = buildAliases();

interface KeyEntry {
  name: string;
  secret: string;
  allowedModels?: string[];
  excludedModels?: string[];
  excludedProviders?: string[];
}

const KEY_ENTRIES: KeyEntry[] = Object.entries(SEED_KEYS).map(([name, cfg]) => ({
  name,
  secret: cfg.secret,
  allowedModels: cfg.allowedModels,
  excludedModels: cfg.excludedModels,
  excludedProviders: cfg.excludedProviders,
}));

function keyEntry(name: string): KeyEntry {
  const found = KEY_ENTRIES.find((k) => k.name === name);
  if (!found) {
    throw new Error(`Seed key '${name}' not found — has seed-data.ts changed?`);
  }
  return found;
}

// Weighted rotation: 'dev-ticker' is the loopback-only key seed-data.ts
// carves out specifically for this ticker, so it (and the primary
// 'dev-admin' key) get the heavy weight; 'free-tier' is deliberately light —
// it's the near-limit key (dev-tiny-daily quota, ~92% used after seeding) and
// should stay near its limit rather than blow through it every tick, while
// still getting hit occasionally so quota enforcement shows activity (its
// 429s are expected — see isExpectedQuota below).
const KEY_WEIGHTS: Weighted<string>[] = [
  { value: 'dev-ticker', weight: 35 },
  { value: 'dev-admin', weight: 25 },
  { value: 'premium-tier', weight: 8 },
  { value: 'mobile-app', weight: 8 },
  { value: 'internal-tools', weight: 8 },
  { value: 'qa-automation', weight: 8 },
  { value: 'ci-pipeline', weight: 6 },
  { value: 'partner-acme', weight: 6 },
  { value: 'readonly-viewer', weight: 6 },
  { value: 'free-tier', weight: 4 },
];
// Fail fast at startup (not mid-run) if seed-data.ts ever renames/drops one of
// the keys this weighting table references.
for (const { value } of KEY_WEIGHTS) keyEntry(value);

// Alias pools, derived from seed-data.ts rather than hardcoded so a future
// rename/addition there is picked up automatically. Chat-typed aliases are
// exactly the ones with no `type` field set (embeddings/transcriptions/
// speech/image aliases all set one); 'resilient' and 'flaky-model-v1' are
// chat-typed too but pulled into their own pools since the tick logic treats
// them specially.
const RESILIENT_ALIAS = 'resilient';
const FLAKY_ALIAS = 'flaky-model-v1';

const ALIAS_ENTRIES = Object.entries(SEED_ALIASES);
const EMBEDDINGS_POOL = ALIAS_ENTRIES.filter(([, cfg]) => cfg.type === 'embeddings').map(
  ([name]) => name
);
const CHAT_POOL = ALIAS_ENTRIES.filter(
  ([name, cfg]) => !cfg.type && name !== RESILIENT_ALIAS && name !== FLAKY_ALIAS
).map(([name]) => name);
const FULL_POOL = [...CHAT_POOL, ...EMBEDDINGS_POOL, RESILIENT_ALIAS, FLAKY_ALIAS];

if (
  EMBEDDINGS_POOL.length === 0 ||
  CHAT_POOL.length === 0 ||
  !SEED_ALIASES[RESILIENT_ALIAS] ||
  !SEED_ALIASES[FLAKY_ALIAS]
) {
  throw new Error(
    'Expected seed-data.ts aliases (chat aliases, an embeddings alias, ' +
      `'${RESILIENT_ALIAS}', '${FLAKY_ALIAS}') are missing — has the schema changed?`
  );
}

// ─── Tick "kind" selection ───────────────────────────────────────────────

type TickKind = 'chat' | 'embeddings' | 'resilient' | 'flaky';

const P_RESILIENT = 1 / 8; // "roughly every ~8th tick"
const P_FLAKY = 1 / 15; // "roughly every ~15th tick"
const P_EMBEDDINGS = 0.1; // "occasionally"
const STREAM_PROBABILITY = 0.4;

function rollKind(): TickKind {
  const roll = Math.random();
  if (roll < P_RESILIENT) return 'resilient';
  if (roll < P_RESILIENT + P_FLAKY) return 'flaky';
  if (roll < P_RESILIENT + P_FLAKY + P_EMBEDDINGS) return 'embeddings';
  return 'chat';
}

function poolForKind(kind: TickKind): readonly string[] {
  switch (kind) {
    case 'resilient':
      return [RESILIENT_ALIAS];
    case 'flaky':
      return [FLAKY_ALIAS];
    case 'embeddings':
      return EMBEDDINGS_POOL;
    case 'chat':
      return CHAT_POOL;
  }
}

function classifyAlias(alias: string): TickKind {
  if (alias === RESILIENT_ALIAS) return 'resilient';
  if (alias === FLAKY_ALIAS) return 'flaky';
  if (EMBEDDINGS_POOL.includes(alias)) return 'embeddings';
  return 'chat';
}

/**
 * Narrows a candidate alias pool to what a key's own scoping allows.
 * Model-level (`allowedModels`/`excludedModels`) rejects the whole request
 * with a 403 if violated, so it's a strict filter here. Provider-level
 * exclusions only matter when they can eliminate an alias's LAST remaining
 * target; today only 'flaky-model-v1' (single target, provider flaky-lab) is
 * at risk — an excludedProviders match there is filtered out, whereas
 * 'resilient' (two targets, only one of which is flaky-lab) just quietly
 * falls back to its stable target and needs no filtering.
 */
function restrictPoolForKey(key: KeyEntry, pool: readonly string[]): string[] {
  let result: string[] = [...pool];
  const allowedModels = key.allowedModels;
  if (allowedModels && allowedModels.length > 0) {
    result = result.filter((alias) => allowedModels.includes(alias));
  }
  const excludedModels = key.excludedModels;
  if (excludedModels && excludedModels.length > 0) {
    result = result.filter((alias) => !excludedModels.includes(alias));
  }
  if (key.excludedProviders?.includes('flaky-lab')) {
    result = result.filter((alias) => alias !== FLAKY_ALIAS);
  }
  return result;
}

function chooseAliasAndKind(key: KeyEntry): { alias: string; kind: TickKind } {
  const kind = rollKind();
  const preferred = restrictPoolForKey(key, poolForKind(kind));
  if (preferred.length > 0) {
    return { alias: pick(preferred), kind };
  }
  // This key's scoping (e.g. ci-pipeline/partner-acme's allowedModels) rules
  // out the rolled action — fall back to whatever it CAN do, so scoped keys
  // still generate legitimate traffic instead of a self-inflicted 403.
  const fallback = restrictPoolForKey(key, FULL_POOL);
  const alias = pick(fallback);
  return { alias, kind: classifyAlias(alias) };
}

// ─── Canned request bodies ───────────────────────────────────────────────

const CANNED_PROMPTS = [
  'Summarize the current status in one short sentence.',
  'What is 12 plus 30?',
  'Give me a short haiku about databases.',
  'List three benefits of caching, briefly.',
  'Explain retries in one sentence.',
  'What color is the sky? Answer briefly.',
  'Say hello in a friendly way.',
  'Tell a one-line joke about APIs.',
] as const;

// ─── Counters / heartbeat ────────────────────────────────────────────────

interface Counters {
  chat: number;
  streamed: number;
  embeddings: number;
  mcp: number;
  flakyExpected: number;
  quotaExpected: number;
  unexpectedErrors: number;
}

function freshCounters(): Counters {
  return {
    chat: 0,
    streamed: 0,
    embeddings: 0,
    mcp: 0,
    flakyExpected: 0,
    quotaExpected: 0,
    unexpectedErrors: 0,
  };
}

let counters = freshCounters();

// ─── Backoff on total (connection-level) failure ─────────────────────────
// Distinct from a normal HTTP error response (which means the server IS
// reachable) — this only trips when the fetch itself can't complete at all
// (e.g. ECONNREFUSED because the server went away).

let consecutiveNetworkFailures = 0;
let backoffMultiplier = 1;
const BACKOFF_FAILURE_THRESHOLD = 3;
const MAX_BACKOFF_MULTIPLIER = 12;

function onNetworkFailure(): void {
  consecutiveNetworkFailures++;
  if (consecutiveNetworkFailures === BACKOFF_FAILURE_THRESHOLD) {
    logAlways(`${BASE_URL} unreachable — backing off and retrying quietly.`);
  }
  if (consecutiveNetworkFailures >= BACKOFF_FAILURE_THRESHOLD) {
    backoffMultiplier = Math.min(MAX_BACKOFF_MULTIPLIER, backoffMultiplier * 2);
  }
}

function onNetworkSuccess(): void {
  if (consecutiveNetworkFailures >= BACKOFF_FAILURE_THRESHOLD) {
    logAlways(`${BASE_URL} reachable again — resuming normal cadence.`);
  }
  consecutiveNetworkFailures = 0;
  backoffMultiplier = 1;
}

/**
 * Logs a per-tick network-failure line normally until we've confirmed a
 * sustained outage (the "unreachable — backing off" message has fired), then
 * drops to verbose-only — "back off and keep retrying quietly" means exactly
 * that once we already know the server is down; without this, a long outage
 * would otherwise print one line per tick for as long as it lasts.
 */
function logNetworkFailure(message: string): void {
  if (consecutiveNetworkFailures < BACKOFF_FAILURE_THRESHOLD) {
    logAlways(message);
  } else {
    logVerbose(message);
  }
}

// ─── Main tick: one chat/embeddings/resilient/flaky call ────────────────

async function performTick(): Promise<void> {
  const keyName = weightedPick(KEY_WEIGHTS);
  const key = keyEntry(keyName);
  const { alias, kind } = chooseAliasAndKind(key);
  const stream = kind !== 'embeddings' && Math.random() < STREAM_PROBABILITY;

  if (kind === 'embeddings') counters.embeddings++;
  else counters.chat++;
  if (stream) counters.streamed++;

  const path = kind === 'embeddings' ? '/v1/embeddings' : '/v1/chat/completions';
  const body =
    kind === 'embeddings'
      ? { model: alias, input: pick(CANNED_PROMPTS) }
      : {
          model: alias,
          messages: [{ role: 'user', content: pick(CANNED_PROMPTS) }],
          max_tokens: randomInt(16, 64),
          stream,
        };

  const start = Date.now();
  let response: FetchedResponse;
  try {
    // A mid-body stall or stream-read error rejects here too (fetchWithTimeout
    // consumes the body under its deadline), feeding the same backoff
    // accounting as a connection failure.
    response = await fetchWithTimeout(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.secret}` },
      body: JSON.stringify(body),
    });
  } catch (err) {
    onNetworkFailure();
    counters.unexpectedErrors++;
    logNetworkFailure(
      `unexpected network error on ${kind} '${alias}' (key=${keyName}): ${(err as Error).message}`
    );
    return;
  }
  onNetworkSuccess();

  if (response.ok) {
    logVerbose(
      `${kind} '${alias}' key=${keyName} stream=${stream} status=${response.status} ${Date.now() - start}ms`
    );
    return;
  }

  const text = response.text;
  // A quota-shaped 429 (the enforcer's body carries type 'quota_exceeded' —
  // see buildQuotaExceededBody in quota-middleware.ts) is expected from ANY
  // key: free-tier's near-limit quota is the designed source, but a long/fast
  // run can legitimately saturate other quotas too (e.g. dev-rolling-requests
  // after an hour at a fast PLEXUS_TICKER_INTERVAL_MS). Check it BEFORE the
  // flaky-family check so a quota rejection on a resilient/flaky tick isn't
  // mislabeled as mock flakiness.
  const isExpectedQuota = response.status === 429 && text.includes('quota_exceeded');
  const isFlakyFamily = kind === 'resilient' || kind === 'flaky';

  if (isExpectedQuota) {
    counters.quotaExpected++;
    logVerbose(`quota 429 (expected) key=${keyName} alias='${alias}'`);
  } else if (isFlakyFamily) {
    counters.flakyExpected++;
    logVerbose(`flaky-fail (expected) '${alias}' key=${keyName} status=${response.status}`);
  } else {
    counters.unexpectedErrors++;
    logAlways(
      `unexpected ${response.status} on ${kind} '${alias}' (key=${keyName}): ${text.slice(0, 200)}`
    );
  }
}

// ─── MCP gateway tick: initialize + tools/call, mock-tools or plexus ────

const MCP_PROTOCOL_VERSION = '2025-11-25';
const BUILTIN_MCP_PROBABILITY = 0.2;
const MCP_HEADERS = {
  'Content-Type': 'application/json',
  // WebStandardStreamableHTTPServerTransport (used by /mcp/plexus) 406s a
  // POST whose Accept header doesn't list both of these — send it for both
  // targets so the same helper works everywhere.
  Accept: 'application/json, text/event-stream',
};

let mcpCallId = 1;

async function callMcp(
  path: string,
  authHeaders: Record<string, string>,
  body: unknown
): Promise<FetchedResponse> {
  return fetchWithTimeout(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { ...MCP_HEADERS, ...authHeaders },
    body: JSON.stringify(body),
  });
}

async function performMcpTick(): Promise<void> {
  counters.mcp++;
  const useBuiltIn = Math.random() < BUILTIN_MCP_PROBABILITY;
  const target = useBuiltIn ? 'plexus' : 'mock-tools';
  const path = `/mcp/${target}`;
  // /mcp/plexus (built-in management server) is x-admin-key gated; /mcp/:name
  // (generic remote proxy, e.g. mock-tools) is bearer-inference-key gated —
  // reuse the loopback-scoped 'dev-ticker' key for the latter.
  const authHeaders: Record<string, string> = useBuiltIn
    ? { 'x-admin-key': ADMIN_KEY }
    : { Authorization: `Bearer ${keyEntry('dev-ticker').secret}` };

  const initBody = {
    jsonrpc: '2.0',
    id: mcpCallId++,
    method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'plexus-live-ticker', version: '1.0.0' },
    },
  };
  const toolCallBody = useBuiltIn
    ? {
        jsonrpc: '2.0',
        id: mcpCallId++,
        method: 'tools/call',
        params: { name: 'plexus_usage', arguments: { operation: 'summary' } },
      }
    : {
        jsonrpc: '2.0',
        id: mcpCallId++,
        method: 'tools/call',
        params:
          Math.random() < 0.5
            ? { name: 'echo', arguments: { message: 'plexus-live-ticker heartbeat' } }
            : { name: 'current_time', arguments: {} },
      };

  try {
    const initRes = await callMcp(path, authHeaders, initBody);
    onNetworkSuccess(); // any completed HTTP exchange means the server is reachable
    if (!initRes.ok) {
      counters.unexpectedErrors++;
      logAlways(
        `unexpected ${initRes.status} on mcp '${target}' initialize: ${initRes.text.slice(0, 200)}`
      );
      return;
    }
    const callRes = await callMcp(path, authHeaders, toolCallBody);
    if (!callRes.ok) {
      counters.unexpectedErrors++;
      logAlways(
        `unexpected ${callRes.status} on mcp '${target}' tools/call: ${callRes.text.slice(0, 200)}`
      );
    } else {
      logVerbose(`mcp '${target}' status=${callRes.status}`);
    }
  } catch (err) {
    onNetworkFailure();
    counters.unexpectedErrors++;
    logNetworkFailure(`unexpected network error on mcp '${target}': ${(err as Error).message}`);
  }
}

// ─── Scheduling loops ─────────────────────────────────────────────────────

const DEFAULT_BASE_INTERVAL_MS = 5_500;
const BASE_INTERVAL_MS = Number(process.env.PLEXUS_TICKER_INTERVAL_MS) || DEFAULT_BASE_INTERVAL_MS;

function nextTickDelayMs(): number {
  const jittered = BASE_INTERVAL_MS * (0.55 + Math.random() * 0.9); // ~[3s,8s] at the default base
  return Math.max(100, jittered * backoffMultiplier);
}

function nextMcpDelayMs(): number {
  return Math.max(100, randomInt(25_000, 35_000) * backoffMultiplier);
}

const HEARTBEAT_INTERVAL_MS = 60_000;

let shuttingDown = false;
let mainTimer: ReturnType<typeof setTimeout> | undefined;
let mcpTimer: ReturnType<typeof setTimeout> | undefined;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

async function mainLoop(): Promise<void> {
  if (shuttingDown) return;
  try {
    await performTick();
  } catch (err) {
    counters.unexpectedErrors++;
    logAlways(`unexpected error in tick: ${(err as Error).message}`);
  }
  if (shuttingDown) return;
  mainTimer = setTimeout(() => void mainLoop(), nextTickDelayMs());
}

async function mcpLoop(): Promise<void> {
  if (shuttingDown) return;
  try {
    await performMcpTick();
  } catch (err) {
    counters.unexpectedErrors++;
    logAlways(`unexpected error in mcp tick: ${(err as Error).message}`);
  }
  if (shuttingDown) return;
  mcpTimer = setTimeout(() => void mcpLoop(), nextMcpDelayMs());
}

function startHeartbeat(): void {
  heartbeatTimer = setInterval(() => {
    const c = counters;
    logAlways(
      `60s: ${c.chat} chat (${c.streamed} streamed), ${c.embeddings} embeddings, ${c.mcp} mcp, ` +
        `${c.flakyExpected} flaky-fail (expected), ${c.quotaExpected} quota-429 (expected), ` +
        `${c.unexpectedErrors} unexpected errors`
    );
    counters = freshCounters();
  }, HEARTBEAT_INTERVAL_MS);
}

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logAlways(`received ${signal}, shutting down.`);
  if (mainTimer) clearTimeout(mainTimer);
  if (mcpTimer) clearTimeout(mcpTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Startup sequence ─────────────────────────────────────────────────────

async function waitForHealth(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/health`, {}, 5_000);
      if (res.ok) return true;
    } catch {
      // Keep retrying until the timeout elapses.
    }
    await sleep(1_000);
  }
  return false;
}

async function fetchSystemSettings(): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/v0/management/system-settings`,
    { headers: { 'x-admin-key': ADMIN_KEY } },
    10_000
  );
  if (!res.ok) {
    throw new Error(
      `GET /v0/management/system-settings -> ${res.status}: ${res.text.slice(0, 200)}`
    );
  }
  return JSON.parse(res.text) as Record<string, unknown>;
}

/** Global debug capture is in-memory-only (Task 2's finding) — enable it every start. Idempotent. */
async function enableDebugCapture(): Promise<void> {
  try {
    const res = await fetchWithTimeout(
      `${BASE_URL}/v0/management/debug`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
        body: JSON.stringify({ enabled: true }),
      },
      10_000
    );
    if (!res.ok) {
      logAlways(
        `warning: failed to enable debug capture (status ${res.status}) — continuing anyway.`
      );
    } else {
      logVerbose('global debug capture enabled.');
    }
  } catch (err) {
    logAlways(
      `warning: failed to enable debug capture (${(err as Error).message}) — continuing anyway.`
    );
  }
}

async function main(): Promise<void> {
  logAlways(`starting — target ${BASE_URL}`);

  // 1. Wait for the backend to be up.
  const healthy = await waitForHealth(60_000);
  if (!healthy) {
    console.error(`[ticker] backend at ${BASE_URL} did not become healthy within 60s. Exiting.`);
    process.exit(1);
  }
  logVerbose('backend is healthy.');

  // 2. Marker gate — refuse to send traffic against a DB scripts/seed-dev.ts
  // never touched (a real or restored DB), so this ticker can never spam a
  // developer's actual data.
  let settings: Record<string, unknown>;
  try {
    settings = await fetchSystemSettings();
  } catch (err) {
    console.error(
      `[ticker] could not read system settings: ${(err as Error).message}. Check ADMIN_KEY. Exiting.`
    );
    process.exit(1);
  }

  if (settings['dev.seeded'] == null) {
    logAlways(
      'this instance has no dev.seeded marker (not seeded by scripts/seed-dev.ts) — refusing to send traffic. Exiting.'
    );
    process.exit(0);
  }
  logVerbose('marker gate passed — dev.seeded present.');

  // 3. Enable global (in-memory) debug capture so ticker traffic produces debug traces.
  await enableDebugCapture();

  // 4. No quota recompute — the seeder backfills quota_state directly and
  // live enforcement maintains it incrementally as our traffic flows.

  logAlways(
    `live — cadence ~${((BASE_INTERVAL_MS * 0.55) / 1000).toFixed(1)}-${((BASE_INTERVAL_MS * 1.45) / 1000).toFixed(1)}s, mcp ~25-35s, heartbeat 60s.`
  );

  startHeartbeat();
  void mainLoop();
  void mcpLoop();
}

main().catch((err) => {
  console.error('[ticker] fatal startup error:', err);
  process.exit(1);
});

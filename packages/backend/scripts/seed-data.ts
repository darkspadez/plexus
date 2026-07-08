/**
 * seed-data.ts
 *
 * Pure, deterministic dataset builders for the dev-mode config seeder (see
 * ./seed-dev.ts). No I/O happens here — every function returns plain typed
 * config objects (the same shapes `ConfigRepository.save*` accept) that
 * seed-dev.ts persists in order. Content is fixed literals throughout; the
 * only non-literal values are `Date.now()` inside `buildSettings` and inside
 * `buildOAuthAccounts` (both timestamps, not randomness).
 *
 * All chat-model ids referenced below come from the mock's fixed model set
 * (`MODEL_IDS` in scripts/mock-upstream.ts, run from the repo root) — that
 * file is the source of truth for which ids exist and which families they
 * belong to — EXCEPT `mock-cohere`'s `command-r` / `command-r-plus` (see
 * buildProviders): no alias ever targets mock-cohere, so those two ids are
 * catalog-only and never actually dialed against the mock. The embeddings
 * model works too (the mock's POST /v1/embeddings accepts any model id);
 * audio/image model ids are catalog dressing whose alias targets are all
 * disabled and never routed.
 */

import type {
  KeyConfig,
  McpServerConfig,
  ModelConfig,
  ModelTarget,
  ModelTargetGroup,
  ProviderConfig,
  QuotaDefinition,
  SelectorType,
} from '../src/config';

export interface MockPortParams {
  mockPort: number;
}

export interface OAuthAccountSeed {
  providerType: string;
  accountId: string;
  accessToken: string;
  refreshToken: string;
  /** Unix seconds (matches `oauth_credentials.expires_at` — see db/config-repository.ts). */
  expiresAt: number;
}

// The disabled OAuth-mode provider (see buildProviders) links to the
// "personal" account below so its oauth_credential_id FK has something real
// to resolve to (see seed-dev.ts for why the credentials must exist before
// that provider's *second* save).
export const OAUTH_PROVIDER_TYPE = 'anthropic';
export const OAUTH_ACCOUNT_PERSONAL = 'personal';
export const OAUTH_ACCOUNT_WORK = 'work';

// ─── Providers (~8) ─────────────────────────────────────────────────────
//
// Wire-family note (see task report for the full trail): a plain-string
// `api_base_url` makes `getProviderTypes()` (packages/backend/src/config.ts)
// infer 'chat' for any URL that isn't a recognized real vendor domain — fine
// for OpenAI-family providers (that's the correct type anyway), but WRONG
// for Anthropic/Gemini, which must use the record form (`{ messages: url }` /
// `{ gemini: url }`) to declare their true wire type; otherwise the
// dispatcher would route them through the OpenAI transformer instead of
// AnthropicTransformer/GeminiTransformer (transformer-factory.ts).

export function buildProviders({ mockPort }: MockPortParams): Record<string, ProviderConfig> {
  const base = `http://localhost:${mockPort}`;

  return {
    'mock-openai': {
      display_name: 'Mock OpenAI',
      api_base_url: `${base}/v1`,
      api_key: 'sk-mock-openai-devkey',
      enabled: true,
      disable_cooldown: false,
      stall_cooldown: false,
      estimateTokens: false,
      useClaudeMasking: false,
      models: {
        'gpt-4o': { pricing: { source: 'simple', input: 2.5, output: 10 } },
        'gpt-4o-mini': { pricing: { source: 'simple', input: 0.15, output: 0.6 } },
        // The mock's POST /v1/embeddings accepts any model id, so this model
        // genuinely serves traffic (see the enabled embeddings alias below).
        'text-embedding-3-small': {
          pricing: { source: 'simple', input: 0.02, output: 0 },
          type: 'embeddings',
        },
        // Audio/image models exist for catalog realism only — every alias
        // target pointing at them is disabled (the mock serves no audio or
        // image endpoints), so they must never receive traffic.
        'whisper-1': { pricing: { source: 'per_request', amount: 0.006 }, type: 'transcriptions' },
        'tts-1': { pricing: { source: 'simple', input: 15, output: 0 }, type: 'speech' },
        'dall-e-3': { pricing: { source: 'per_request', amount: 0.04 }, type: 'image' },
      },
      quota_checker: {
        type: 'synthetic',
        enabled: true,
        intervalMinutes: 30,
        options: { endpoint: `${base}/quota/warning` },
      },
    },
    'mock-anthropic': {
      display_name: 'Mock Anthropic',
      // Record form required — see wire-family note above.
      api_base_url: { messages: `${base}/v1` },
      api_key: 'sk-mock-anthropic-devkey',
      enabled: true,
      disable_cooldown: false,
      stall_cooldown: false,
      estimateTokens: false,
      useClaudeMasking: false,
      models: {
        'claude-sonnet-4-5': { pricing: { source: 'simple', input: 3, output: 15 } },
        'claude-haiku-4-5': { pricing: { source: 'simple', input: 1, output: 5 } },
      },
      quota_checker: {
        type: 'synthetic',
        enabled: true,
        intervalMinutes: 30,
        options: { endpoint: `${base}/quota/critical` },
      },
    },
    'mock-gemini': {
      display_name: 'Mock Gemini',
      // Record form required — GeminiTransformer.getEndpoint() already emits
      // the '/v1beta/...' prefix, so the base URL itself carries no suffix.
      api_base_url: { gemini: base },
      api_key: 'sk-mock-gemini-devkey',
      enabled: true,
      disable_cooldown: false,
      stall_cooldown: false,
      estimateTokens: false,
      useClaudeMasking: false,
      models: {
        'gemini-2.5-pro': { pricing: { source: 'simple', input: 1.25, output: 10 } },
        'gemini-2.5-flash': { pricing: { source: 'simple', input: 0.3, output: 2.5 } },
      },
      quota_checker: {
        type: 'synthetic',
        enabled: true,
        intervalMinutes: 30,
        options: { endpoint: `${base}/quota/ok` },
      },
    },
    'mock-openrouter': {
      // Distinct provider entry against the same mock upstream — OpenAI-family
      // wire format, but conceptually an aggregator reselling several model
      // families through one endpoint (as the real OpenRouter does).
      display_name: 'Mock OpenRouter',
      api_base_url: `${base}/v1`,
      api_key: 'sk-mock-openrouter-devkey',
      enabled: true,
      disable_cooldown: false,
      stall_cooldown: false,
      estimateTokens: false,
      useClaudeMasking: false,
      models: {
        'gpt-4o': { pricing: { source: 'simple', input: 2.75, output: 11 } },
        'claude-sonnet-4-5': { pricing: { source: 'simple', input: 3.3, output: 16.5 } },
        'gemini-2.5-flash': { pricing: { source: 'simple', input: 0.33, output: 2.75 } },
      },
      quota_checker: {
        type: 'hyper',
        enabled: true,
        intervalMinutes: 30,
        // Schema surprise (see task report): the real hyper-checker.ts
        // implementation requires `options.apiKey` (ctx.requireOption), but
        // config.ts's HyperQuotaCheckerOptionsSchema only types `endpoint` —
        // the ProviderConfig type genuinely has no `apiKey` field here, so it
        // can't be set directly without breaking strict typing. It still
        // resolves at runtime: ConfigService.buildProviderQuotaConfigs()
        // auto-fills `options.apiKey` from the provider's own `api_key` field
        // whenever the checker options omit it (see config-service.ts), and
        // this provider's `api_key` above covers that.
        options: { endpoint: `${base}/balance` },
      },
    },
    'mock-cohere': {
      // The "exhausted quota" showcase provider. Its synthetic checker points
      // at the mock's /quota/exhausted endpoint (~100% utilization), which
      // the quota-scheduler treats as at/above its exhaustion threshold (99%
      // by default, and both zod schemas cap maxUtilizationPercent at 100 —
      // see SyntheticQuotaCheckerOptionsSchema in config.ts and
      // synthetic-checker.ts) and responds by injecting a provider-wide
      // cooldown on every check. That permanent cooldown is INTENDED here: it
      // keeps a live exhausted-severity row on the Quotas page and a
      // deterministic entry in Service Alerts / GET /v0/management/cooldowns.
      // Safe because NO alias may ever target this provider — the cooldown
      // therefore never affects routing. (flaky-lab must NOT play this role:
      // its aliases need it dialable so the mock's per-request flakiness, not
      // a pre-emptive week-long cooldown, produces their organic failures.)
      display_name: 'Mock Cohere',
      api_base_url: `${base}/v1`,
      api_key: 'sk-mock-cohere-devkey',
      enabled: true,
      disable_cooldown: false,
      stall_cooldown: false,
      estimateTokens: false,
      useClaudeMasking: false,
      models: {
        'command-r-plus': { pricing: { source: 'simple', input: 2.5, output: 10 } },
        'command-r': { pricing: { source: 'simple', input: 0.15, output: 0.6 } },
      },
      quota_checker: {
        type: 'synthetic',
        enabled: true,
        intervalMinutes: 30,
        options: { endpoint: `${base}/quota/exhausted` },
      },
    },
    'flaky-lab': {
      // Deliberately NO quota_checker: variety for the Providers page (rows
      // both with and without quota badges), and this provider must never
      // carry the /quota/exhausted story — the scheduler's provider-wide
      // exhaustion cooldown would permanently block the 'flaky-model-v1'
      // alias and 'resilient's flaky-first target, whose whole purpose is
      // organic per-request failures from the mock. The exhausted-severity
      // showcase lives on mock-cohere above instead.
      display_name: 'Flaky Lab',
      api_base_url: `${base}/v1`,
      api_key: 'sk-mock-flaky-devkey',
      enabled: true,
      disable_cooldown: false,
      stall_cooldown: false,
      estimateTokens: false,
      useClaudeMasking: false,
      models: {
        'flaky-model-v1': { pricing: { source: 'simple', input: 1, output: 2 } },
      },
    },
    'local-ollama': {
      // The "disabled provider" example — conventional local Ollama
      // OpenAI-compat address, real-looking but never dialed (enabled: false).
      display_name: 'Local Ollama',
      api_base_url: 'http://localhost:11434/v1',
      // Ollama's OpenAI-compat layer ignores the key value; the schema still
      // requires a non-empty api_key for a non-oauth provider.
      api_key: 'ollama',
      enabled: false,
      disable_cooldown: false,
      stall_cooldown: false,
      estimateTokens: false,
      useClaudeMasking: false,
      models: {
        'llama3.1:8b': { pricing: { source: 'simple', input: 0, output: 0 } },
        'qwen2.5:14b': { pricing: { source: 'simple', input: 0, output: 0 } },
      },
    },
    'anthropic-oauth-max': {
      // The OAuth-mode provider example. Disabled so nothing ever attempts a
      // real token refresh — see task report for the full investigation of
      // why this can't safely be enabled in a dev seed.
      display_name: 'Anthropic OAuth (Claude Max)',
      api_base_url: 'oauth://anthropic',
      oauth_provider: 'anthropic',
      oauth_account: OAUTH_ACCOUNT_PERSONAL,
      enabled: false,
      disable_cooldown: false,
      stall_cooldown: false,
      estimateTokens: false,
      useClaudeMasking: false,
      models: {
        'claude-opus-4-5': { pricing: { source: 'simple', input: 5, output: 25 } },
      },
    },
  };
}

// ─── OAuth credential rows (multi-account investigation) ───────────────
//
// See task report for the full investigation of how the Quotas UI's
// oauthAccountId sub-rows get produced. These two rows prove the
// setOAuthCredentials() write/read round-trip (fake tokens, far-future
// expiry so nothing ever looks "expired" enough to trigger a refresh); no
// enabled provider/checker consumes the second ("work") account — see report
// for why wiring that up live was judged unsafe for a dev seed.

export function buildOAuthAccounts(): OAuthAccountSeed[] {
  const farFutureSeconds = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

  return [
    {
      providerType: OAUTH_PROVIDER_TYPE,
      accountId: OAUTH_ACCOUNT_PERSONAL,
      accessToken: 'fake-oauth-access-token-personal',
      refreshToken: 'fake-oauth-refresh-token-personal',
      expiresAt: farFutureSeconds,
    },
    {
      providerType: OAUTH_PROVIDER_TYPE,
      accountId: OAUTH_ACCOUNT_WORK,
      accessToken: 'fake-oauth-access-token-work',
      refreshToken: 'fake-oauth-refresh-token-work',
      expiresAt: farFutureSeconds,
    },
  ];
}

// ─── User quotas (~7) ───────────────────────────────────────────────────
//
// Spans type (rolling/daily/weekly/monthly) x limitType (requests/tokens/
// cost); 'dev-weekly-cost' is shared; 'dev-scoped-anthropic' is
// provider+model scoped; 'dev-warn-cost' has warnAt; 'dev-tiny-daily' is the
// deliberately small quota Task 3's backfilled usage pushes near/over.

export function buildUserQuotas(): Record<string, QuotaDefinition> {
  return {
    'dev-rolling-requests': {
      type: 'rolling',
      limitType: 'requests',
      limit: 500,
      duration: '1h',
    },
    'dev-daily-tokens': {
      type: 'daily',
      limitType: 'tokens',
      limit: 2_000_000,
    },
    'dev-weekly-cost': {
      type: 'weekly',
      limitType: 'cost',
      limit: 100,
      shared: true,
    },
    'dev-monthly-requests': {
      type: 'monthly',
      limitType: 'requests',
      limit: 100_000,
    },
    'dev-scoped-anthropic': {
      type: 'daily',
      limitType: 'tokens',
      limit: 500_000,
      allowedProviders: ['mock-anthropic'],
      allowedModels: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
    },
    'dev-warn-cost': {
      type: 'monthly',
      limitType: 'cost',
      limit: 50,
      warnAt: 0.8,
    },
    'dev-tiny-daily': {
      type: 'daily',
      limitType: 'requests',
      limit: 50,
    },
  };
}

// ─── Aliases (14) ────────────────────────────────────────────────────────
//
// Exercises the Models page's full visual variety:
//  - one alias per mock chat-model id (7), some with additional_aliases
//    ("+N" pill) and metadata from each catalog source
//    (openrouter / models.dev / catwalk / custom — see ModelMetadataSchema
//    in src/config.ts; catalog paths use each source's documented format,
//    and a failed catalog fetch is non-fatal, see model-metadata-manager.ts)
//  - 'resilient': flaky target FIRST, stable fallback second, in_order —
//    the ticker calls it to produce organic retries/failover
//  - 'smart' / 'balanced': multi-family aliases with priority 'api_match'
//  - type variety: an embeddings alias with an ENABLED target (the mock
//    serves POST /v1/embeddings, so it genuinely works) plus
//    transcriptions/speech/image aliases whose targets are all DISABLED
//    (the mock serves no audio/image endpoints — they must never route)

function group(selector: SelectorType, targets: ModelTarget[]): ModelTargetGroup[] {
  return [{ name: 'default', selector, targets }];
}

function target(provider: string, model: string, enabled = true): ModelTarget {
  return { provider, model, enabled };
}

/** Fields every alias sets explicitly (see task report on why). */
const ALIAS_BASE = {
  priority: 'selector' as const,
  sticky_session: true,
  use_image_fallthrough: false,
  enforce_limits: false,
};

export function buildAliases(): Record<string, ModelConfig> {
  return {
    'gpt-4o': {
      ...ALIAS_BASE,
      target_groups: group('cost', [
        target('mock-openai', 'gpt-4o'),
        target('mock-openrouter', 'gpt-4o'),
      ]),
      additional_aliases: ['gpt-4o-latest', 'gpt-4o-2024-11-20'],
      metadata: { source: 'openrouter', source_path: 'openai/gpt-4o' },
    },
    'gpt-4o-mini': {
      ...ALIAS_BASE,
      target_groups: group('random', [target('mock-openai', 'gpt-4o-mini')]),
    },
    'claude-sonnet-4-5': {
      ...ALIAS_BASE,
      target_groups: group('cost', [
        target('mock-anthropic', 'claude-sonnet-4-5'),
        target('mock-openrouter', 'claude-sonnet-4-5'),
      ]),
      additional_aliases: ['claude-sonnet-4-5-20250929'],
      metadata: { source: 'models.dev', source_path: 'anthropic.claude-sonnet-4-5' },
    },
    'claude-haiku-4-5': {
      ...ALIAS_BASE,
      target_groups: group('random', [target('mock-anthropic', 'claude-haiku-4-5')]),
    },
    'gemini-2.5-pro': {
      ...ALIAS_BASE,
      target_groups: group('random', [target('mock-gemini', 'gemini-2.5-pro')]),
      metadata: { source: 'catwalk', source_path: 'google.gemini-2.5-pro' },
    },
    'gemini-2.5-flash': {
      ...ALIAS_BASE,
      target_groups: group('latency', [
        target('mock-gemini', 'gemini-2.5-flash'),
        target('mock-openrouter', 'gemini-2.5-flash'),
      ]),
    },
    'flaky-model-v1': {
      ...ALIAS_BASE,
      target_groups: group('random', [target('flaky-lab', 'flaky-model-v1')]),
      metadata: {
        source: 'custom',
        overrides: {
          name: 'Flaky Model v1',
          description: 'Chaos-testing model — the mock upstream fails it ~30% of the time.',
        },
      },
    },
    resilient: {
      ...ALIAS_BASE,
      // Flaky target deliberately FIRST + in_order: every call tries
      // flaky-lab, fails ~30% of the time, and fails over to the stable
      // target — organic attemptCount>1 rows, cooldowns, eventual success.
      target_groups: group('in_order', [
        target('flaky-lab', 'flaky-model-v1'),
        target('mock-openai', 'gpt-4o-mini'),
      ]),
    },
    smart: {
      ...ALIAS_BASE,
      priority: 'api_match',
      target_groups: group('performance', [
        target('mock-anthropic', 'claude-sonnet-4-5'),
        target('mock-openai', 'gpt-4o'),
        target('mock-gemini', 'gemini-2.5-pro'),
      ]),
      additional_aliases: ['auto'],
    },
    balanced: {
      ...ALIAS_BASE,
      priority: 'api_match',
      target_groups: group('usage', [
        target('mock-openai', 'gpt-4o-mini'),
        target('mock-anthropic', 'claude-haiku-4-5'),
        target('mock-gemini', 'gemini-2.5-flash'),
      ]),
    },
    'text-embedding-3-small': {
      ...ALIAS_BASE,
      type: 'embeddings',
      target_groups: group('random', [target('mock-openai', 'text-embedding-3-small')]),
      additional_aliases: ['text-embedding-ada-002'],
    },
    'whisper-1': {
      ...ALIAS_BASE,
      type: 'transcriptions',
      target_groups: group('random', [target('mock-openai', 'whisper-1', false)]),
    },
    'tts-1': {
      ...ALIAS_BASE,
      type: 'speech',
      target_groups: group('random', [target('mock-openai', 'tts-1', false)]),
    },
    'dall-e-3': {
      ...ALIAS_BASE,
      type: 'image',
      target_groups: group('random', [target('mock-openai', 'dall-e-3', false)]),
    },
  };
}

// ─── API keys (~10) ─────────────────────────────────────────────────────
//
// Every quota above is referenced by >=1 key; 'mobile-app' and
// 'internal-tools' carry no `quotas` at all so they exercise the
// `default_quotas` fallback (see buildDefaultQuotaNames / buildSettings);
// 'ci-pipeline' and 'partner-acme' carry scoped allow lists, 'readonly-viewer'
// a deny list; 'dev-ticker' is the one key with allowedIps (loopback, so the
// dev traffic ticker's local requests are never blocked).

export function buildKeys(): Record<string, KeyConfig> {
  return {
    'dev-admin': {
      secret: 'sk-dev-9f3ka72xlq8m',
      comment: 'Primary dev key for local testing',
      quotas: ['dev-rolling-requests'],
    },
    'free-tier': {
      secret: 'sk-free-2b7hd91wqz4p',
      comment: 'Free-tier simulation key — deliberately tight quota',
      quotas: ['dev-tiny-daily'],
    },
    'premium-tier': {
      secret: 'sk-premium-6k4jr83mnv2t',
      comment: 'Premium-tier simulation key',
      quotas: ['dev-monthly-requests', 'dev-weekly-cost'],
    },
    'ci-pipeline': {
      secret: 'sk-ci-1a5wq62xpb9f',
      comment: 'CI pipeline smoke-test key, restricted to the cheap mini model',
      quotas: ['dev-daily-tokens'],
      allowedProviders: ['mock-openai'],
      allowedModels: ['gpt-4o-mini'],
    },
    'mobile-app': {
      secret: 'sk-mobile-7h2vn48tks3',
      comment: 'Mobile app backend key (falls back to default_quotas)',
    },
    'partner-acme': {
      secret: 'sk-partner-3q9zx15dmwr',
      comment: 'ACME Corp partner integration, Claude-only',
      quotas: ['dev-scoped-anthropic'],
      allowedModels: ['claude-sonnet-4-5'],
    },
    'internal-tools': {
      secret: 'sk-internal-8m6bh24fjyq',
      comment: 'Internal tooling & dashboards (falls back to default_quotas)',
    },
    'qa-automation': {
      secret: 'sk-qa-4t8cw71rnzx',
      comment: 'QA automation suite',
      quotas: ['dev-warn-cost', 'dev-weekly-cost'],
    },
    'dev-ticker': {
      secret: 'sk-dev-loopback-5r3fg96wpe',
      comment: 'Loopback-only key for the local dev traffic ticker',
      quotas: ['dev-rolling-requests'],
      allowedIps: ['127.0.0.1', '::1'],
    },
    'readonly-viewer': {
      secret: 'sk-viewer-2n7kx83qteh',
      comment: 'Read-only dashboard viewer, kept off the unreliable flaky lab',
      quotas: ['dev-daily-tokens'],
      excludedProviders: ['flaky-lab'],
    },
  };
}

/** Applied to keys with no `quotas` of their own (see buildKeys). */
export function buildDefaultQuotaNames(): string[] {
  return ['dev-daily-tokens'];
}

// ─── MCP servers (2) ────────────────────────────────────────────────────

export function buildMcpServers({ mockPort }: MockPortParams): Record<string, McpServerConfig> {
  return {
    'mock-tools': {
      mode: 'remote_http',
      upstream_url: `http://localhost:${mockPort}/mcp`,
      enabled: true,
    },
    'local-everything-example': {
      // Disabled — must never spawn anything. Named after the package it
      // would launch (the MCP reference "everything" server).
      mode: 'local_http',
      enabled: false,
      launcher: 'bunx',
      package: '@modelcontextprotocol/server-everything',
      args: [],
      env: {},
      port: 39201,
      path: '/mcp',
      startup_timeout_ms: 30000,
    },
  };
}

// ─── System settings ────────────────────────────────────────────────────
//
// A handful of visible non-defaults for the Config/Settings page, plus the
// `dev.seeded` DB marker (an informational record visible in the config
// export — separate from the *.seeded marker FILE in seed-dev.ts, which is
// what dev.ts actually gates spawning the mock upstream + ticker on) and
// `debug.captureOnError` (persisted; loaded at boot — see
// packages/backend/src/index.ts — unlike the separate in-memory-only
// "global debug capture" toggle, see task report).

export function buildSettings({ mockPort }: MockPortParams): Record<string, unknown> {
  return {
    'dev.seeded': { version: 1, seededAt: Date.now(), mockPort },
    'debug.captureOnError': true,
    'failover.retryableErrors': ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'],
    'cooldown.initialMinutes': 3,
    'cooldown.maxMinutes': 240,
    'timeout.defaultSeconds': 180,
    'stall.ttfbSeconds': 45,
    'stall.windowSeconds': 15,
    'stall.gracePeriodSeconds': 20,
    default_quotas: buildDefaultQuotaNames(),
  };
}

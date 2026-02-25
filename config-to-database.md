# Config-to-Database Migration Plan

## Goal

Move all runtime configuration data from `plexus.yaml` and `auth.json` into database tables, eliminating the need for these files except for bootstrapping settings (`adminKey`). On first launch with an empty database, automatically import from existing YAML/JSON files if present.

---

## What Stays in plexus.yaml (Minimal Bootstrap Config)

Only true server-level settings that must be known **before** the database is available:

```yaml
adminKey: "change-me-to-a-secure-admin-password"
# Optional overrides (env vars preferred):
# DATABASE_URL: "sqlite://config/usage.sqlite"
# AUTH_JSON: "./auth.json"
# PORT: 4000
```

Everything else moves to the database.

---

## What Moves to Database

| Current Location | Data | New DB Table |
|---|---|---|
| `plexus.yaml → providers` | Provider configs (api_base_url, api_key, headers, models, quota_checker, etc.) | `providers` + `provider_models` |
| `plexus.yaml → models` | Model aliases (targets, selector, priority, advanced, metadata) | `model_aliases` + `model_alias_targets` |
| `plexus.yaml → keys` | API keys (secret, comment, quota) | `api_keys` |
| `plexus.yaml → user_quotas` | User quota definitions (type, limitType, limit, duration) | `user_quota_definitions` |
| `plexus.yaml → failover` | Failover policy (enabled, retryableStatusCodes, retryableErrors) | `settings` (key-value) |
| `plexus.yaml → cooldown` | Cooldown policy (initialMinutes, maxMinutes) | `settings` (key-value) |
| `plexus.yaml → mcp_servers` | MCP server configs (upstream_url, enabled, headers) | `mcp_servers` |
| `plexus.yaml → performanceExplorationRate` | Exploration rates | `settings` (key-value) |
| `plexus.yaml → latencyExplorationRate` | Exploration rates | `settings` (key-value) |
| `auth.json` | OAuth credentials (access, refresh, expires per provider/account) | `oauth_credentials` |

---

## Phase 1: Database Schema (New Tables)

All schemas must be created for **both SQLite and PostgreSQL** dialects per project conventions.

### 1.1 `providers` table

| Column | SQLite Type | PG Type | Notes |
|---|---|---|---|
| `id` | text PK | text PK | Provider slug (e.g. "openai", "anthropic-oauth") |
| `display_name` | text | text | Optional friendly name |
| `api_base_url` | text (JSON) | jsonb | String URL or `{"chat":"...","messages":"..."}` |
| `api_key` | text | text | Encrypted at rest (or plaintext like current) |
| `oauth_provider` | text | text | Nullable: 'anthropic', 'openai-codex', etc. |
| `oauth_account` | text | text | Nullable: account ID within auth.json |
| `enabled` | integer | boolean | Default true |
| `disable_cooldown` | integer | boolean | Default false |
| `discount` | real | real | Nullable, 0-1 |
| `estimate_tokens` | integer | boolean | Default false |
| `headers` | text (JSON) | jsonb | Nullable, custom HTTP headers |
| `extra_body` | text (JSON) | jsonb | Nullable, extra body params |
| `quota_checker_type` | text | text | Nullable |
| `quota_checker_id` | text | text | Nullable, custom checker ID |
| `quota_checker_enabled` | integer | boolean | Default true |
| `quota_checker_interval` | integer | integer | Default 30 (minutes) |
| `quota_checker_options` | text (JSON) | jsonb | Nullable |
| `created_at` | integer (timestamp_ms) | timestamp | |
| `updated_at` | integer (timestamp_ms) | timestamp | |

### 1.2 `provider_models` table

| Column | SQLite Type | PG Type | Notes |
|---|---|---|---|
| `id` | integer PK AUTOINCREMENT | serial PK | |
| `provider_id` | text FK → providers.id | text FK | ON DELETE CASCADE |
| `model_name` | text | text | Model slug |
| `pricing_config` | text (JSON) | jsonb | Nullable, full pricing object |
| `model_type` | text | text | Nullable: 'chat', 'embeddings', etc. |
| `access_via` | text (JSON) | jsonb | Nullable, array of API types |
| `sort_order` | integer | integer | Preserve ordering |

**Unique constraint:** `(provider_id, model_name)`

### 1.3 `model_aliases` table

| Column | SQLite Type | PG Type | Notes |
|---|---|---|---|
| `id` | text PK | text PK | Alias name (e.g. "smart-model") |
| `selector` | text | text | Nullable: 'random', 'in_order', 'cost', etc. |
| `priority` | text | text | Default 'selector' |
| `alias_type` | text | text | Nullable: 'chat', 'embeddings', etc. |
| `additional_aliases` | text (JSON) | jsonb | Nullable, array of strings |
| `advanced` | text (JSON) | jsonb | Nullable, array of behavior objects |
| `metadata_source` | text | text | Nullable: 'openrouter', 'models.dev', 'catwalk' |
| `metadata_source_path` | text | text | Nullable |
| `created_at` | integer (timestamp_ms) | timestamp | |
| `updated_at` | integer (timestamp_ms) | timestamp | |

### 1.4 `model_alias_targets` table

| Column | SQLite Type | PG Type | Notes |
|---|---|---|---|
| `id` | integer PK AUTOINCREMENT | serial PK | |
| `alias_id` | text FK → model_aliases.id | text FK | ON DELETE CASCADE |
| `provider_id` | text | text | Provider slug (soft reference) |
| `model_name` | text | text | Model slug on that provider |
| `enabled` | integer | boolean | Default true |
| `sort_order` | integer | integer | Preserve target ordering |

**Unique constraint:** `(alias_id, provider_id, model_name)`

### 1.5 `api_keys` table

| Column | SQLite Type | PG Type | Notes |
|---|---|---|---|
| `name` | text PK | text PK | Key alias (e.g. "my-app-key") |
| `secret` | text UNIQUE | text UNIQUE | The actual bearer token |
| `comment` | text | text | Nullable |
| `quota_name` | text | text | Nullable, references user_quota_definitions.name |
| `created_at` | integer (timestamp_ms) | timestamp | |
| `updated_at` | integer (timestamp_ms) | timestamp | |

### 1.6 `user_quota_definitions` table

| Column | SQLite Type | PG Type | Notes |
|---|---|---|---|
| `name` | text PK | text PK | Quota name (e.g. "premium-plan") |
| `quota_type` | text | text | 'rolling', 'daily', 'weekly' |
| `limit_type` | text | text | 'requests' or 'tokens' |
| `limit_value` | integer | integer | |
| `duration` | text | text | Nullable, required for rolling (e.g. "1h") |
| `created_at` | integer (timestamp_ms) | timestamp | |
| `updated_at` | integer (timestamp_ms) | timestamp | |

### 1.7 `mcp_servers` table

| Column | SQLite Type | PG Type | Notes |
|---|---|---|---|
| `name` | text PK | text PK | Server slug |
| `upstream_url` | text | text | |
| `enabled` | integer | boolean | Default true |
| `headers` | text (JSON) | jsonb | Nullable |
| `created_at` | integer (timestamp_ms) | timestamp | |
| `updated_at` | integer (timestamp_ms) | timestamp | |

### 1.8 `settings` table (key-value for policies and rates)

| Column | SQLite Type | PG Type | Notes |
|---|---|---|---|
| `key` | text PK | text PK | e.g. 'failover.enabled', 'cooldown.initialMinutes' |
| `value` | text (JSON) | jsonb | Serialized value |
| `updated_at` | integer (timestamp_ms) | timestamp | |

Settings keys:
- `failover.enabled`, `failover.retryableStatusCodes`, `failover.retryableErrors`
- `cooldown.initialMinutes`, `cooldown.maxMinutes`
- `performanceExplorationRate`, `latencyExplorationRate`

### 1.9 `oauth_credentials` table

| Column | SQLite Type | PG Type | Notes |
|---|---|---|---|
| `id` | integer PK AUTOINCREMENT | serial PK | |
| `oauth_provider` | text | text | e.g. 'anthropic', 'openai-codex' |
| `account_id` | text | text | e.g. 'work', 'personal' |
| `access_token` | text | text | |
| `refresh_token` | text | text | |
| `expires_at` | integer | bigint | Epoch seconds |
| `created_at` | integer (timestamp_ms) | timestamp | |
| `updated_at` | integer (timestamp_ms) | timestamp | |

**Unique constraint:** `(oauth_provider, account_id)`

---

## Phase 2: Config Service Layer (New)

### 2.1 `ConfigRepository` — Database abstraction

New file: `packages/backend/src/db/config-repository.ts`

A single class that encapsulates all config CRUD against the database. Methods grouped by entity:

**Providers:**
- `getAllProviders(): Promise<ProviderConfig[]>`
- `getProvider(id: string): Promise<ProviderConfig | null>`
- `saveProvider(id: string, config: ProviderConfig): Promise<void>`
- `deleteProvider(id: string, cascade: boolean): Promise<void>`
- `getProviderModels(providerId: string): Promise<ProviderModelConfig[]>`

**Model Aliases:**
- `getAllAliases(): Promise<Record<string, ModelConfig>>`
- `getAlias(id: string): Promise<ModelConfig | null>`
- `saveAlias(id: string, config: ModelConfig): Promise<void>`
- `deleteAlias(id: string): Promise<void>`
- `deleteAllAliases(): Promise<number>`

**API Keys:**
- `getAllKeys(): Promise<Record<string, KeyConfig>>`
- `getKeyBySecret(secret: string): Promise<{name: string, config: KeyConfig} | null>`
- `saveKey(name: string, config: KeyConfig): Promise<void>`
- `deleteKey(name: string): Promise<void>`

**User Quotas:**
- `getAllUserQuotas(): Promise<Record<string, QuotaDefinition>>`
- `saveUserQuota(name: string, quota: QuotaDefinition): Promise<void>`
- `deleteUserQuota(name: string): Promise<void>`

**MCP Servers:**
- `getAllMcpServers(): Promise<Record<string, McpServerConfig>>`
- `saveMcpServer(name: string, config: McpServerConfig): Promise<void>`
- `deleteMcpServer(name: string): Promise<void>`

**Settings:**
- `getSetting<T>(key: string, defaultValue: T): Promise<T>`
- `setSetting(key: string, value: unknown): Promise<void>`
- `getFailoverPolicy(): Promise<FailoverPolicy>`
- `getCooldownPolicy(): Promise<CooldownPolicy>`

**OAuth Credentials:**
- `getOAuthCredentials(provider: string, accountId?: string): Promise<OAuthCredentials | null>`
- `setOAuthCredentials(provider: string, accountId: string, creds: OAuthCredentials): Promise<void>`
- `deleteOAuthCredentials(provider: string, accountId: string): Promise<void>`
- `getAllOAuthProviders(): Promise<{provider: string, accountId: string}[]>`

### 2.2 `ConfigService` — In-memory cache + DB sync

New file: `packages/backend/src/services/config-service.ts`

Replaces `getConfig()` as the single source of truth. Holds an in-memory `PlexusConfig` object that is:
1. Loaded from DB on startup
2. Updated in-memory whenever a write operation occurs
3. Never stale (writes go to DB first, then update cache)

```typescript
class ConfigService {
  private static instance: ConfigService;
  private cache: PlexusConfig;
  private repo: ConfigRepository;

  static getInstance(): ConfigService;

  // Load full config from DB into cache
  async initialize(): Promise<void>;

  // Returns the cached PlexusConfig (same shape as today's getConfig())
  getConfig(): PlexusConfig;

  // CRUD operations that update both DB and cache
  async saveProvider(id: string, config: ProviderConfig): Promise<void>;
  async deleteProvider(id: string, cascade: boolean): Promise<void>;
  async saveAlias(id: string, config: ModelConfig): Promise<void>;
  async deleteAlias(id: string): Promise<void>;
  async saveKey(name: string, config: KeyConfig): Promise<void>;
  async deleteKey(name: string): Promise<void>;
  // ... etc for all entities

  // Import from YAML (used during bootstrap)
  async importFromYaml(yamlContent: string): Promise<void>;
  async importFromAuthJson(jsonContent: string): Promise<void>;

  // Export to YAML (for backup/debugging)
  async exportToYaml(): Promise<string>;
}
```

### 2.3 Backward-compatible `getConfig()` shim

To minimize churn across the codebase, the existing `getConfig()` function in `config.ts` will be updated to delegate to `ConfigService.getInstance().getConfig()`. This means most consumers (router, dispatcher, auth, selectors, etc.) need **zero changes** initially.

```typescript
// config.ts (updated)
export function getConfig(): PlexusConfig {
  return ConfigService.getInstance().getConfig();
}
```

---

## Phase 3: Auto-Import on First Launch

### 3.1 Import Logic

In `index.ts` startup sequence, **after** database initialization and migrations:

```
1. Check if providers table is empty (first launch indicator)
2. If empty AND plexus.yaml exists:
   a. Parse and validate plexus.yaml
   b. Import all providers, models, aliases, keys, user_quotas, mcp_servers, settings
   c. Log: "Imported configuration from plexus.yaml into database"
3. If empty AND auth.json exists:
   a. Parse auth.json
   b. Import all OAuth credentials
   c. Log: "Imported OAuth credentials from auth.json into database"
4. If NOT empty:
   a. Load config from database (normal path)
   b. Log: "Loaded configuration from database"
```

### 3.2 Import Mapping

YAML → DB mapping for each section:

**Providers:**
```
providers.<id> → INSERT INTO providers (id, display_name, api_base_url, ...)
providers.<id>.models (if array) → INSERT INTO provider_models (provider_id, model_name, sort_order)
providers.<id>.models (if map) → INSERT INTO provider_models (provider_id, model_name, pricing_config, ...)
providers.<id>.quota_checker → UPDATE providers SET quota_checker_type, quota_checker_options, ...
```

**Model Aliases:**
```
models.<id> → INSERT INTO model_aliases (id, selector, priority, ...)
models.<id>.targets[] → INSERT INTO model_alias_targets (alias_id, provider_id, model_name, enabled, sort_order)
models.<id>.additional_aliases → UPDATE model_aliases SET additional_aliases = JSON(...)
models.<id>.advanced → UPDATE model_aliases SET advanced = JSON(...)
models.<id>.metadata → UPDATE model_aliases SET metadata_source, metadata_source_path
```

**Keys:**
```
keys.<name> → INSERT INTO api_keys (name, secret, comment, quota_name)
```

**User Quotas:**
```
user_quotas.<name> → INSERT INTO user_quota_definitions (name, quota_type, limit_type, limit_value, duration)
```

**MCP Servers:**
```
mcp_servers.<name> → INSERT INTO mcp_servers (name, upstream_url, enabled, headers)
```

**Settings/Policies:**
```
failover.enabled → INSERT INTO settings (key='failover.enabled', value=JSON(true))
failover.retryableStatusCodes → INSERT INTO settings (key='failover.retryableStatusCodes', value=JSON([...]))
cooldown.initialMinutes → INSERT INTO settings (key='cooldown.initialMinutes', value=JSON(2))
performanceExplorationRate → INSERT INTO settings (key='performanceExplorationRate', value=JSON(0.05))
```

**OAuth (from auth.json):**
```
<provider>.accounts.<accountId> → INSERT INTO oauth_credentials (oauth_provider, account_id, access_token, refresh_token, expires_at)
```

---

## Phase 4: Update Backend Consumers

### 4.1 Files That Need Changes

The following files currently call `getConfig()` and will continue working via the shim, but routes that **write** config need updating:

| File | Change Required |
|---|---|
| `config.ts` | Refactor: `getConfig()` delegates to ConfigService, remove YAML loading/watching for runtime data, keep minimal bootstrap (adminKey) |
| `routes/management/config.ts` | **Major rewrite**: Replace YAML read/write with ConfigService CRUD calls. Keep GET/POST for backward compat but route through DB. Add export-to-yaml endpoint. |
| `routes/management/user-quotas.ts` | Update: Use ConfigRepository for user_quota_definitions table instead of YAML write-back |
| `utils/auth.ts` | Update: `getKeyBySecret()` via ConfigRepository for key lookup (can remain using `getConfig()` shim initially) |
| `services/oauth-auth-manager.ts` | **Major rewrite**: Store/retrieve OAuth credentials from `oauth_credentials` table instead of auth.json file |
| `services/quota/quota-scheduler.ts` | Minor: Already receives `quotas` array — no change needed if `getConfig().quotas` still works |
| `services/quota/quota-enforcer.ts` | Minor: Already reads user_quotas from config — works via shim |
| `services/router.ts` | No change: Uses `getConfig()` shim |
| `services/dispatcher.ts` | No change: Uses `getConfig()` shim |
| `services/cooldown-manager.ts` | No change: Uses `getConfig()` shim |
| `services/selectors/*.ts` | No change: Uses `getConfig()` shim |
| `routes/inference/models.ts` | No change: Uses `getConfig()` shim |
| `index.ts` | Update: Add import logic, initialize ConfigService |

### 4.2 Management API Changes

The management API endpoints need to shift from YAML manipulation to direct DB operations:

**Config Routes (config.ts):**
- `GET /v0/management/config` → Returns generated YAML from DB (for backward compat / editor UI)
- `POST /v0/management/config` → Parses YAML, writes all entities to DB, refreshes cache
- `DELETE /v0/management/models/:aliasId` → `ConfigService.deleteAlias(id)`
- `DELETE /v0/management/models` → `ConfigService.deleteAllAliases()`
- `DELETE /v0/management/providers/:providerId` → `ConfigService.deleteProvider(id, cascade)`
- MCP CRUD → `ConfigService.saveMcpServer()` / `deleteMcpServer()`

**New Endpoints (optional, for granular API):**
- `GET /v0/management/providers` → List all providers from DB
- `GET /v0/management/providers/:id` → Single provider
- `POST /v0/management/providers/:id` → Create/update provider
- `GET /v0/management/aliases` → List all aliases from DB
- `POST /v0/management/aliases/:id` → Create/update alias
- `GET /v0/management/keys` → List all keys from DB
- `POST /v0/management/keys/:name` → Create/update key
- `DELETE /v0/management/keys/:name` → Delete key
- `GET /v0/management/settings` → Get all settings
- `PATCH /v0/management/settings` → Update settings

**Export Endpoint:**
- `GET /v0/management/config/export` → Generate full plexus.yaml from DB state (for backup)

---

## Phase 5: Update Frontend

### 5.1 Frontend API Layer (`lib/api.ts`)

The frontend currently does a lot of "fetch YAML → parse → extract section → modify → stringify → POST back" for every operation. This is fragile and will be replaced with direct JSON API calls.

**Changes:**

| Current Method | Current Behavior | New Behavior |
|---|---|---|
| `getProviders()` | Fetches YAML, parses, extracts providers | `GET /v0/management/providers` → JSON |
| `saveProvider()` | Fetches YAML, merges, POSTs YAML | `POST /v0/management/providers/:id` → JSON |
| `deleteProvider()` | Already uses dedicated endpoint | No change needed |
| `getAliases()` | Fetches YAML, parses, extracts models | `GET /v0/management/aliases` → JSON |
| `saveAlias()` | Fetches YAML, merges, POSTs YAML | `POST /v0/management/aliases/:id` → JSON |
| `getKeys()` | Fetches YAML, parses, extracts keys | `GET /v0/management/keys` → JSON |
| `saveKey()` | Fetches YAML, merges, POSTs YAML | `POST /v0/management/keys/:name` → JSON |
| `deleteKey()` | Fetches YAML, merges, POSTs YAML | `DELETE /v0/management/keys/:name` |
| `getModels()` | Fetches YAML, extracts provider models | `GET /v0/management/providers` → extract from response |
| `getConfig()` | Fetches raw YAML | Keep: `GET /v0/management/config` (still returns YAML for editor) |
| `saveConfig()` | POSTs raw YAML | Keep: `POST /v0/management/config` (bulk import from YAML editor) |
| `getMcpServers()` | Already uses dedicated endpoint | No change needed |
| `saveMcpServer()` | Already uses dedicated endpoint | No change needed |
| `deleteMcpServer()` | Already uses dedicated endpoint | No change needed |
| `getUserQuotas()` | Already uses dedicated endpoint | No change needed |
| `saveUserQuota()` | Already uses dedicated endpoint | No change needed |
| `deleteUserQuota()` | Already uses dedicated endpoint | No change needed |

### 5.2 Config Editor Page

The YAML config editor page (`Config.tsx`) will remain functional. It will:
1. `GET /v0/management/config` → Returns YAML generated from DB
2. User edits YAML
3. `POST /v0/management/config` → Backend parses YAML, writes to DB, returns validated YAML

This provides a familiar "raw config editing" experience while the DB is the source of truth.

---

## Phase 6: OAuth Auth Manager Migration

### 6.1 Current State
- `OAuthAuthManager` reads/writes `auth.json` directly
- Supports auto-migration from legacy flat format
- Used at startup and during OAuth token refresh

### 6.2 New State
- `OAuthAuthManager` reads/writes `oauth_credentials` table via `ConfigRepository`
- On first launch, imports from `auth.json` if table is empty
- Token refresh writes updates back to DB
- `auth.json` becomes optional (only needed for initial import or manual credential injection)

---

## Phase 7: Remove File Watcher

Currently, `config.ts` watches `plexus.yaml` for changes and hot-reloads. Since the DB is now the source of truth:

1. Remove `fs.watch()` on `plexus.yaml`
2. The in-memory cache in `ConfigService` is updated immediately on any write operation
3. For multi-instance deployments, a polling mechanism or DB change notification could be added later (not in scope for initial migration)

---

## Implementation Order

### Step 1: Schema + Migrations
- Create all Drizzle schema files for both SQLite and PostgreSQL
- Generate migrations via `drizzle-kit generate`
- Verify migrations apply cleanly

### Step 2: ConfigRepository
- Implement the DB abstraction layer
- Unit test CRUD operations

### Step 3: ConfigService + Import
- Implement the in-memory cached service
- Implement YAML import logic
- Implement `getConfig()` shim
- Test import from example plexus.yaml

### Step 4: Update Startup Flow
- Modify `index.ts` to use ConfigService
- Add auto-import logic
- Test fresh start (import) and subsequent start (load from DB)

### Step 5: Update Management Routes
- Rewrite `config.ts` routes to use ConfigService
- Add new granular REST endpoints
- Keep backward-compatible YAML endpoints

### Step 6: Update OAuth Manager
- Migrate OAuthAuthManager to use DB
- Add auth.json import logic
- Test OAuth flows

### Step 7: Update Frontend
- Replace YAML-fetch-parse-modify-save patterns with direct JSON API calls
- Test all CRUD flows from UI

### Step 8: Cleanup
- Remove YAML file watcher
- Mark `plexus.yaml` sections (other than adminKey) as deprecated
- Update documentation
- Add config export/backup endpoint

---

## Migration Safety

### Backward Compatibility
- **plexus.yaml still works** for initial import — zero migration effort for existing users
- **Config editor** still shows/accepts YAML — familiar UX preserved
- **getConfig() API unchanged** — all internal consumers work without modification
- **Auto-import is idempotent** — only runs when DB is empty

### Rollback Strategy
- Export from DB to YAML at any time via `/v0/management/config/export`
- Can revert to YAML-based config by reverting the code and using the exported YAML
- Database tables are additive (no existing tables modified)

### Data Integrity
- Foreign keys with CASCADE deletes for provider→models and alias→targets
- Unique constraints prevent duplicates
- JSON columns validated at application layer (Zod schemas preserved)
- Transactions for multi-table writes (e.g., importing a full config)

---

## Open Questions / Decisions Needed

1. **Encryption for API keys/secrets in DB?** Currently plaintext in YAML. Could add AES encryption keyed off adminKey, but adds complexity. Recommend: same as current (plaintext) for v1, encrypt in a follow-up.

2. **Config versioning/audit trail?** Could add a `config_changelog` table to track who changed what. Recommend: defer to follow-up.

3. **Multi-instance cache invalidation?** If running multiple Plexus instances against the same DB, cache may go stale. Recommend: add a `config_version` counter in settings table that instances poll, or use DB LISTEN/NOTIFY for PostgreSQL. Defer to follow-up.

4. **Should the YAML config editor be kept long-term?** It's useful for bulk editing but bypasses granular API. Recommend: keep it as a "power user" feature.

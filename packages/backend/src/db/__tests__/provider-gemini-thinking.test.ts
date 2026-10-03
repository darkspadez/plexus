import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, initializeDatabase } from '../client';
import { runMigrations } from '../migrate';
import { ConfigRepository } from '../config-repository';
import { ProviderConfigSchema, type ProviderConfig } from '../../config';
import { BackupService } from '../../services/configuration/backup-service';
import { ConfigService } from '../../services/configuration/config-service';

describe('provider geminiThinkingEnabled persistence', () => {
  let repo: ConfigRepository;

  beforeEach(async () => {
    await closeDatabase();
    process.env.DATABASE_URL = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
    initializeDatabase(process.env.DATABASE_URL);
    await runMigrations();
    repo = new ConfigRepository();
    await repo.clearAllData();
  });

  afterEach(async () => {
    await closeDatabase();
  });

  const base: ProviderConfig = {
    api_base_url: 'https://api.example.com/v1',
    api_key: 'sk-test',
    disable_cooldown: false,
    stall_cooldown: false,
    allow_100_percent_utilization: false,
    estimateTokens: false,
    useClaudeMasking: false,
    geminiThinkingEnabled: true,
    models: {},
  };

  it('reads the flag back under the camelCase runtime key and survives an enabled toggle', async () => {
    await repo.saveProvider('gem', base);
    const loaded = (await repo.getProvider('gem')) as Record<string, unknown>;
    expect(loaded.geminiThinkingEnabled).toBe(true);
    expect(loaded).not.toHaveProperty('gemini_thinking_enabled');

    // Same merge + parse the PATCH route performs.
    const merged = ProviderConfigSchema.parse({ ...loaded, enabled: false });
    await repo.saveProvider('gem', merged);
    const after = await repo.getProvider('gem');
    expect(after?.geminiThinkingEnabled).toBe(true);
    expect(after?.enabled).toBe(false);
  });

  it('accepts the legacy gemini_thinking_enabled key from older backups', () => {
    const parsed = ProviderConfigSchema.parse({
      api_base_url: 'https://api.example.com/v1',
      api_key: 'sk-test',
      gemini_thinking_enabled: true,
    });
    expect(parsed.geminiThinkingEnabled).toBe(true);
    expect(parsed).not.toHaveProperty('gemini_thinking_enabled');
  });

  it('prefers the camelCase key when both are present', () => {
    const parsed = ProviderConfigSchema.parse({
      api_base_url: 'https://api.example.com/v1',
      api_key: 'sk-test',
      geminiThinkingEnabled: false,
      gemini_thinking_enabled: true,
    });
    expect(parsed.geminiThinkingEnabled).toBe(false);
  });

  it('keeps the flag when a pre-fix backup carrying the legacy key is restored', async () => {
    vi.spyOn(ConfigService, 'getInstance').mockReturnValue({
      getRepository: () => repo,
      initialize: async () => {},
    } as unknown as ConfigService);
    try {
      await new BackupService().restoreConfigBackup({
        plexus_backup: true,
        version: 1,
        created_at: new Date().toISOString(),
        dialect: 'sqlite',
        data: {
          providers: {
            legacy: { ...base, geminiThinkingEnabled: undefined, gemini_thinking_enabled: true },
          },
          models: {},
          keys: {},
          user_quotas: {},
          mcp_servers: {},
          mcp_keys: [],
          settings: {},
          oauth_credentials: [],
        },
      } as never);
    } finally {
      vi.restoreAllMocks();
    }
    expect((await repo.getProvider('legacy'))?.geminiThinkingEnabled).toBe(true);
  });

  it('drops optional fields when a provider is re-saved without them', async () => {
    await repo.saveProvider('full', {
      ...base,
      discount: 0.2,
      timeoutMs: 1000,
      maxConcurrency: 3,
      cache_key_injection: 'prompt_cache_key',
      compaction: { absoluteTriggerTokens: 500 },
      quota_checker: { type: 'naga', options: { apiKey: 'k' } },
    } as unknown as ProviderConfig);
    const saved = (await repo.getProvider('full')) as Record<string, unknown>;
    expect(saved.discount).toBe(0.2);
    expect(saved.compaction).toBeDefined();
    expect(saved.quota_checker).toBeDefined();

    await repo.saveProvider('full', base);
    const after = (await repo.getProvider('full')) as Record<string, unknown>;
    for (const key of [
      'discount',
      'timeoutMs',
      'maxConcurrency',
      'cache_key_injection',
      'compaction',
      'quota_checker',
    ]) {
      expect(after[key] ?? undefined).toBeUndefined();
    }
  });
});

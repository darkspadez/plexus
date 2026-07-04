/**
 * provider-schema.test.ts — Characterization / payload-parity tests.
 *
 * These tests lock down the exact Provider object that toProviderPayload()
 * produces, asserting it is IDENTICAL to what the old handleSave() in
 * useProviderForm.tsx would have passed to api.saveProvider().
 *
 * "Payload parity" here means: the Provider object passed to api.saveProvider()
 * (which then builds the HTTP body) is structurally identical between the
 * old imperative approach and the new rhf-based approach.
 *
 * Representative coverage:
 *   1. OpenAI-style (chat URL, apiKey, no OAuth, no quota)
 *   2. Ollama (ollama URL map, no apiKey, no quota)
 *   3. Custom with quota checker + quota options
 *   4. OAuth provider (oauthProvider + oauthAccount, no apiKey)
 *   5. OAuth — missing account → error (old code returned early from handleSave)
 *   6. OAuth — missing oauthProvider → defaults to 'anthropic'
 *   7. Provider with empty quotaChecker.type → quotaChecker stripped
 *   8. Advanced fields (stall, gpu, timeout, maxConcurrency)
 */
import { expect, test, describe } from 'vitest';
import {
  toProviderPayload,
  providerFormSchema,
  PROVIDER_FORM_DEFAULTS,
  OAUTH_PROVIDERS_DEFAULT,
  type ProviderFormValues,
} from '../provider-schema';

// ---------------------------------------------------------------------------
// Helper — build a minimal valid ProviderFormValues
// ---------------------------------------------------------------------------

function base(overrides: Partial<ProviderFormValues> = {}): ProviderFormValues {
  return {
    ...PROVIDER_FORM_DEFAULTS,
    id: 'test-provider',
    name: 'Test Provider',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. OpenAI-style provider
// ---------------------------------------------------------------------------

describe('toProviderPayload — OpenAI-style provider', () => {
  test('preserves all top-level fields', () => {
    const input = base({
      id: 'openai',
      name: 'OpenAI Production',
      type: ['chat'],
      apiBaseUrl: { chat: 'https://api.openai.com/v1/chat/completions' },
      apiKey: 'sk-abc123',
      enabled: true,
      estimateTokens: false,
      useClaudeMasking: false,
      disableCooldown: false,
      stallCooldown: false,
      headers: { 'X-Custom': 'value' },
      extraBody: { stream_options: { include_usage: true } },
      models: {
        'gpt-4o': { pricing: { source: 'simple', input: 0.005, output: 0.015 }, access_via: [] },
      },
      modelAutosync: { enabled: false, intervalMinutes: 60 },
      adapter: [],
    });

    const result = toProviderPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    const p = result.provider;
    expect(p.id).toBe('openai');
    expect(p.name).toBe('OpenAI Production');
    expect(p.type).toEqual(['chat']);
    expect(p.apiBaseUrl).toEqual({ chat: 'https://api.openai.com/v1/chat/completions' });
    expect(p.apiKey).toBe('sk-abc123');
    expect(p.enabled).toBe(true);
    expect(p.headers).toEqual({ 'X-Custom': 'value' });
    expect(p.extraBody).toEqual({ stream_options: { include_usage: true } });
    expect(p.models).toEqual({
      'gpt-4o': { pricing: { source: 'simple', input: 0.005, output: 0.015 }, access_via: [] },
    });
    // No quotaChecker in input → should remain undefined
    expect(p.quotaChecker).toBeUndefined();
    // OAuth fields — PROVIDER_FORM_DEFAULTS has '' for these, matching old EMPTY_PROVIDER.
    // (old code: EMPTY_PROVIDER = { ..., oauthProvider: '', oauthAccount: '', ... })
    // For non-OAuth mode, these remain as empty strings (falsy, passed through unchanged).
    expect(p.oauthProvider).toBe('');
    expect(p.oauthAccount).toBe('');
  });

  test('schema validates an OpenAI-style form correctly', () => {
    const input = base({
      id: 'openai',
      apiKey: 'sk-abc123',
      type: ['chat'],
    });
    const result = providerFormSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('schema rejects empty id', () => {
    const input = base({ id: '' });
    const result = providerFormSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Should have failed');
    expect(result.error.issues[0].message).toMatch(/required/i);
  });
});

// ---------------------------------------------------------------------------
// 2. Ollama-style provider (multiple apiBaseUrl keys)
// ---------------------------------------------------------------------------

describe('toProviderPayload — Ollama provider', () => {
  test('passes through record apiBaseUrl unchanged', () => {
    const input = base({
      id: 'my-ollama',
      name: 'Local Ollama',
      type: ['ollama', 'chat'],
      apiBaseUrl: {
        ollama: 'http://localhost:11434',
        chat: 'http://localhost:11434/v1/chat/completions',
      },
      apiKey: '',
    });

    const result = toProviderPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    expect(result.provider.apiBaseUrl).toEqual({
      ollama: 'http://localhost:11434',
      chat: 'http://localhost:11434/v1/chat/completions',
    });
    expect(result.provider.type).toEqual(['ollama', 'chat']);
  });
});

// ---------------------------------------------------------------------------
// 3. Custom provider with quota checker
// ---------------------------------------------------------------------------

describe('toProviderPayload — quota checker', () => {
  test('preserves a fully configured quota checker', () => {
    const input = base({
      id: 'naga-provider',
      quotaChecker: {
        type: 'naga',
        enabled: true,
        intervalMinutes: 30,
        options: { apiKey: 'naga-secret' },
      },
    });

    const result = toProviderPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    expect(result.provider.quotaChecker).toEqual({
      type: 'naga',
      enabled: true,
      intervalMinutes: 30,
      options: { apiKey: 'naga-secret' },
    });
  });

  test('strips quotaChecker when type is empty string', () => {
    const input = base({
      id: 'stripped-provider',
      quotaChecker: {
        type: '',
        enabled: false,
        intervalMinutes: 30,
        options: {},
      },
    });

    const result = toProviderPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    // Old handleSave: if (providerToSave.quotaChecker && !providerToSave.quotaChecker.type?.trim())
    //   providerToSave = { ...providerToSave, quotaChecker: undefined }
    expect(result.provider.quotaChecker).toBeUndefined();
  });

  test('strips quotaChecker when type is whitespace only', () => {
    const input = base({
      id: 'ws-provider',
      quotaChecker: {
        type: '   ',
        enabled: true,
        intervalMinutes: 10,
      },
    });

    const result = toProviderPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.provider.quotaChecker).toBeUndefined();
  });

  test('preserves quotaChecker when type is a non-blank string', () => {
    const input = base({
      id: 'valid-checker',
      quotaChecker: {
        type: 'minimax',
        enabled: true,
        intervalMinutes: 15,
        options: { groupid: 'gid', token: 'tok' },
      },
    });

    const result = toProviderPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.provider.quotaChecker?.type).toBe('minimax');
  });
});

// ---------------------------------------------------------------------------
// 4. OAuth provider — valid (oauthProvider + oauthAccount set)
// ---------------------------------------------------------------------------

describe('toProviderPayload — OAuth provider (valid)', () => {
  test('passes through all OAuth fields', () => {
    const input = base({
      id: 'claude-oauth',
      name: 'Claude Code OAuth',
      apiBaseUrl: 'oauth://anthropic',
      apiKey: '',
      oauthProvider: 'anthropic',
      oauthAccount: 'user@example.com',
    });

    const result = toProviderPayload(input, { isOAuthMode: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    const p = result.provider;
    expect(p.oauthProvider).toBe('anthropic');
    expect(p.oauthAccount).toBe('user@example.com');
    expect(p.apiBaseUrl).toBe('oauth://anthropic');
  });

  test('auto-detects OAuth mode from apiBaseUrl string', () => {
    const input = base({
      id: 'copilot-oauth',
      apiBaseUrl: 'oauth://github-copilot',
      oauthProvider: 'github-copilot',
      oauthAccount: 'ghuser',
    });

    // No explicit isOAuthMode — should auto-detect
    const result = toProviderPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.provider.oauthProvider).toBe('github-copilot');
  });
});

// ---------------------------------------------------------------------------
// 5. OAuth — missing oauthAccount → error
// ---------------------------------------------------------------------------

describe('toProviderPayload — OAuth validation', () => {
  test('returns error when oauthAccount is empty in OAuth mode', () => {
    const input = base({
      id: 'oauth-no-account',
      apiBaseUrl: 'oauth://anthropic',
      oauthProvider: 'anthropic',
      oauthAccount: '',
    });

    const result = toProviderPayload(input, { isOAuthMode: true });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected error');
    expect(result.error).toMatch(/account.*required/i);
  });

  test('returns error when oauthAccount is whitespace-only in OAuth mode', () => {
    const input = base({
      id: 'oauth-ws-account',
      apiBaseUrl: 'oauth://anthropic',
      oauthProvider: 'anthropic',
      oauthAccount: '   ',
    });

    const result = toProviderPayload(input, { isOAuthMode: true });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected error');
  });
});

// ---------------------------------------------------------------------------
// 6. OAuth — missing oauthProvider → defaults to OAUTH_PROVIDERS_DEFAULT
// ---------------------------------------------------------------------------

describe('toProviderPayload — OAuth default oauthProvider', () => {
  test('defaults oauthProvider to OAUTH_PROVIDERS_DEFAULT when empty', () => {
    const input = base({
      id: 'oauth-no-provider',
      apiBaseUrl: 'oauth://anthropic',
      oauthProvider: '', // empty — should be defaulted
      oauthAccount: 'user@example.com',
    });

    const result = toProviderPayload(input, { isOAuthMode: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    // Old code: if (isOAuthMode && !providerToSave.oauthProvider) { oauthProvider = OAUTH_PROVIDERS[0].value }
    expect(result.provider.oauthProvider).toBe(OAUTH_PROVIDERS_DEFAULT);
  });

  test('does NOT override oauthProvider if already set', () => {
    const input = base({
      id: 'oauth-has-provider',
      apiBaseUrl: 'oauth://github-copilot',
      oauthProvider: 'github-copilot',
      oauthAccount: 'user',
    });

    const result = toProviderPayload(input, { isOAuthMode: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.provider.oauthProvider).toBe('github-copilot');
  });
});

// ---------------------------------------------------------------------------
// 7. Advanced fields (stall, gpu, timeout, maxConcurrency)
// ---------------------------------------------------------------------------

describe('toProviderPayload — advanced fields', () => {
  test('preserves stall detection overrides', () => {
    const input = base({
      id: 'stall-provider',
      stallTtfbMs: 5000,
      stallTtfbBytes: 100,
      stallMinBps: 50,
      stallWindowMs: 10000,
      stallGracePeriodMs: 2000,
    });

    const result = toProviderPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    const p = result.provider;
    expect(p.stallTtfbMs).toBe(5000);
    expect(p.stallTtfbBytes).toBe(100);
    expect(p.stallMinBps).toBe(50);
    expect(p.stallWindowMs).toBe(10000);
    expect(p.stallGracePeriodMs).toBe(2000);
  });

  test('preserves GPU profile fields', () => {
    const input = base({
      id: 'gpu-provider',
      gpu_profile: 'rtx-4090',
      gpu_ram_gb: 24,
      gpu_bandwidth_tb_s: 1.008,
      gpu_flops_tflop: 165.2,
      gpu_power_draw_watts: 450,
    });

    const result = toProviderPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    const p = result.provider;
    expect(p.gpu_profile).toBe('rtx-4090');
    expect(p.gpu_ram_gb).toBe(24);
    expect(p.gpu_bandwidth_tb_s).toBe(1.008);
    expect(p.gpu_flops_tflop).toBe(165.2);
    expect(p.gpu_power_draw_watts).toBe(450);
  });

  test('preserves timeoutMs and maxConcurrency', () => {
    const input = base({
      id: 'rate-limited',
      timeoutMs: 30000,
      maxConcurrency: 5,
    });

    const result = toProviderPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    expect(result.provider.timeoutMs).toBe(30000);
    expect(result.provider.maxConcurrency).toBe(5);
  });

  test('preserves null maxConcurrency (unlimited)', () => {
    const input = base({
      id: 'unlimited',
      maxConcurrency: null,
    });

    const result = toProviderPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.provider.maxConcurrency).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. Non-OAuth provider is NOT affected by OAuth rules
// ---------------------------------------------------------------------------

describe('toProviderPayload — non-OAuth provider', () => {
  test('does not default oauthProvider for non-OAuth providers', () => {
    const input = base({
      id: 'plain-chat',
      apiBaseUrl: { chat: 'https://api.example.com/v1/chat/completions' },
      apiKey: 'key123',
      oauthProvider: undefined,
      oauthAccount: undefined,
    });

    const result = toProviderPayload(input, { isOAuthMode: false });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    // oauthProvider should remain undefined (not defaulted)
    expect(result.provider.oauthProvider).toBeUndefined();
  });

  test('non-OAuth with missing account does NOT error', () => {
    const input = base({
      id: 'plain-provider',
      apiKey: 'key',
      oauthAccount: '',
    });

    const result = toProviderPayload(input, { isOAuthMode: false });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. PROVIDER_FORM_DEFAULTS match EMPTY_PROVIDER shape
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 10. Compaction override — verbatim passthrough (nulls preserved) / omitted when absent
// ---------------------------------------------------------------------------

describe('toProviderPayload — compaction override', () => {
  test('emits compaction verbatim, including a null subfield', () => {
    const input = base({
      id: 'compaction-provider',
      compaction: { enabled: true, triggerRatio: 0.5, absoluteTriggerTokens: null },
    });

    const result = toProviderPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    expect(result.provider.compaction).toEqual({
      enabled: true,
      triggerRatio: 0.5,
      absoluteTriggerTokens: null,
    });
  });

  test('omits compaction when absent from the editing state', () => {
    const input = base({ id: 'no-compaction-provider' });

    const result = toProviderPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    expect(result.provider.compaction).toBeUndefined();
  });
});

describe('PROVIDER_FORM_DEFAULTS', () => {
  test('validates successfully against providerFormSchema', () => {
    // PROVIDER_FORM_DEFAULTS represents a new empty provider form
    // (same as EMPTY_PROVIDER in old useProviderForm.tsx)
    const result = providerFormSchema.safeParse(PROVIDER_FORM_DEFAULTS);
    // id is empty, so this should FAIL validation (id required)
    expect(result.success).toBe(false);
  });

  test('validates successfully when id is set', () => {
    const result = providerFormSchema.safeParse({ ...PROVIDER_FORM_DEFAULTS, id: 'my-provider' });
    expect(result.success).toBe(true);
  });
});

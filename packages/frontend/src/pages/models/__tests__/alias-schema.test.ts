/**
 * alias-schema.test.ts — Characterization / payload-parity tests.
 *
 * These tests lock down the exact Alias object that toAliasPayload()
 * produces, asserting it is IDENTICAL to what the old handleSave() in
 * Models.tsx / useModels.ts would have passed to api.saveAlias().
 *
 * "Payload parity" means: the Alias object passed to api.saveAlias()
 * is structurally identical between the old imperative approach and the
 * new rhf-based approach.
 *
 * Representative coverage:
 *   1. Catalog-backed alias (openrouter source)
 *   2. Custom metadata source with overrides
 *   3. Multiple target groups
 *   4. Architecture + behaviors fields
 *   5. Metadata overrides (pricing, architecture, supported_parameters)
 *   6. Custom metadata — missing name → error
 *   7. Empty id → error
 *   8. ALIAS_FORM_DEFAULTS matches EMPTY_ALIAS shape
 */
import { expect, test, describe } from 'vitest';
import {
  toAliasPayload,
  aliasFormSchema,
  ALIAS_FORM_DEFAULTS,
  type AliasFormValues,
} from '../alias-schema';

// ---------------------------------------------------------------------------
// Helper — build a minimal valid AliasFormValues
// ---------------------------------------------------------------------------

function base(overrides: Partial<AliasFormValues> = {}): AliasFormValues {
  return {
    ...ALIAS_FORM_DEFAULTS,
    id: 'test-alias',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Catalog-backed alias (openrouter source)
// ---------------------------------------------------------------------------

describe('toAliasPayload — catalog-backed alias', () => {
  test('passes through all top-level fields unchanged', () => {
    const input = base({
      id: 'gpt-4o',
      aliases: ['gpt4o', 'gpt-4o-latest'],
      priority: 'selector',
      type: 'text',
      target_groups: [
        {
          name: 'default',
          selector: 'random',
          targets: [
            { provider: 'openai', model: 'gpt-4o', enabled: true },
            { provider: 'azure', model: 'gpt-4o', enabled: false },
          ],
        },
      ],
      metadata: {
        source: 'openrouter',
        source_path: 'openai/gpt-4o',
        overrides: { name: 'GPT-4o' },
      },
      sticky_session: true,
    });

    const result = toAliasPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    const a = result.alias;
    expect(a.id).toBe('gpt-4o');
    expect(a.aliases).toEqual(['gpt4o', 'gpt-4o-latest']);
    expect(a.priority).toBe('selector');
    expect(a.type).toBe('text');
    expect(a.target_groups).toHaveLength(1);
    expect(a.target_groups[0].targets).toHaveLength(2);
    expect(a.target_groups[0].targets[0]).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
      enabled: true,
    });
    expect(a.metadata).toEqual({
      source: 'openrouter',
      source_path: 'openai/gpt-4o',
      overrides: { name: 'GPT-4o' },
    });
  });

  test('schema validates a catalog-backed alias correctly', () => {
    const input = base({
      id: 'claude-3-5-sonnet',
      metadata: {
        source: 'openrouter',
        source_path: 'anthropic/claude-3.5-sonnet',
      },
    });
    const result = aliasFormSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Custom metadata source with overrides
// ---------------------------------------------------------------------------

describe('toAliasPayload — custom metadata source', () => {
  test('passes through custom metadata with full overrides', () => {
    const input = base({
      id: 'my-local-model',
      metadata: {
        source: 'custom',
        overrides: {
          name: 'My Local Model',
          context_length: 8192,
          pricing: { prompt: '0', completion: '0' },
          architecture: {
            input_modalities: ['text'],
            output_modalities: ['text'],
          },
          supported_parameters: ['temperature', 'top_p'],
        },
      },
    });

    const result = toAliasPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    const a = result.alias;
    expect(a.metadata?.source).toBe('custom');
    expect(a.metadata?.overrides?.name).toBe('My Local Model');
    expect(a.metadata?.overrides?.context_length).toBe(8192);
    expect(a.metadata?.overrides?.pricing).toEqual({ prompt: '0', completion: '0' });
    expect(a.metadata?.overrides?.architecture).toEqual({
      input_modalities: ['text'],
      output_modalities: ['text'],
    });
    expect(a.metadata?.overrides?.supported_parameters).toEqual(['temperature', 'top_p']);
  });

  test('rejects custom metadata with empty name', () => {
    const input = base({
      id: 'custom-no-name',
      metadata: {
        source: 'custom',
        overrides: {
          name: '',
          context_length: 4096,
        } as any,
      },
    });

    const result = toAliasPayload(input);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected error');
    expect(result.error).toMatch(/custom metadata/i);
  });

  test('rejects custom metadata with whitespace-only name', () => {
    const input = base({
      id: 'custom-ws-name',
      metadata: {
        source: 'custom',
        overrides: {
          name: '   ',
          context_length: 4096,
        } as any,
      },
    });

    const result = toAliasPayload(input);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected error');
  });
});

// ---------------------------------------------------------------------------
// 3. Multiple target groups
// ---------------------------------------------------------------------------

describe('toAliasPayload — multiple target groups', () => {
  test('preserves all target groups and their targets', () => {
    const input = base({
      id: 'multi-group-alias',
      target_groups: [
        {
          name: 'primary',
          selector: 'round_robin',
          targets: [
            { provider: 'openai', model: 'gpt-4o', enabled: true },
            { provider: 'anthropic', model: 'claude-3-5-sonnet', enabled: true },
          ],
        },
        {
          name: 'fallback',
          selector: 'random',
          targets: [{ provider: 'groq', model: 'llama3-70b', enabled: true }],
        },
      ],
    });

    const result = toAliasPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    const a = result.alias;
    expect(a.target_groups).toHaveLength(2);
    expect(a.target_groups[0].name).toBe('primary');
    expect(a.target_groups[0].selector).toBe('round_robin');
    expect(a.target_groups[0].targets).toHaveLength(2);
    expect(a.target_groups[1].name).toBe('fallback');
    expect(a.target_groups[1].targets).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Architecture + behaviors fields
// ---------------------------------------------------------------------------

describe('toAliasPayload — architecture and behaviors fields', () => {
  test('preserves model_architecture fields', () => {
    const input = base({
      id: 'arch-alias',
      model_architecture: {
        total_params: 70_000_000_000,
        active_params: 70_000_000_000,
        layers: 80,
        heads: 64,
        dtype: 'bf16',
        context_length: 128_000,
      },
    });

    const result = toAliasPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    const a = result.alias;
    expect(a.model_architecture).toEqual({
      total_params: 70_000_000_000,
      active_params: 70_000_000_000,
      layers: 80,
      heads: 64,
      dtype: 'bf16',
      context_length: 128_000,
    });
  });

  test('preserves advanced behaviors', () => {
    const input = base({
      id: 'behaviors-alias',
      advanced: [{ type: 'strip_adaptive_thinking', enabled: true }],
    });

    const result = toAliasPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    expect(result.alias.advanced).toEqual([{ type: 'strip_adaptive_thinking', enabled: true }]);
  });

  test('preserves preferred_api array', () => {
    const input = base({
      id: 'preferred-api-alias',
      preferred_api: ['messages', 'chat_completions'],
    });

    const result = toAliasPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    expect(result.alias.preferred_api).toEqual(['messages', 'chat_completions']);
  });

  test('preserves sticky_session and enforce_limits', () => {
    const input = base({
      id: 'sticky-alias',
      sticky_session: false,
      enforce_limits: true,
    });

    const result = toAliasPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    expect(result.alias.sticky_session).toBe(false);
    expect(result.alias.enforce_limits).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Metadata overrides — pricing, architecture, supported_parameters
// ---------------------------------------------------------------------------

describe('toAliasPayload — metadata overrides detail', () => {
  test('preserves all pricing subfields', () => {
    const input = base({
      id: 'pricing-alias',
      metadata: {
        source: 'openrouter',
        source_path: 'openai/gpt-4o',
        overrides: {
          pricing: {
            prompt: '0.0025',
            completion: '0.01',
            input_cache_read: '0.00125',
            input_cache_write: '0.01',
          },
        },
      },
    });

    const result = toAliasPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    expect(result.alias.metadata?.overrides?.pricing).toEqual({
      prompt: '0.0025',
      completion: '0.01',
      input_cache_read: '0.00125',
      input_cache_write: '0.01',
    });
  });

  test('preserves top_provider overrides', () => {
    const input = base({
      id: 'top-provider-alias',
      metadata: {
        source: 'models.dev',
        source_path: 'anthropic/claude-3.5-sonnet',
        overrides: {
          top_provider: {
            context_length: 200_000,
            max_completion_tokens: 8192,
          },
        },
      },
    });

    const result = toAliasPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    expect(result.alias.metadata?.overrides?.top_provider).toEqual({
      context_length: 200_000,
      max_completion_tokens: 8192,
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Empty id → error
// ---------------------------------------------------------------------------

describe('toAliasPayload — validation errors', () => {
  test('returns error when id is empty', () => {
    const input = base({ id: '' });
    const result = toAliasPayload(input);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected error');
    expect(result.error).toMatch(/id.*required/i);
  });

  test('schema rejects empty id', () => {
    const input = base({ id: '' });
    const result = aliasFormSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('schema validates a minimal alias', () => {
    const input = base({ id: 'my-alias' });
    const result = aliasFormSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. api_match priority
// ---------------------------------------------------------------------------

describe('toAliasPayload — priority: api_match', () => {
  test('passes through api_match priority', () => {
    const input = base({
      id: 'api-match-alias',
      priority: 'api_match',
    });

    const result = toAliasPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.alias.priority).toBe('api_match');
  });
});

// ---------------------------------------------------------------------------
// 8. ALIAS_FORM_DEFAULTS matches EMPTY_ALIAS shape from useModels.ts
// ---------------------------------------------------------------------------

describe('ALIAS_FORM_DEFAULTS', () => {
  test('matches EMPTY_ALIAS shape from useModels.ts', () => {
    // EMPTY_ALIAS in useModels.ts:
    // { id: '', aliases: [], priority: 'selector',
    //   target_groups: [{ name: 'default', selector: 'random', targets: [] }],
    //   sticky_session: true }
    expect(ALIAS_FORM_DEFAULTS.id).toBe('');
    expect(ALIAS_FORM_DEFAULTS.aliases).toEqual([]);
    expect(ALIAS_FORM_DEFAULTS.priority).toBe('selector');
    expect(ALIAS_FORM_DEFAULTS.target_groups).toEqual([
      { name: 'default', selector: 'random', targets: [] },
    ]);
    expect(ALIAS_FORM_DEFAULTS.sticky_session).toBe(true);
  });

  test('schema rejects defaults (empty id)', () => {
    const result = aliasFormSchema.safeParse(ALIAS_FORM_DEFAULTS);
    expect(result.success).toBe(false);
  });

  test('schema validates defaults with id set', () => {
    const result = aliasFormSchema.safeParse({ ...ALIAS_FORM_DEFAULTS, id: 'my-alias' });
    expect(result.success).toBe(true);
  });

  test('toAliasPayload produces EMPTY_ALIAS equivalent when id is set', () => {
    const input = { ...ALIAS_FORM_DEFAULTS, id: 'new-alias' };
    const result = toAliasPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    // The payload should match what useModels.ts would produce for EMPTY_ALIAS with this id
    expect(result.alias.id).toBe('new-alias');
    expect(result.alias.aliases).toEqual([]);
    expect(result.alias.priority).toBe('selector');
    expect(result.alias.target_groups).toEqual([
      { name: 'default', selector: 'random', targets: [] },
    ]);
    expect(result.alias.sticky_session).toBe(true);
    expect(result.alias.metadata).toBeUndefined();
    expect(result.alias.advanced).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 9. Compaction override — verbatim passthrough (nulls preserved) / omitted when absent
// ---------------------------------------------------------------------------

describe('toAliasPayload — compaction override', () => {
  test('emits compaction verbatim, including a null subfield', () => {
    const input = base({
      id: 'compaction-alias',
      compaction: { enabled: true, triggerRatio: 0.5, absoluteTriggerTokens: null },
    });

    const result = toAliasPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    expect(result.alias.compaction).toEqual({
      enabled: true,
      triggerRatio: 0.5,
      absoluteTriggerTokens: null,
    });
  });

  test('omits compaction when absent from the editing state', () => {
    const input = base({ id: 'no-compaction-alias' });

    const result = toAliasPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    expect(result.alias.compaction).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 10. Embeddings type alias
// ---------------------------------------------------------------------------

describe('toAliasPayload — embeddings type', () => {
  test('preserves embeddings type alias', () => {
    const input = base({
      id: 'text-embedding-3-large',
      type: 'embeddings',
      target_groups: [
        {
          name: 'default',
          selector: 'random',
          targets: [{ provider: 'openai', model: 'text-embedding-3-large', enabled: true }],
        },
      ],
    });

    const result = toAliasPayload(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    expect(result.alias.type).toBe('embeddings');
    expect(result.alias.id).toBe('text-embedding-3-large');
  });
});

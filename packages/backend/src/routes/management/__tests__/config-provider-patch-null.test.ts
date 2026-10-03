import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const state = vi.hoisted(() => {
  const providers = new Map<string, Record<string, unknown>>();
  return {
    providers,
    getProvider: vi.fn(async (slug: string) => providers.get(slug) ?? null),
    saveProvider: vi.fn(async (slug: string, provider: Record<string, unknown>) => {
      providers.set(slug, provider);
    }),
  };
});

vi.mock('../../../services/configuration/config-service', () => ({
  ConfigService: {
    getInstance: () => ({
      getRepository: () => ({ getProvider: state.getProvider }),
      saveProvider: state.saveProvider,
    }),
  },
}));

import { registerConfigRoutes } from '../config';
import '../../../services/quota/checkers/naga-checker';

const url = '/v0/management/providers/p';
const base = {
  api_base_url: 'https://example.test/v1',
  api_key: 'sk-test',
  geminiThinkingEnabled: true,
};
const full = {
  ...base,
  discount: 0.25,
  timeoutMs: 30000,
  maxConcurrency: 4,
  stallTtfbMs: 10000,
  quota_checker: { type: 'naga', options: { apiKey: 'sk-test' } },
  cache_key_injection: 'prompt_cache_key',
  compaction: { absoluteTriggerTokens: 1000 },
  raw_passthrough: { enabled: false, base_url: 'https://raw.example.test' },
};

describe('provider PATCH null semantics', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    state.providers.clear();
    state.providers.set('p', { ...full });
    fastify = Fastify();
    await registerConfigRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  const patch = (payload: Record<string, unknown>) =>
    fastify.inject({ method: 'PATCH', url, payload });

  it('omission preserves every saved field, including geminiThinkingEnabled', async () => {
    const res = await patch({ enabled: false });
    expect(res.statusCode).toBe(200);
    expect(state.providers.get('p')).toMatchObject({ ...full, enabled: false });
  });

  it.each([
    'discount',
    'timeoutMs',
    'maxConcurrency',
    'stallTtfbMs',
    'quota_checker',
    'cache_key_injection',
    'compaction',
    'raw_passthrough',
  ])('null clears %s', async (field) => {
    const res = await patch({ [field]: null });
    expect(res.statusCode).toBe(200);
    const saved = state.providers.get('p')!;
    expect(saved[field] ?? null).toBeNull();
    // Other fields untouched.
    expect(saved.api_key).toBe('sk-test');
    expect(saved.geminiThinkingEnabled).toBe(true);
  });

  it('fields with defaults reset to their default when nulled', async () => {
    state.providers.set('p', { ...full, enabled: false });
    const res = await patch({ enabled: null });
    expect(res.statusCode).toBe(200);
    expect(state.providers.get('p')?.enabled).toBe(true);
  });

  it('rejects nulling a required field', async () => {
    const res = await patch({ api_base_url: null });
    expect(res.statusCode).toBe(400);
    const res2 = await patch({ api_key: null });
    expect(res2.statusCode).toBe(400);
  });

  it('does not treat nested nulls as clears', async () => {
    const res = await patch({ compaction: { absoluteTriggerTokens: null } });
    expect(res.statusCode).toBe(200);
    expect((state.providers.get('p')?.compaction as Record<string, unknown>) ?? {}).toHaveProperty(
      'absoluteTriggerTokens',
      null
    );
  });
});

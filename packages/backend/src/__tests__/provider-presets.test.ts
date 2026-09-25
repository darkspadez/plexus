import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import {
  ProviderPresetSchema,
  applyProviderPreset,
  findProviderPreset,
  substitutePresetVars,
  type ProviderPreset,
  type ProviderPresetDraft,
} from '@plexus/shared';
import {
  REMOTE_PRESETS_URL,
  defaultPresetsPath,
  loadLocalPresets,
  loadProviderPresets,
} from '../services/provider-presets';

let catalog: ProviderPreset[] = [];

beforeAll(async () => {
  catalog = await loadLocalPresets();
});

const blankDraft = (): ProviderPresetDraft => ({
  id: '',
  name: '',
  apiBaseUrl: {},
  apiKey: '',
  oauthProvider: '',
  type: [],
  pi_ai_provider: undefined,
  auto_compat: undefined,
});

const presetOrThrow = (id: string): ProviderPreset => {
  const preset = findProviderPreset(catalog, id);
  if (!preset) throw new Error(`preset '${id}' missing from catalog`);
  return preset;
};

const remoteEntry = {
  id: 'remote-only',
  name: 'Remote Only',
  suggestedProviderId: 'remote-only',
  suggestedName: 'Remote Only',
  apiBaseUrl: { chat: 'https://remote.test/v1' },
  piAiProvider: 'openai',
  autoCompat: true,
};

describe('built-in presets catalog (data/provider-presets.json)', () => {
  test('loads a non-empty catalog from the default path', async () => {
    expect(defaultPresetsPath().endsWith(join('data', 'provider-presets.json'))).toBe(true);
    expect(catalog.length).toBeGreaterThan(0);
  });

  test('every preset parses against the schema', () => {
    for (const preset of catalog) {
      expect(
        ProviderPresetSchema.safeParse(preset).success,
        `preset '${(preset as { id?: unknown }).id}' fails schema validation`
      ).toBe(true);
    }
  });

  test('preset ids are unique', () => {
    const ids = catalog.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every URL is a valid http(s) URL once template vars are filled', () => {
    for (const preset of catalog) {
      const filled = substitutePresetVars(
        preset.apiBaseUrl,
        Object.fromEntries(preset.templateVars.map((variable) => [variable.key, 'test']))
      );
      for (const [apiType, url] of Object.entries(filled)) {
        expect(url, `${preset.id}.${apiType} has an unsubstituted placeholder`).not.toContain('{');
        const parsed = new URL(url);
        expect(['http:', 'https:']).toContain(parsed.protocol);
        expect(parsed.search, `${preset.id}.${apiType} must not carry a query`).toBe('');
        expect(parsed.hash, `${preset.id}.${apiType} must not carry a fragment`).toBe('');
      }
    }
  });

  test('experimental flags and template vars reference real entries', () => {
    for (const preset of catalog) {
      for (const api of preset.experimentalApis) {
        expect(preset.apiBaseUrl, `${preset.id} experimental '${api}'`).toHaveProperty(api);
      }
      for (const variable of preset.templateVars) {
        const referenced = Object.values(preset.apiBaseUrl).some((url) =>
          url.includes(`{${variable.key}}`)
        );
        expect(referenced, `${preset.id} template var '${variable.key}' unreferenced`).toBe(true);
      }
    }
  });

  test('gateway providers without a pi-ai builtin map to the openrouter catalog', () => {
    // pi-ai ships no kilocode/neuralwatt builtins; the multi-protocol
    // openrouter catalog is the closest match for compat mapping.
    expect(presetOrThrow('kilocode').piAiProvider).toBe('openrouter');
    expect(presetOrThrow('neuralwatt').piAiProvider).toBe('openrouter');
  });

  test('spot-checks on researched endpoint maps', () => {
    expect(presetOrThrow('anthropic').apiBaseUrl).toEqual({
      messages: 'https://api.anthropic.com/v1',
    });
    // Anthropic-compatible bases carry /v1 because Plexus appends /messages.
    expect(presetOrThrow('moonshot').apiBaseUrl.messages).toBe(
      'https://api.moonshot.ai/anthropic/v1'
    );
    expect(presetOrThrow('openrouter').apiBaseUrl['openrouter-decisions']).toBe(
      'https://openrouter.ai/api/alpha'
    );
    // DeepSeek chat has no /v1 segment upstream.
    expect(presetOrThrow('deepseek').apiBaseUrl.chat).toBe('https://api.deepseek.com');
  });
});

describe('loadLocalPresets failures', () => {
  test('missing file throws a descriptive error', async () => {
    await expect(loadLocalPresets(join(tmpdir(), 'no-such-presets.json'))).rejects.toThrow(
      /unreadable/
    );
  });

  test('malformed JSON throws a descriptive error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'presets-'));
    const file = join(dir, 'presets.json');
    writeFileSync(file, '{ not json');
    await expect(loadLocalPresets(file)).rejects.toThrow(/unreadable/);
  });

  test('schema violations and duplicate ids throw with detail', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'presets-'));
    const invalidFile = join(dir, 'invalid.json');
    writeFileSync(invalidFile, JSON.stringify({ presets: [{ id: 'broken', apiBaseUrl: {} }] }));
    await expect(loadLocalPresets(invalidFile)).rejects.toThrow(/Invalid provider presets/);

    const entry = {
      id: 'dup',
      name: 'Dup',
      suggestedProviderId: 'dup',
      suggestedName: 'Dup',
      apiBaseUrl: { chat: 'https://example.test/v1' },
      piAiProvider: 'openai',
      autoCompat: true,
    };
    const dupFile = join(dir, 'dup.json');
    writeFileSync(dupFile, JSON.stringify({ presets: [entry, entry] }));
    await expect(loadLocalPresets(dupFile)).rejects.toThrow(/Duplicate provider preset id/);
  });
});

describe('loadProviderPresets remote source', () => {
  let handler: (req: Request) => Response = () =>
    new Response(JSON.stringify({ presets: [remoteEntry] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  let server: ReturnType<typeof Bun.serve> | undefined;

  afterEach(() => {
    server?.stop(true);
    server = undefined;
    handler = () =>
      new Response(JSON.stringify({ presets: [remoteEntry] }), {
        headers: { 'Content-Type': 'application/json' },
      });
  });

  const serve = () => {
    server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: (req) => handler(req),
    });
    return `http://127.0.0.1:${server.port}/presets.json`;
  };

  test('default source is the plexus repo raw GitHub URL', () => {
    expect(REMOTE_PRESETS_URL).toBe(
      'https://raw.githubusercontent.com/mcowger/plexus/main/packages/backend/data/provider-presets.json'
    );
  });

  test('serves the remote catalog on success', async () => {
    const result = await loadProviderPresets(serve());
    expect(result.source).toBe('remote');
    expect(result.presets).toEqual([
      expect.objectContaining({ id: 'remote-only', piAiProvider: 'openai' }),
    ]);
  });

  test('unreachable remote, error status, and bad content fall back to built-in', async () => {
    const unreachable = await loadProviderPresets('http://127.0.0.1:1/presets.json');
    expect(unreachable.source).toBe('local');
    expect(unreachable.presets.length).toBe(catalog.length);

    handler = () => new Response('nope', { status: 500 });
    const errorStatus = await loadProviderPresets(serve());
    expect(errorStatus.source).toBe('local');

    handler = () => new Response('<html>not json</html>');
    const garbage = await loadProviderPresets(serve());
    expect(garbage.source).toBe('local');

    handler = () => Response.json({ presets: [{ id: 'broken' }] });
    const invalid = await loadProviderPresets(serve());
    expect(invalid.source).toBe('local');
    expect(invalid.presets.length).toBe(catalog.length);
  });
});

describe('substitutePresetVars', () => {
  test('replaces known placeholders and leaves unknown ones visible', () => {
    expect(
      substitutePresetVars(
        { chat: 'https://x.test/{account_id}/v1', other: 'https://y.test/{missing}/v1' },
        { account_id: 'abc' }
      )
    ).toEqual({
      chat: 'https://x.test/abc/v1',
      other: 'https://y.test/{missing}/v1',
    });
  });

  test('blank values do not substitute', () => {
    expect(
      substitutePresetVars({ chat: 'https://x.test/{account_id}/v1' }, { account_id: '  ' })
    ).toEqual({ chat: 'https://x.test/{account_id}/v1' });
  });
});

describe('applyProviderPreset', () => {
  test('fills a blank draft with endpoints, types, and pi-ai mapping', () => {
    const preset = presetOrThrow('moonshot');
    const applied = applyProviderPreset(blankDraft(), preset);

    expect(applied.id).toBe('moonshot');
    expect(applied.name).toBe('Moonshot');
    expect(applied.apiBaseUrl).toEqual(preset.apiBaseUrl);
    expect(applied.type).toEqual(['chat', 'responses', 'messages']);
    expect(applied.pi_ai_provider).toBe('moonshotai');
    expect(applied.auto_compat).toBe(true);
  });

  test('never overwrites an existing id or name', () => {
    const preset = presetOrThrow('openai');
    const applied = applyProviderPreset({ ...blankDraft(), id: 'my-openai', name: 'Mine' }, preset);

    expect(applied.id).toBe('my-openai');
    expect(applied.name).toBe('Mine');
    expect(applied.apiBaseUrl).toEqual(preset.apiBaseUrl);
  });

  test('clears OAuth-mode leftovers since presets are API-key providers', () => {
    const preset = presetOrThrow('groq');
    const applied = applyProviderPreset(
      { ...blankDraft(), apiBaseUrl: 'oauth://', apiKey: 'oauth', oauthProvider: 'meta' },
      preset
    );

    expect(applied.apiBaseUrl).toEqual(preset.apiBaseUrl);
    expect(applied.apiKey).toBe('');
    expect(applied.oauthProvider).toBe('');
  });

  test('preserves a typed API key', () => {
    const preset = presetOrThrow('groq');
    const applied = applyProviderPreset({ ...blankDraft(), apiKey: 'sk-live' }, preset);

    expect(applied.apiKey).toBe('sk-live');
  });

  test('substitutes template vars into the endpoint map', () => {
    const preset = presetOrThrow('cloudflare');
    const applied = applyProviderPreset(blankDraft(), preset, { account_id: 'acct123' });

    expect(applied.apiBaseUrl).toEqual({
      chat: 'https://api.cloudflare.com/client/v4/accounts/acct123/ai/v1',
      messages: 'https://api.cloudflare.com/client/v4/accounts/acct123/ai/v1',
      responses: 'https://api.cloudflare.com/client/v4/accounts/acct123/ai/v1',
    });
  });

  test('does not mutate the draft or the preset', () => {
    const preset = presetOrThrow('zai');
    const draft = blankDraft();
    const draftSnapshot = structuredClone(draft);
    const presetSnapshot = structuredClone(preset);

    applyProviderPreset(draft, preset);

    expect(draft).toEqual(draftSnapshot);
    expect(preset).toEqual(presetSnapshot);
  });
});

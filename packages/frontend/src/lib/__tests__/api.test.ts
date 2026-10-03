import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type Provider } from '../api';
import { normalizeProviderQuotaChecker } from '../api/settings';

describe('provider auto-compat persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends and reloads provider-level auto_compat', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            test: {
              api_base_url: 'https://api.example.com/v1',
              api_key: 'test-key',
              enabled: true,
              auto_compat: true,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'test-admin-key') });
    vi.stubGlobal('window', { location: { pathname: '/ui/providers' } });

    const provider: Provider = {
      id: 'test',
      name: 'Test',
      type: ['chat'],
      apiBaseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      enabled: true,
      auto_compat: true,
    };

    await api.saveProvider(provider, 'test');

    const saveRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(saveRequest.body as string)).toMatchObject({ auto_compat: true });

    const [reloadedProvider] = await api.getProviders();
    expect(reloadedProvider?.auto_compat).toBe(true);
  });

  it('sends false when disabling provider boolean settings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'test-admin-key') });
    vi.stubGlobal('window', { location: { pathname: '/ui/providers' } });

    await api.saveProvider({
      id: 'test',
      name: 'Test',
      type: ['chat'],
      apiBaseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key',
      enabled: true,
      disableCooldown: false,
      stallCooldown: false,
      allow100PercentUtilization: false,
      auto_compat: false,
    });

    const saveRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(saveRequest.body as string)).toMatchObject({
      disable_cooldown: false,
      stall_cooldown: false,
      allow_100_percent_utilization: false,
      auto_compat: false,
    });
  });

  it('patches only enabled when updating provider status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'test-admin-key') });
    vi.stubGlobal('window', { location: { pathname: '/ui/providers' } });

    await api.updateProviderEnabled('provider/with-slash', false);

    expect(fetchMock).toHaveBeenCalledWith(
      '/v0/management/providers/provider/with-slash',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ enabled: false }),
      })
    );
  });
});

describe('provider PATCH clears unset fields with null', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stub = () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'test-admin-key') });
    vi.stubGlobal('window', { location: { pathname: '/ui/providers' } });
    return fetchMock;
  };
  const bodyOf = (fetchMock: ReturnType<typeof vi.fn>) =>
    JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
  const minimal: Provider = {
    id: 'test',
    name: 'Test',
    type: ['chat'],
    apiBaseUrl: 'https://api.example.com/v1',
    apiKey: 'k',
    enabled: true,
    compaction: {},
    rawPassthrough: { enabled: false, baseUrl: '', auth: 'bearer' },
  };

  it('sends null for every unset clearable field on an existing provider', async () => {
    const fetchMock = stub();
    await api.saveProvider(minimal, 'test');
    const body = bodyOf(fetchMock);
    for (const key of [
      'discount',
      'timeoutMs',
      'maxConcurrency',
      'stallTtfbMs',
      'stallTtfbBytes',
      'stallMinBps',
      'stallWindowMs',
      'stallGracePeriodMs',
      'quota_checker',
      'cache_key_injection',
      'compaction',
      'raw_passthrough',
    ]) {
      expect(body, key).toHaveProperty(key, null);
    }
  });

  it('treats all-null compaction as cleared', async () => {
    const fetchMock = stub();
    await api.saveProvider(
      { ...minimal, compaction: { absoluteTriggerTokens: undefined } as never },
      'test'
    );
    expect(bodyOf(fetchMock).compaction).toBeNull();
  });

  it('treats an all-null compaction object as cleared', async () => {
    const fetchMock = stub();
    await api.saveProvider(
      {
        ...minimal,
        compaction: { enabled: null, triggerRatio: null, absoluteTriggerTokens: null } as never,
      },
      'test'
    );
    expect(bodyOf(fetchMock).compaction).toBeNull();
  });

  it('clears oauth_provider on PATCH when unset, omits it on PUT', async () => {
    let fetchMock = stub();
    await api.saveProvider(minimal, 'test');
    expect(bodyOf(fetchMock)).toHaveProperty('oauth_provider', null);
    fetchMock = stub();
    await api.saveProvider({ ...minimal, oauthProvider: 'anthropic' }, 'test');
    expect(bodyOf(fetchMock).oauth_provider).toBe('anthropic');
    fetchMock = stub();
    await api.saveProvider(minimal);
    expect(bodyOf(fetchMock)).not.toHaveProperty('oauth_provider');
  });

  it('round-trips a custom quota_checker.id', async () => {
    const fetchMock = stub();
    await api.saveProvider(
      {
        ...minimal,
        quotaChecker: { id: 'custom-id', type: 'naga', enabled: true, intervalMinutes: 30 },
      },
      'test'
    );
    expect(bodyOf(fetchMock).quota_checker.id).toBe('custom-id');
    expect(normalizeProviderQuotaChecker({ id: 'custom-id', type: 'naga' })?.id).toBe('custom-id');
    expect(normalizeProviderQuotaChecker({ type: 'naga' })).not.toHaveProperty('id');
  });

  it('keeps set values, including discount 0', async () => {
    const fetchMock = stub();
    await api.saveProvider(
      {
        ...minimal,
        discount: 0,
        timeoutMs: 5000,
        compaction: { absoluteTriggerTokens: 1000 } as never,
        rawPassthrough: { enabled: true, baseUrl: 'https://x.example', auth: 'bearer' },
      },
      'test'
    );
    const body = bodyOf(fetchMock);
    expect(body.discount).toBe(0);
    expect(body.timeoutMs).toBe(5000);
    expect(body.compaction).toEqual({ absoluteTriggerTokens: 1000 });
    expect(body.raw_passthrough).toEqual({
      enabled: true,
      base_url: 'https://x.example',
      auth: 'bearer',
    });
  });

  it('omits unset fields for a new provider (PUT)', async () => {
    const fetchMock = stub();
    await api.saveProvider(minimal);
    const body = bodyOf(fetchMock);
    for (const key of ['discount', 'timeoutMs', 'quota_checker', 'compaction', 'raw_passthrough']) {
      expect(body).not.toHaveProperty(key);
    }
  });
});

describe('compaction round-trip', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getProviders maps compaction', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            p: { api_base_url: 'https://a.example/v1', compaction: { absoluteTriggerTokens: 42 } },
          }),
          { status: 200 }
        )
      )
    );
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'k') });
    vi.stubGlobal('window', { location: { pathname: '/ui/providers' } });
    const [p] = await api.getProviders();
    expect(p?.compaction).toEqual({ absoluteTriggerTokens: 42 });
  });

  it('getAliases maps compaction and aliasToConfigPayload sends it back', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes('/aliases')
                ? { a: { target_groups: [], compaction: { absoluteTriggerTokens: 7 } } }
                : {}
            ),
            { status: 200 }
          )
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'k') });
    vi.stubGlobal('window', { location: { pathname: '/ui/models' } });
    const [alias] = await api.getAliases();
    expect(alias?.compaction).toEqual({ absoluteTriggerTokens: 7 });
    const { aliasToConfigPayload } = await import('../api/aliases');
    expect(aliasToConfigPayload(alias as never).compaction).toEqual({ absoluteTriggerTokens: 7 });
  });
});

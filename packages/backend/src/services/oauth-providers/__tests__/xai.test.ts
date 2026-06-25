import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAuthorizeUrl,
  buildDeviceAuthorizationBody,
  buildDeviceTokenBody,
  buildRefreshTokenBody,
  computeExpiry,
  decodeJwtPayload,
  discoverXaiModels,
  generatePkcePair,
  getJwtExpiryMs,
  getXaiModel,
  listXaiModels,
  parseDeviceAuthorization,
  tokenResponseToCredentials,
  xaiOAuthProvider,
} from '../xai';

const base64url = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

const makeJwt = (payload: Record<string, unknown>): string => {
  const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  return `${header}.${body}.sig`;
};

describe('xai oauth provider — metadata', () => {
  it('exposes the expected provider identity', () => {
    expect(xaiOAuthProvider.id).toBe('xai');
    expect(xaiOAuthProvider.name).toBe('xAI / Grok');
    expect(xaiOAuthProvider.usesCallbackServer).toBe(false);
    expect(typeof xaiOAuthProvider.login).toBe('function');
    expect(typeof xaiOAuthProvider.refreshToken).toBe('function');
    expect(typeof xaiOAuthProvider.getApiKey).toBe('function');
  });

  it('getApiKey returns the access token verbatim', () => {
    const apiKey = xaiOAuthProvider.getApiKey({
      access: 'access-abc',
      refresh: 'refresh-xyz',
      expires: 123,
    });
    expect(apiKey).toBe('access-abc');
  });
});

describe('generatePkcePair', () => {
  it('produces base64url verifier and S256 challenge of the expected shape', () => {
    const { verifier, challenge } = generatePkcePair();
    const base64urlPattern = /^[A-Za-z0-9_-]+$/;

    expect(verifier).toMatch(base64urlPattern);
    expect(challenge).toMatch(base64urlPattern);
    // 32 random bytes => 43-char base64url (no padding).
    expect(verifier).toHaveLength(43);
    // SHA-256 digest => 32 bytes => 43-char base64url (no padding).
    expect(challenge).toHaveLength(43);
    expect(verifier).not.toContain('=');
    expect(challenge).not.toContain('=');
  });

  it('produces a unique pair on each call', () => {
    const a = generatePkcePair();
    const b = generatePkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
  });

  it('derives challenge deterministically from verifier (S256)', () => {
    const { verifier, challenge } = generatePkcePair();
    // Re-derive using node:crypto the same way the implementation does.
    const { createHash } = require('node:crypto');
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBe(expected);
  });
});

describe('buildAuthorizeUrl', () => {
  it('builds an authorization URL with PKCE and defaults', () => {
    const url = new URL(
      buildAuthorizeUrl({
        authorizationEndpoint: 'https://auth.x.ai/oauth2/authorize',
        redirectUri: 'http://localhost:9999/cb',
        challenge: 'CHALLENGE',
        state: 'STATE',
      })
    );

    expect(url.origin + url.pathname).toBe('https://auth.x.ai/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('b1a00492-073a-47ea-816f-4c329264a828');
    expect(url.searchParams.get('scope')).toBe(
      'openid profile email offline_access grok-cli:access api:access'
    );
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:9999/cb');
    expect(url.searchParams.get('code_challenge')).toBe('CHALLENGE');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('STATE');
  });
});

describe('buildDeviceAuthorizationBody', () => {
  it('includes client_id and scope and omits PKCE by default', () => {
    const body = buildDeviceAuthorizationBody({});
    expect(body.get('client_id')).toBe('b1a00492-073a-47ea-816f-4c329264a828');
    expect(body.get('scope')).toBe(
      'openid profile email offline_access grok-cli:access api:access'
    );
    expect(body.get('code_challenge')).toBeNull();
    expect(body.get('code_challenge_method')).toBeNull();
  });

  it('includes PKCE when requested and a challenge is provided', () => {
    const body = buildDeviceAuthorizationBody({ includePkce: true, challenge: 'CH' });
    expect(body.get('code_challenge')).toBe('CH');
    expect(body.get('code_challenge_method')).toBe('S256');
  });

  it('omits PKCE when includePkce is true but no challenge given', () => {
    const body = buildDeviceAuthorizationBody({ includePkce: true });
    expect(body.get('code_challenge')).toBeNull();
  });
});

describe('buildDeviceTokenBody', () => {
  it('builds an RFC 8628 device-code grant body', () => {
    const body = buildDeviceTokenBody({ deviceCode: 'DEV123' });
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code');
    expect(body.get('device_code')).toBe('DEV123');
    expect(body.get('client_id')).toBe('b1a00492-073a-47ea-816f-4c329264a828');
    expect(body.get('code_verifier')).toBeNull();
  });

  it('includes the verifier when provided', () => {
    const body = buildDeviceTokenBody({ deviceCode: 'DEV123', verifier: 'VER' });
    expect(body.get('code_verifier')).toBe('VER');
  });
});

describe('buildRefreshTokenBody', () => {
  it('builds a refresh_token grant body', () => {
    const body = buildRefreshTokenBody({ refreshToken: 'R1' });
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('R1');
    expect(body.get('client_id')).toBe('b1a00492-073a-47ea-816f-4c329264a828');
  });
});

describe('decodeJwtPayload / getJwtExpiryMs', () => {
  it('decodes a valid JWT payload', () => {
    const token = makeJwt({ sub: 'user-1', exp: 1_700_000_000 });
    const payload = decodeJwtPayload(token);
    expect(payload).toMatchObject({ sub: 'user-1', exp: 1_700_000_000 });
  });

  it('returns null for malformed tokens', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.b')).toBeNull();
    expect(decodeJwtPayload('')).toBeNull();
  });

  it('extracts exp as milliseconds', () => {
    const token = makeJwt({ exp: 1_700_000_000 });
    expect(getJwtExpiryMs(token)).toBe(1_700_000_000 * 1000);
  });

  it('returns null when exp is missing or invalid', () => {
    expect(getJwtExpiryMs(makeJwt({ sub: 'x' }))).toBeNull();
    expect(getJwtExpiryMs(makeJwt({ exp: 'soon' }))).toBeNull();
    expect(getJwtExpiryMs(makeJwt({ exp: 0 }))).toBeNull();
  });
});

describe('computeExpiry', () => {
  const NOW = 1_000_000;

  it('uses expires_in with a 2-minute skew', () => {
    expect(computeExpiry(3600, undefined, NOW)).toBe(NOW + 3600 * 1000 - 120_000);
  });

  it('falls back to JWT exp when expires_in is missing', () => {
    const expSeconds = 2_000;
    const token = makeJwt({ exp: expSeconds });
    expect(computeExpiry(undefined, token, NOW)).toBe(expSeconds * 1000 - 120_000);
  });

  it('falls back to a default lifetime when neither is available', () => {
    expect(computeExpiry(undefined, undefined, NOW)).toBe(NOW + 3600 * 1000 - 120_000);
    expect(computeExpiry(undefined, makeJwt({ sub: 'x' }), NOW)).toBe(NOW + 3600 * 1000 - 120_000);
  });

  it('ignores non-positive expires_in and uses JWT/default fallback', () => {
    const token = makeJwt({ exp: 5_000 });
    expect(computeExpiry(0, token, NOW)).toBe(5_000 * 1000 - 120_000);
    expect(computeExpiry(-10, undefined, NOW)).toBe(NOW + 3600 * 1000 - 120_000);
  });
});

describe('tokenResponseToCredentials', () => {
  const NOW = 5_000_000;

  it('maps a full token response to credentials', () => {
    const creds = tokenResponseToCredentials(
      {
        access_token: 'A1',
        refresh_token: 'R1',
        expires_in: 3600,
        token_type: 'Bearer',
      },
      undefined,
      NOW
    );
    expect(creds.access).toBe('A1');
    expect(creds.refresh).toBe('R1');
    expect(creds.expires).toBe(NOW + 3600 * 1000 - 120_000);
    expect((creds as Record<string, unknown>).type).toBe('oauth');
  });

  it('keeps the previous refresh token when the response omits one', () => {
    const creds = tokenResponseToCredentials(
      { access_token: 'A2', expires_in: 3600 },
      'OLD_REFRESH',
      NOW
    );
    expect(creds.refresh).toBe('OLD_REFRESH');
  });

  it('prefers a new refresh token over the previous one', () => {
    const creds = tokenResponseToCredentials(
      { access_token: 'A3', refresh_token: 'NEW', expires_in: 3600 },
      'OLD',
      NOW
    );
    expect(creds.refresh).toBe('NEW');
  });

  it('uses JWT exp when expires_in is absent', () => {
    const token = makeJwt({ exp: 9_000 });
    const creds = tokenResponseToCredentials({ access_token: token }, 'R', NOW);
    expect(creds.expires).toBe(9_000 * 1000 - 120_000);
  });

  it('throws when access_token is missing', () => {
    expect(() => tokenResponseToCredentials({ refresh_token: 'R' }, undefined, NOW)).toThrow(
      /access_token/
    );
  });
});

describe('parseDeviceAuthorization', () => {
  it('normalizes a full RFC 8628 device response', () => {
    const device = parseDeviceAuthorization({
      device_code: 'DC',
      user_code: 'UC',
      verification_uri: 'https://x.ai/device',
      verification_uri_complete: 'https://x.ai/device?code=UC',
      expires_in: 600,
      interval: 5,
    });
    expect(device).toEqual({
      deviceCode: 'DC',
      userCode: 'UC',
      verificationUri: 'https://x.ai/device',
      verificationUriComplete: 'https://x.ai/device?code=UC',
      expiresInSeconds: 600,
      intervalSeconds: 5,
    });
  });

  it('applies defaults for missing interval and expires_in', () => {
    const device = parseDeviceAuthorization({
      device_code: 'DC',
      user_code: 'UC',
      verification_uri: 'https://x.ai/device',
    });
    expect(device.intervalSeconds).toBe(5);
    expect(device.expiresInSeconds).toBe(15 * 60);
    expect(device.verificationUriComplete).toBeUndefined();
  });

  it('clamps interval to a minimum of 1 second', () => {
    const device = parseDeviceAuthorization({
      device_code: 'DC',
      user_code: 'UC',
      verification_uri: 'https://x.ai/device',
      interval: 0,
    });
    // interval=0 is non-positive, so the default (5) is used.
    expect(device.intervalSeconds).toBe(5);
  });

  it('throws when required fields are missing', () => {
    expect(() => parseDeviceAuthorization({ user_code: 'UC', verification_uri: 'u' })).toThrow();
    expect(() => parseDeviceAuthorization({ device_code: 'DC', verification_uri: 'u' })).toThrow();
    expect(() => parseDeviceAuthorization({ device_code: 'DC', user_code: 'UC' })).toThrow();
  });
});

describe('static model catalog', () => {
  it('lists models pointing at the xAI API with the responses surface', () => {
    const models = listXaiModels();
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(model.provider).toBe('xai');
      expect(model.api).toBe('openai-responses');
      expect(model.baseUrl).toBe('https://api.x.ai/v1');
      expect(model.cost).toEqual(
        expect.objectContaining({
          input: expect.any(Number),
          output: expect.any(Number),
          cacheRead: expect.any(Number),
          cacheWrite: expect.any(Number),
        })
      );
      expect(typeof model.contextWindow).toBe('number');
      expect(typeof model.maxTokens).toBe('number');
      expect(Array.isArray(model.input)).toBe(true);
    }
  });

  it('includes grok-4.3 as the default flagship reasoning model', () => {
    const model = getXaiModel('grok-4.3');
    expect(model).toBeDefined();
    expect(model?.reasoning).toBe(true);
    expect(model?.contextWindow).toBe(1_000_000);
  });

  it('returns undefined for unknown model ids', () => {
    expect(getXaiModel('does-not-exist')).toBeUndefined();
  });

  it('returns independent copies from listXaiModels (no shared mutation)', () => {
    const a = listXaiModels();
    const b = listXaiModels();
    const originalCost = b[0]!.cost.input;
    a[0]!.cost.input = originalCost + 999;
    a[0]!.input.length = 0;
    // Mutating the first copy must not affect the second copy or later calls.
    expect(b[0]!.cost.input).toBe(originalCost);
    expect(b[0]!.input.length).toBeGreaterThan(0);
    expect(listXaiModels()[0]!.cost.input).toBe(originalCost);
  });
});

describe('discoverXaiModels', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps live model ids to pi-ai model definitions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ models: [{ id: 'grok-4.3' }, { id: 'grok-9-new' }] }),
      }))
    );

    const models = await discoverXaiModels('token-123');
    const ids = models.map((m) => m.id);
    expect(ids).toContain('grok-4.3');
    expect(ids).toContain('grok-9-new');
    for (const model of models) {
      expect(model.provider).toBe('xai');
      expect(model.api).toBe('openai-responses');
      expect(model.baseUrl).toBe('https://api.x.ai/v1');
    }
  });

  it('sends a bearer token to the language-models endpoint', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ models: [{ id: 'grok-4.3' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await discoverXaiModels('secret-token');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.x.ai/v1/language-models');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
  });

  it('falls back to the static catalog on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }))
    );
    const models = await discoverXaiModels('token');
    expect(models.map((m) => m.id)).toEqual(listXaiModels().map((m) => m.id));
  });

  it('falls back to the static catalog when fetch rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );
    const models = await discoverXaiModels('token');
    expect(models.map((m) => m.id)).toEqual(listXaiModels().map((m) => m.id));
  });

  it('falls back to the static catalog when the response has no models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ models: [] }) }))
    );
    const models = await discoverXaiModels('token');
    expect(models.map((m) => m.id)).toEqual(listXaiModels().map((m) => m.id));
  });
});

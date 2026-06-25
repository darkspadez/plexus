import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSpy } from '../../../../../test/test-utils';
import { createMeterContext, isCheckerRegistered } from '../../checker-registry';
import checkerDef, {
  extractCursorUserId,
  buildCursorCookie,
  buildUsdCreditMeter,
  buildLegacyRequestMeter,
  buildPrepaidMeter,
} from '../cursor-checker';
import { OAuthAuthManager } from '../../../oauth-auth-manager';

const base64UrlEncode = (value: string): string =>
  Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const makeToken = (payload: unknown): string => {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${header}.${body}.signature`;
};

const USER_ID = 'user_01K000000000000000000000';
const TOKEN = makeToken({ sub: `auth0|${USER_ID}` });

const makeCtx = (apiKey?: string) =>
  createMeterContext('cursor-test', 'cursor', apiKey ? { apiKey } : {});

const ctxOnly = makeCtx('x'); // exposes balance/allowance helpers for unit tests

const USAGE_URL = 'https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage';
const LEGACY_URL = 'https://cursor.com/api/usage';
const STRIPE_URL = 'https://cursor.com/api/auth/stripe';

describe('cursor checker — pure helpers', () => {
  it('extracts user_* segment from auth0 sub claim', () => {
    expect(extractCursorUserId(TOKEN)).toBe(USER_ID);
  });

  it('falls back to last segment when no user_ prefix present', () => {
    const t = makeToken({ sub: 'workos|abc123' });
    expect(extractCursorUserId(t)).toBe('abc123');
  });

  it('returns null for a token without a payload', () => {
    expect(extractCursorUserId('not-a-jwt')).toBeNull();
  });

  it('returns null when sub claim is missing', () => {
    expect(extractCursorUserId(makeToken({ foo: 'bar' }))).toBeNull();
  });

  it('builds a url-encoded WorkosCursorSessionToken cookie', () => {
    const cookie = buildCursorCookie(USER_ID, 'jwt.value.here');
    expect(cookie).toBe(
      `WorkosCursorSessionToken=${encodeURIComponent(`${USER_ID}::jwt.value.here`)}`
    );
    // %3A%3A is the encoding of "::"
    expect(cookie).toContain('%3A%3A');
  });

  describe('buildUsdCreditMeter (cents -> usd)', () => {
    it('maps limit/remaining/used in cents to usd', () => {
      const m = buildUsdCreditMeter(
        {
          billingCycleEnd: '1735689600000',
          planUsage: { limit: 2000, remaining: 500, used: 1500 },
        },
        ctxOnly
      )!;
      expect(m.kind).toBe('allowance');
      expect(m.unit).toBe('usd');
      expect(m.limit).toBe(20);
      expect(m.remaining).toBe(5);
      expect(m.used).toBe(15);
      expect(m.periodUnit).toBe('month');
      expect(m.periodCycle).toBe('fixed');
      expect(m.resetsAt).toBe('2025-01-01T00:00:00.000Z');
    });

    it('derives used from limit-remaining when used is absent', () => {
      const m = buildUsdCreditMeter({ planUsage: { limit: 2000, remaining: 500 } }, ctxOnly)!;
      expect(m.used).toBe(15);
    });

    it('derives used from totalPercentUsed when used and remaining are absent', () => {
      const m = buildUsdCreditMeter({ planUsage: { limit: 2000, totalPercentUsed: 25 } }, ctxOnly)!;
      expect(m.used).toBe(5); // 25% of $20
    });

    it('returns null when limit is missing or zero', () => {
      expect(buildUsdCreditMeter({ planUsage: { remaining: 500 } }, ctxOnly)).toBeNull();
      expect(buildUsdCreditMeter({ planUsage: { limit: 0 } }, ctxOnly)).toBeNull();
      expect(buildUsdCreditMeter({}, ctxOnly)).toBeNull();
    });
  });

  describe('buildLegacyRequestMeter', () => {
    it('maps gpt-4 request usage for legacy plans', () => {
      const m = buildLegacyRequestMeter(
        {
          'gpt-4': { numRequests: 100, maxRequestUsage: 500 },
          startOfMonth: '2026-06-01T00:00:00Z',
        },
        USER_ID,
        ctxOnly
      )!;
      expect(m.kind).toBe('allowance');
      expect(m.unit).toBe('requests');
      expect(m.used).toBe(100);
      expect(m.limit).toBe(500);
      expect(m.remaining).toBe(400);
      expect(m.resetsAt).toBe('2026-07-01T00:00:00.000Z');
    });

    it('returns null when maxRequestUsage is 0 (usage-based plan)', () => {
      expect(
        buildLegacyRequestMeter(
          { 'gpt-4': { numRequests: 5, maxRequestUsage: 0 } },
          USER_ID,
          ctxOnly
        )
      ).toBeNull();
    });

    it('returns null when gpt-4 entry is missing', () => {
      expect(buildLegacyRequestMeter({ startOfMonth: 'x' }, USER_ID, ctxOnly)).toBeNull();
    });
  });

  describe('buildPrepaidMeter', () => {
    it('maps a negative customerBalance to a positive usd balance', () => {
      const m = buildPrepaidMeter({ customerBalance: -1234 }, ctxOnly)!;
      expect(m.kind).toBe('balance');
      expect(m.unit).toBe('usd');
      expect(m.remaining).toBe(12.34);
    });

    it('returns null when balance is non-negative', () => {
      expect(buildPrepaidMeter({ customerBalance: 0 }, ctxOnly)).toBeNull();
      expect(buildPrepaidMeter({ customerBalance: 500 }, ctxOnly)).toBeNull();
      expect(buildPrepaidMeter({}, ctxOnly)).toBeNull();
    });
  });
});

describe('cursor checker — check()', () => {
  const setFetchMock = (impl: (url: string, init?: RequestInit) => Promise<Response>): void => {
    global.fetch = vi.fn((input: unknown, init?: RequestInit) =>
      impl(String(input), init)
    ) as unknown as typeof fetch;
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    OAuthAuthManager.resetForTesting();
  });

  it('is registered under cursor', () => {
    expect(isCheckerRegistered('cursor')).toBe(true);
  });

  it('prefers usd credit (B) over legacy requests (A) when both present', async () => {
    setFetchMock(async (url) => {
      if (url === USAGE_URL)
        return new Response(
          JSON.stringify({
            billingCycleEnd: '1735689600000',
            planUsage: { limit: 2000, remaining: 500, used: 1500 },
          }),
          { status: 200 }
        );
      if (url.startsWith(LEGACY_URL))
        return new Response(JSON.stringify({ 'gpt-4': { numRequests: 1, maxRequestUsage: 500 } }), {
          status: 200,
        });
      if (url === STRIPE_URL) return new Response(JSON.stringify({}), { status: 200 });
      return new Response('not found', { status: 404 });
    });

    const meters = await checkerDef.check(makeCtx(TOKEN));
    const credit = meters.find((m) => m.key === 'credit');
    expect(credit).toBeTruthy();
    expect(credit!.unit).toBe('usd');
    expect(meters.find((m) => m.key === 'requests')).toBeUndefined();
  });

  it('falls back to legacy request meter when usage (B) yields nothing', async () => {
    setFetchMock(async (url) => {
      if (url === USAGE_URL) return new Response(JSON.stringify({}), { status: 200 });
      if (url.startsWith(LEGACY_URL))
        return new Response(
          JSON.stringify({ 'gpt-4': { numRequests: 42, maxRequestUsage: 500 } }),
          { status: 200 }
        );
      if (url === STRIPE_URL) return new Response(JSON.stringify({}), { status: 200 });
      return new Response('not found', { status: 404 });
    });

    const meters = await checkerDef.check(makeCtx(TOKEN));
    const requests = meters.find((m) => m.key === 'requests')!;
    expect(requests.used).toBe(42);
    expect(requests.limit).toBe(500);
  });

  it('includes a prepaid balance meter alongside usage', async () => {
    setFetchMock(async (url) => {
      if (url === USAGE_URL)
        return new Response(JSON.stringify({ planUsage: { limit: 2000, remaining: 1000 } }), {
          status: 200,
        });
      if (url.startsWith(LEGACY_URL)) return new Response(JSON.stringify({}), { status: 200 });
      if (url === STRIPE_URL)
        return new Response(JSON.stringify({ customerBalance: -2500 }), { status: 200 });
      return new Response('not found', { status: 404 });
    });

    const meters = await checkerDef.check(makeCtx(TOKEN));
    expect(meters.find((m) => m.key === 'credit')).toBeTruthy();
    const prepaid = meters.find((m) => m.key === 'prepaid')!;
    expect(prepaid.remaining).toBe(25);
  });

  it('sends the WorkosCursorSessionToken cookie to cursor.com endpoints', async () => {
    let legacyCookie = '';
    setFetchMock(async (url, init) => {
      if (url === USAGE_URL)
        return new Response(JSON.stringify({ planUsage: { limit: 2000, remaining: 1000 } }), {
          status: 200,
        });
      if (url.startsWith(LEGACY_URL)) {
        legacyCookie = (init?.headers as Record<string, string> | undefined)?.Cookie ?? '';
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    await checkerDef.check(makeCtx(TOKEN));
    expect(legacyCookie).toContain('WorkosCursorSessionToken=');
    expect(legacyCookie).toContain('%3A%3A');
  });

  it('tolerates a single failed sub-call (non-auth) and still returns meters', async () => {
    setFetchMock(async (url) => {
      if (url === USAGE_URL)
        return new Response(JSON.stringify({ planUsage: { limit: 2000, remaining: 1000 } }), {
          status: 200,
        });
      if (url.startsWith(LEGACY_URL)) return new Response('boom', { status: 500 });
      if (url === STRIPE_URL) return new Response('boom', { status: 500 });
      return new Response('not found', { status: 404 });
    });

    const meters = await checkerDef.check(makeCtx(TOKEN));
    expect(meters.find((m) => m.key === 'credit')).toBeTruthy();
  });

  it('throws an expired-token error when a call returns 401', async () => {
    setFetchMock(async (url) => {
      if (url === USAGE_URL) return new Response('unauthorized', { status: 401 });
      return new Response(JSON.stringify({}), { status: 200 });
    });

    await expect(checkerDef.check(makeCtx(TOKEN))).rejects.toThrow('expired or invalid');
  });

  it('throws when no usage, request, or balance data is available', async () => {
    setFetchMock(async () => new Response(JSON.stringify({}), { status: 200 }));
    await expect(checkerDef.check(makeCtx(TOKEN))).rejects.toThrow(
      'Could not determine Cursor usage'
    );
  });

  it('throws when the access token has no extractable userId', async () => {
    await expect(checkerDef.check(makeCtx('garbage'))).rejects.toThrow(
      'failed to extract Cursor userId'
    );
  });

  it('falls back to OAuthAuthManager when apiKey is not provided', async () => {
    const authManager = OAuthAuthManager.getInstance();
    registerSpy(authManager, 'getApiKey').mockResolvedValue(TOKEN);

    setFetchMock(async (url) => {
      if (url === USAGE_URL)
        return new Response(JSON.stringify({ planUsage: { limit: 2000, remaining: 1000 } }), {
          status: 200,
        });
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const meters = await checkerDef.check(makeCtx());
    expect(meters.find((m) => m.key === 'credit')).toBeTruthy();
    expect(authManager.getApiKey).toHaveBeenCalledWith('cursor');
  });
});

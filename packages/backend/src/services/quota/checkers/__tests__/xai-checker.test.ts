import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSpy } from '../../../../../test/test-utils';
import { createMeterContext, isCheckerRegistered } from '../../checker-registry';
import checkerDef from '../xai-checker';
import { OAuthAuthManager } from '../../../oauth-auth-manager';

const makeCtx = (apiKey?: string) =>
  createMeterContext('xai-test', 'xai', apiKey ? { apiKey } : {});

const ME_URL = 'https://api.x.ai/v1/me';
const MODELS_URL = 'https://api.x.ai/v1/language-models';

describe('xai checker', () => {
  const setFetchMock = (impl: (url: string) => Promise<Response>): void => {
    global.fetch = vi.fn((input: unknown) => impl(String(input))) as unknown as typeof fetch;
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    OAuthAuthManager.resetForTesting();
  });

  it('is registered under xai', () => {
    expect(isCheckerRegistered('xai')).toBe(true);
  });

  it('emits an account-ok status meter when team is not blocked', async () => {
    setFetchMock(async (url) => {
      if (url === ME_URL)
        return new Response(JSON.stringify({ team_id: 't1', team_blocked: false }), {
          status: 200,
        });
      if (url === MODELS_URL)
        return new Response(JSON.stringify({ models: [{ id: 'grok-4' }, { id: 'grok-3' }] }), {
          status: 200,
        });
      return new Response('not found', { status: 404 });
    });

    const meters = await checkerDef.check(makeCtx('token-abc'));

    const account = meters.find((m) => m.key === 'account')!;
    expect(account.kind).toBe('balance');
    expect(account.unit).toBe('status');
    expect(account.remaining).toBe(1);
    expect(account.limit).toBe(1);
    expect(account.status).toBe('ok');

    const models = meters.find((m) => m.key === 'models')!;
    expect(models.remaining).toBe(2);
    expect(models.unit).toBe('models');
  });

  it('emits remaining=0 status meter when team is blocked', async () => {
    setFetchMock(async (url) => {
      if (url === ME_URL)
        return new Response(JSON.stringify({ team_id: 't1', team_blocked: true }), { status: 200 });
      return new Response(JSON.stringify({ models: [] }), { status: 200 });
    });

    const meters = await checkerDef.check(makeCtx('token-abc'));
    const account = meters.find((m) => m.key === 'account')!;
    expect(account.remaining).toBe(0);
    // remaining 0 of limit 1 => 100% utilization => exhausted
    expect(account.status).toBe('exhausted');
  });

  it('omits the models meter when language-models call fails', async () => {
    setFetchMock(async (url) => {
      if (url === ME_URL)
        return new Response(JSON.stringify({ team_blocked: false }), { status: 200 });
      return new Response('server error', { status: 500 });
    });

    const meters = await checkerDef.check(makeCtx('token-abc'));
    expect(meters).toHaveLength(1);
    expect(meters[0]!.key).toBe('account');
  });

  it('throws an expired-token error on 401 from /me', async () => {
    setFetchMock(async () => new Response('unauthorized', { status: 401 }));
    await expect(checkerDef.check(makeCtx('token-abc'))).rejects.toThrow('expired or invalid');
  });

  it('throws an expired-token error on 403 from /me', async () => {
    setFetchMock(async () => new Response('forbidden', { status: 403 }));
    await expect(checkerDef.check(makeCtx('token-abc'))).rejects.toThrow('expired or invalid');
  });

  it('throws for malformed /me JSON', async () => {
    setFetchMock(async (url) =>
      url === ME_URL
        ? new Response('not-json', { status: 200 })
        : new Response(JSON.stringify({ models: [] }), { status: 200 })
    );
    await expect(checkerDef.check(makeCtx('token-abc'))).rejects.toThrow(
      'failed to parse xAI account response'
    );
  });

  it('falls back to OAuthAuthManager when apiKey is not provided', async () => {
    const authManager = OAuthAuthManager.getInstance();
    registerSpy(authManager, 'getApiKey').mockResolvedValue('token-from-oauth');

    setFetchMock(async (url) =>
      url === ME_URL
        ? new Response(JSON.stringify({ team_blocked: false }), { status: 200 })
        : new Response(JSON.stringify({ models: [] }), { status: 200 })
    );

    const meters = await checkerDef.check(makeCtx());
    expect(meters[0]!.key).toBe('account');
    expect(authManager.getApiKey).toHaveBeenCalledWith('xai');
  });
});

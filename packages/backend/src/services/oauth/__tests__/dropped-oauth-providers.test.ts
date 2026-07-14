import { describe, expect, test } from 'vitest';
import { OAuthDispatcher } from '../oauth-dispatcher';
import { ProviderConfigSchema } from '../../../config';

// docs/NOMOV3.md M3 — Gemini CLI / Antigravity OAuth were dropped. The removal must
// be inert, not destructive: existing configs that still reference these providers
// must keep loading, but the providers are rejected at routing.

const host = {
  buildCancelledError: () => new Error('cancelled'),
  enrichResponseWithMetadata: () => {},
  extractFailureReason: () => undefined,
  formatFailureReason: () => '',
  isQuotaExhaustedError: () => false,
};

describe('dropped OAuth providers (Gemini CLI / Antigravity)', () => {
  test.each([
    'google-gemini-cli',
    'google-antigravity',
  ])('rejects %s at routing with a clear "no longer supported" error', (provider) => {
    const dispatcher = new OAuthDispatcher(host) as any;
    expect(() => dispatcher.assertOAuthModelSupported(provider, 'any-model')).toThrow(
      /no longer supported/i
    );
  });

  test('still supports non-dropped OAuth providers (does not over-reject)', () => {
    const dispatcher = new OAuthDispatcher(host) as any;
    // anthropic resolves builtin models; an unknown model id fails for the normal
    // "not supported for provider" reason, NOT the dropped-provider reason.
    expect(() =>
      dispatcher.assertOAuthModelSupported('anthropic', '__definitely-not-a-real-model__')
    ).toThrow(/is not supported for provider/i);
  });

  test.each([
    'google-gemini-cli',
    'google-antigravity',
  ])('a persisted provider config referencing %s still loads (non-destructive)', (provider) => {
    const result = ProviderConfigSchema.safeParse({
      api_base_url: 'oauth://',
      oauth_provider: provider,
      oauth_account: 'legacy',
    });
    expect(result.success).toBe(true);
  });
});

import { describe, expect, test } from 'vitest';
import {
  computeProviderTabErrors,
  firstErrorTab,
  isValidHttpUrl,
  PROVIDER_FORM_TABS,
} from '../provider-tab-errors';

const clean = {
  id: 'my-provider',
  isOAuthMode: false,
  oauthAccount: undefined,
  quotaValidationError: null,
  rawPassthrough: undefined,
};

describe('isValidHttpUrl', () => {
  test('accepts http and https URLs', () => {
    expect(isValidHttpUrl('https://openrouter.ai/api')).toBe(true);
    expect(isValidHttpUrl('http://localhost:11434')).toBe(true);
  });

  test('rejects other schemes and garbage', () => {
    expect(isValidHttpUrl('ftp://example.com')).toBe(false);
    expect(isValidHttpUrl('not a url')).toBe(false);
    expect(isValidHttpUrl('')).toBe(false);
  });
});

describe('computeProviderTabErrors', () => {
  test('clean form has no errors', () => {
    const errors = computeProviderTabErrors(clean);
    expect(Object.values(errors).every((e) => e === null)).toBe(true);
    expect(firstErrorTab(errors)).toBeNull();
  });

  test('missing ID → Connection', () => {
    expect(computeProviderTabErrors({ ...clean, id: '' }).connection).toMatch(/ID is required/);
    expect(computeProviderTabErrors({ ...clean, id: '   ' }).connection).toMatch(/ID is required/);
  });

  test('OAuth mode without an account → Connection', () => {
    const errors = computeProviderTabErrors({ ...clean, isOAuthMode: true, oauthAccount: '' });
    expect(errors.connection).toMatch(/OAuth account/);
    // A non-blank account clears it.
    expect(
      computeProviderTabErrors({ ...clean, isOAuthMode: true, oauthAccount: 'work' }).connection
    ).toBeNull();
  });

  test('quota validation error → Limits & Quota', () => {
    const errors = computeProviderTabErrors({
      ...clean,
      quotaValidationError: 'Provisioning API Key is required for Naga quota checker',
    });
    expect(errors.limits).toMatch(/Naga/);
    expect(firstErrorTab(errors)).toBe('limits');
  });

  test('raw passthrough enabled with a bad URL → Transformations', () => {
    const errors = computeProviderTabErrors({
      ...clean,
      rawPassthrough: { enabled: true, baseUrl: 'nope', auth: 'bearer' },
    });
    expect(errors.transformations).toMatch(/HTTP\(S\)/);
    expect(firstErrorTab(errors)).toBe('transformations');
  });

  test('raw passthrough enabled in OAuth mode → Transformations', () => {
    const errors = computeProviderTabErrors({
      ...clean,
      isOAuthMode: true,
      oauthAccount: 'work',
      rawPassthrough: { enabled: true, baseUrl: 'https://example.com', auth: 'bearer' },
    });
    expect(errors.transformations).toMatch(/static API-key/);
  });

  test('raw passthrough disabled never errors, regardless of URL', () => {
    const errors = computeProviderTabErrors({
      ...clean,
      rawPassthrough: { enabled: false, baseUrl: 'nope', auth: 'bearer' },
    });
    expect(errors.transformations).toBeNull();
  });

  test('firstErrorTab follows tab order (connection before limits before transformations)', () => {
    const errors = computeProviderTabErrors({
      ...clean,
      id: '',
      quotaValidationError: 'quota broken',
      rawPassthrough: { enabled: true, baseUrl: 'nope', auth: 'bearer' },
    });
    expect(firstErrorTab(errors)).toBe('connection');
    expect(firstErrorTab({ ...errors, connection: null })).toBe('limits');
    expect(firstErrorTab({ ...errors, connection: null, limits: null })).toBe('transformations');
  });

  test('tab order constant matches the four drawer tabs', () => {
    expect(PROVIDER_FORM_TABS.map((t) => t.value)).toEqual([
      'connection',
      'limits',
      'transformations',
      'models',
    ]);
  });
});

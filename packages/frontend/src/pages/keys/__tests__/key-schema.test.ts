/**
 * key-schema.test.ts — Characterization tests for the Keys API key form schema.
 *
 * These tests lock down the exact serialization that api.saveKey() receives.
 * Any change that breaks these means API payload parity is broken.
 */
import { expect, test, describe } from 'vitest';
import { keyFormSchema, toKeyConfig, KEY_FORM_DEFAULTS } from '../key-schema';

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('keyFormSchema validation', () => {
  test('accepts a fully-populated valid form', () => {
    const result = keyFormSchema.safeParse({
      key: 'production-app-1',
      secret: 'sk-abc123',
      comment: 'My app key',
      quotas: ['standard-quota'],
      allowedModels: ['claude-sonnet'],
      allowedProviders: ['anthropic'],
      excludedModels: [],
      excludedProviders: [],
      allowedIps: ['0.0.0.0/0', '::/0'],
    });
    expect(result.success).toBe(true);
  });

  test('requires key to be non-empty', () => {
    const result = keyFormSchema.safeParse({
      ...KEY_FORM_DEFAULTS,
      key: '',
    });
    expect(result.success).toBe(false);
  });

  test('requires secret to be non-empty', () => {
    const result = keyFormSchema.safeParse({
      ...KEY_FORM_DEFAULTS,
      key: 'my-key',
      secret: '',
    });
    expect(result.success).toBe(false);
  });

  test('accepts empty optional fields', () => {
    const result = keyFormSchema.safeParse({
      key: 'test-key',
      secret: 'sk-secret',
      comment: '',
      quotas: [],
      allowedModels: [],
      allowedProviders: [],
      excludedModels: [],
      excludedProviders: [],
      allowedIps: [],
    });
    expect(result.success).toBe(true);
  });

  test('accepts missing comment (undefined)', () => {
    const result = keyFormSchema.safeParse({
      key: 'test-key',
      secret: 'sk-secret',
      quotas: [],
      allowedModels: [],
      allowedProviders: [],
      excludedModels: [],
      excludedProviders: [],
      allowedIps: [],
    });
    expect(result.success).toBe(true);
  });

  test('accepts multiple quota names', () => {
    const result = keyFormSchema.safeParse({
      ...KEY_FORM_DEFAULTS,
      key: 'k',
      secret: 'sk-x',
      quotas: ['daily-quota', 'monthly-quota'],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Expiry validation — mirrors upstream's
// `!Number.isInteger(amount) || amount <= 0` check on save.
// ---------------------------------------------------------------------------

describe('keyFormSchema expiry validation', () => {
  test('accepts an empty expiryAmount (never expires)', () => {
    const result = keyFormSchema.safeParse({
      ...KEY_FORM_DEFAULTS,
      key: 'k',
      secret: 'sk-x',
      expiryAmount: '',
    });
    expect(result.success).toBe(true);
  });

  test('accepts a positive whole number', () => {
    const result = keyFormSchema.safeParse({
      ...KEY_FORM_DEFAULTS,
      key: 'k',
      secret: 'sk-x',
      expiryAmount: '30',
      expiryUnit: 'minutes',
    });
    expect(result.success).toBe(true);
  });

  test('rejects zero', () => {
    const result = keyFormSchema.safeParse({
      ...KEY_FORM_DEFAULTS,
      key: 'k',
      secret: 'sk-x',
      expiryAmount: '0',
    });
    expect(result.success).toBe(false);
  });

  test('rejects a negative number', () => {
    const result = keyFormSchema.safeParse({
      ...KEY_FORM_DEFAULTS,
      key: 'k',
      secret: 'sk-x',
      expiryAmount: '-5',
    });
    expect(result.success).toBe(false);
  });

  test('rejects a non-integer', () => {
    const result = keyFormSchema.safeParse({
      ...KEY_FORM_DEFAULTS,
      key: 'k',
      secret: 'sk-x',
      expiryAmount: '1.5',
    });
    expect(result.success).toBe(false);
  });

  test('rejects non-numeric input', () => {
    const result = keyFormSchema.safeParse({
      ...KEY_FORM_DEFAULTS,
      key: 'k',
      secret: 'sk-x',
      expiryAmount: 'abc',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Payload serialization — toKeyConfig()
// ---------------------------------------------------------------------------

describe('toKeyConfig payload serialization', () => {
  test('minimal config: key + secret, no arrays, no quotas', () => {
    const payload = toKeyConfig({
      key: 'my-key',
      secret: 'sk-abc123',
      comment: '',
      quotas: [],
      allowedModels: [],
      allowedProviders: [],
      excludedModels: [],
      excludedProviders: [],
      allowedIps: [],
    });

    expect(payload.key).toBe('my-key');
    expect(payload.secret).toBe('sk-abc123');
    // Empty comment: omitted
    expect('comment' in payload).toBe(false);
    // Arrays always present (even if empty) — quotas follows the same
    // always-include convention as every other array field.
    expect(payload.allowedModels).toEqual([]);
    expect(payload.allowedProviders).toEqual([]);
    expect(payload.excludedModels).toEqual([]);
    expect(payload.excludedProviders).toEqual([]);
    expect(payload.allowedIps).toEqual([]);
  });

  test('full config: comment, quotas, non-empty arrays', () => {
    const payload = toKeyConfig({
      key: 'prod-key',
      secret: 'sk-xyz789',
      comment: 'Production key',
      quotas: ['daily-quota'],
      allowedModels: ['claude-sonnet', 'claude-haiku'],
      allowedProviders: ['anthropic'],
      excludedModels: ['gpt-4'],
      excludedProviders: ['openai'],
      allowedIps: ['10.0.0.0/8'],
    });

    expect(payload.comment).toBe('Production key');
    expect(payload.quotas).toEqual(['daily-quota']);
    expect(payload.allowedModels).toEqual(['claude-sonnet', 'claude-haiku']);
    expect(payload.allowedProviders).toEqual(['anthropic']);
    expect(payload.excludedModels).toEqual(['gpt-4']);
    expect(payload.excludedProviders).toEqual(['openai']);
    expect(payload.allowedIps).toEqual(['10.0.0.0/8']);
  });

  // Pinned per the port brief: toKeyConfig always includes `quotas` (never
  // conditionally omits it, unlike the old deprecated `quota` field), because
  // api.saveKey() unconditionally sends `quotas: keyConfig.quotas ?? []` on
  // the wire — an always-present `[]` and an omitted/undefined key produce
  // byte-identical JSON there, so always-include is simplest and matches the
  // convention already used by every other array field in this function.
  test('quotas [] is emitted as [] (always present, never omitted)', () => {
    const payload = toKeyConfig({
      ...KEY_FORM_DEFAULTS,
      key: 'k',
      secret: 'sk-x',
      quotas: [],
    });
    expect('quotas' in payload).toBe(true);
    expect(payload.quotas).toEqual([]);
  });

  test('quotas with multiple names is emitted verbatim', () => {
    const payload = toKeyConfig({
      ...KEY_FORM_DEFAULTS,
      key: 'k',
      secret: 'sk-x',
      quotas: ['a', 'b'],
    });
    expect(payload.quotas).toEqual(['a', 'b']);
  });

  test('JSON shape matches expected api.saveKey payload structure', () => {
    const payload = toKeyConfig({
      key: 'test-key',
      secret: 'sk-abc',
      comment: 'my comment',
      quotas: ['q1'],
      allowedModels: [],
      allowedProviders: [],
      excludedModels: [],
      excludedProviders: [],
      allowedIps: [],
    });

    // Ensure the exact JSON keys match what the backend expects
    const json = JSON.stringify(payload);
    const parsed = JSON.parse(json);
    expect(parsed).toMatchObject({
      key: 'test-key',
      secret: 'sk-abc',
      comment: 'my comment',
      quotas: ['q1'],
      allowedModels: [],
      allowedProviders: [],
      excludedModels: [],
      excludedProviders: [],
      allowedIps: [],
    });
  });
});

// ---------------------------------------------------------------------------
// Payload serialization — expiresInMinutes
// ---------------------------------------------------------------------------

describe('toKeyConfig expiresInMinutes serialization', () => {
  test('omits expiresInMinutes when expiryAmount is empty', () => {
    const payload = toKeyConfig({
      ...KEY_FORM_DEFAULTS,
      key: 'k',
      secret: 'sk-x',
      expiryAmount: '',
    });
    expect('expiresInMinutes' in payload).toBe(false);
  });

  test('converts minutes 1:1', () => {
    const payload = toKeyConfig({
      ...KEY_FORM_DEFAULTS,
      key: 'k',
      secret: 'sk-x',
      expiryAmount: '30',
      expiryUnit: 'minutes',
    });
    expect(payload.expiresInMinutes).toBe(30);
  });

  test('converts hours to minutes', () => {
    const payload = toKeyConfig({
      ...KEY_FORM_DEFAULTS,
      key: 'k',
      secret: 'sk-x',
      expiryAmount: '2',
      expiryUnit: 'hours',
    });
    expect(payload.expiresInMinutes).toBe(120);
  });

  test('converts days to minutes', () => {
    const payload = toKeyConfig({
      ...KEY_FORM_DEFAULTS,
      key: 'k',
      secret: 'sk-x',
      expiryAmount: '3',
      expiryUnit: 'days',
    });
    expect(payload.expiresInMinutes).toBe(3 * 1_440);
  });

  test('defaults to days when expiryUnit is omitted', () => {
    const payload = toKeyConfig({
      ...KEY_FORM_DEFAULTS,
      key: 'k',
      secret: 'sk-x',
      expiryAmount: '1',
      expiryUnit: undefined,
    });
    expect(payload.expiresInMinutes).toBe(1_440);
  });
});

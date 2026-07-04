/**
 * keys-quota-schema.test.ts — Characterization tests for the UserQuota form schema.
 *
 * Reuses userQuotaFormSchema from user-quota-schema.ts (same schema used by
 * UserQuotaSheet.tsx). These tests lock down the payload structure so that
 * any future change to serialization is caught immediately.
 *
 * Scoped multi-quota feature (PR #651, ported from main's Keys.tsx):
 * pins `shared`, `warnAt`, and the four scope-restriction fields byte-for-byte
 * against main's `handleSaveQuota` serialization logic.
 */
import { expect, test, describe } from 'vitest';
import {
  userQuotaFormSchema,
  toUserQuotaPayload,
  defHasScope,
  type UserQuotaFormValues,
} from '../../user-quotas/user-quota-schema';

// Full, always-present shape the real form produces (RHF populates every
// field from `defaults` on mount, so no field is ever genuinely "missing" —
// only empty/false/''). Individual tests override just what they're testing.
const baseValues: UserQuotaFormValues = {
  name: 'test-quota',
  type: 'daily',
  limitType: 'requests',
  limit: 100,
  duration: '',
  shared: false,
  warnAtPercent: '',
  allowedProviders: [],
  excludedProviders: [],
  allowedModels: [],
  excludedModels: [],
};

describe('userQuotaFormSchema validation', () => {
  test('accepts a valid rolling quota with duration', () => {
    const result = userQuotaFormSchema.safeParse({
      ...baseValues,
      name: 'standard-quota',
      type: 'rolling',
      limitType: 'requests',
      limit: 1000,
      duration: '1h',
    });
    expect(result.success).toBe(true);
  });

  test('accepts a valid daily quota (no duration needed)', () => {
    const result = userQuotaFormSchema.safeParse({
      ...baseValues,
      name: 'daily-quota',
      type: 'daily',
      limitType: 'tokens',
      limit: 50000,
      duration: '',
    });
    expect(result.success).toBe(true);
  });

  test('accepts a weekly cost quota', () => {
    const result = userQuotaFormSchema.safeParse({
      ...baseValues,
      name: 'weekly-cost',
      type: 'weekly',
      limitType: 'cost',
      limit: 100,
      duration: '',
    });
    expect(result.success).toBe(true);
  });

  test('rejects rolling quota without duration', () => {
    const result = userQuotaFormSchema.safeParse({
      ...baseValues,
      name: 'bad-rolling',
      type: 'rolling',
      limitType: 'requests',
      limit: 100,
      duration: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const durationError = result.error.issues.find((i) => i.path.includes('duration'));
      expect(durationError).toBeDefined();
    }
  });

  test('rejects name shorter than 2 characters', () => {
    const result = userQuotaFormSchema.safeParse({
      ...baseValues,
      name: 'a',
      type: 'daily',
      limitType: 'requests',
      limit: 100,
      duration: '',
    });
    expect(result.success).toBe(false);
  });

  test('rejects name with uppercase letters', () => {
    const result = userQuotaFormSchema.safeParse({
      ...baseValues,
      name: 'BadName',
      type: 'daily',
      limitType: 'requests',
      limit: 100,
      duration: '',
    });
    expect(result.success).toBe(false);
  });

  test('rejects limit of 0', () => {
    const result = userQuotaFormSchema.safeParse({
      ...baseValues,
      name: 'valid-name',
      type: 'daily',
      limitType: 'requests',
      limit: 0,
      duration: '',
    });
    expect(result.success).toBe(false);
  });

  test('payload structure matches api.saveUserQuota expected shape', () => {
    const result = userQuotaFormSchema.safeParse({
      ...baseValues,
      name: 'my-quota',
      type: 'rolling',
      limitType: 'requests',
      limit: 500,
      duration: '24h',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const quotaData = toUserQuotaPayload(result.data);
      // quotaData is the shape sent to api.saveUserQuota(result.data.name, quotaData)
      expect(result.data.name).toBe('my-quota');
      expect(quotaData).toMatchObject({
        type: 'rolling',
        limitType: 'requests',
        limit: 500,
        duration: '24h',
      });
    }
  });

  test('accepts valid type enum values', () => {
    const types = ['rolling', 'daily', 'weekly', 'monthly'] as const;
    for (const type of types) {
      const result = userQuotaFormSchema.safeParse({
        ...baseValues,
        name: 'test-quota',
        type,
        limitType: 'requests',
        limit: 100,
        duration: type === 'rolling' ? '1h' : '',
      });
      expect(result.success).toBe(true);
    }
  });

  test('rejects invalid type value', () => {
    const result = userQuotaFormSchema.safeParse({
      ...baseValues,
      name: 'test-quota',
      type: 'hourly',
      limitType: 'requests',
      limit: 100,
      duration: '',
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid limitType value', () => {
    const result = userQuotaFormSchema.safeParse({
      ...baseValues,
      name: 'test-quota',
      type: 'daily',
      limitType: 'bandwidth',
      limit: 100,
      duration: '',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toUserQuotaPayload — serialization tests
// ---------------------------------------------------------------------------

describe('toUserQuotaPayload', () => {
  test('non-rolling quota payload omits duration key', () => {
    const payload = toUserQuotaPayload({
      ...baseValues,
      type: 'daily',
      limitType: 'requests',
      limit: 1000,
      duration: '',
    });
    expect('duration' in payload).toBe(false);
    expect(payload).toMatchObject({ type: 'daily', limitType: 'requests', limit: 1000 });
  });

  test('weekly quota payload omits duration key', () => {
    const payload = toUserQuotaPayload({
      ...baseValues,
      type: 'weekly',
      limitType: 'cost',
      limit: 50,
      duration: '',
    });
    expect('duration' in payload).toBe(false);
  });

  test('rolling quota payload includes duration', () => {
    const payload = toUserQuotaPayload({
      ...baseValues,
      type: 'rolling',
      limitType: 'tokens',
      limit: 500,
      duration: '24h',
    });
    expect(payload.duration).toBe('24h');
    expect(payload).toMatchObject({
      type: 'rolling',
      limitType: 'tokens',
      limit: 500,
      duration: '24h',
    });
  });

  test('rolling quota with empty duration omits duration key', () => {
    // This path can occur if duration is cleared but type is still 'rolling'
    // (schema superRefine would reject this, but the function handles it defensively).
    const payload = toUserQuotaPayload({
      ...baseValues,
      type: 'rolling',
      limitType: 'requests',
      limit: 100,
      duration: '',
    });
    expect('duration' in payload).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shared — true / false / absent wire semantics (pinned per PR #651 port)
//
// Mirrors main's handleSaveQuota: `shared` is part of the destructured `rest`
// spread, so its wire presence follows the FORM value exactly — true and
// false are both sent explicitly, `undefined` (a legacy definition that
// never carried the field, left untouched by the user) is dropped by
// JSON.stringify like any other undefined-valued key.
// ---------------------------------------------------------------------------

describe('shared field — true/false/absent wire semantics', () => {
  test('shared: true is included in the payload', () => {
    const payload = toUserQuotaPayload({ ...baseValues, shared: true });
    expect('shared' in payload).toBe(true);
    expect(payload.shared).toBe(true);
  });

  test('shared: false is included in the payload (not conflated with absent)', () => {
    const payload = toUserQuotaPayload({ ...baseValues, shared: false });
    expect('shared' in payload).toBe(true);
    expect(payload.shared).toBe(false);
  });

  test('shared: undefined is omitted from the payload entirely', () => {
    const payload = toUserQuotaPayload({ ...baseValues, shared: undefined });
    expect('shared' in payload).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// warnAt — percent-string form field <-> (0,1)-exclusive fraction wire value
// ---------------------------------------------------------------------------

describe('warnAt — percent-string form field, fraction wire payload', () => {
  test('empty warnAtPercent omits warnAt from the payload', () => {
    const payload = toUserQuotaPayload({ ...baseValues, warnAtPercent: '' });
    expect('warnAt' in payload).toBe(false);
  });

  test('warnAtPercent "80" is emitted as warnAt: 0.8', () => {
    const payload = toUserQuotaPayload({ ...baseValues, warnAtPercent: '80' });
    expect(payload.warnAt).toBe(0.8);
  });

  test('lower boundary: warnAtPercent "1" validates and becomes warnAt: 0.01', () => {
    const result = userQuotaFormSchema.safeParse({ ...baseValues, warnAtPercent: '1' });
    expect(result.success).toBe(true);
    expect(toUserQuotaPayload({ ...baseValues, warnAtPercent: '1' }).warnAt).toBe(0.01);
  });

  test('upper boundary: warnAtPercent "99" validates and becomes warnAt: 0.99', () => {
    const result = userQuotaFormSchema.safeParse({ ...baseValues, warnAtPercent: '99' });
    expect(result.success).toBe(true);
    expect(toUserQuotaPayload({ ...baseValues, warnAtPercent: '99' }).warnAt).toBe(0.99);
  });

  test('warnAtPercent "0" is rejected — fraction would be 0, not > 0', () => {
    const result = userQuotaFormSchema.safeParse({ ...baseValues, warnAtPercent: '0' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('warnAtPercent'))).toBe(true);
    }
  });

  test('warnAtPercent "100" is rejected — fraction would be 1, not < 1', () => {
    const result = userQuotaFormSchema.safeParse({ ...baseValues, warnAtPercent: '100' });
    expect(result.success).toBe(false);
  });

  test('negative warnAtPercent is rejected', () => {
    const result = userQuotaFormSchema.safeParse({ ...baseValues, warnAtPercent: '-5' });
    expect(result.success).toBe(false);
  });

  test('warnAtPercent above 100 is rejected', () => {
    const result = userQuotaFormSchema.safeParse({ ...baseValues, warnAtPercent: '150' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scope fields — empty arrays are semantically "unscoped" (sent as undefined,
// never `[]`); partial scope sends exactly the populated fields. Ported
// byte-for-byte from main's handleSaveQuota destructure-and-conditionally-
// re-spread logic.
// ---------------------------------------------------------------------------

describe('scope fields — empty arrays are unscoped (omitted on the wire)', () => {
  test('all four scope arrays empty: none of the scope keys appear in the payload', () => {
    const payload = toUserQuotaPayload({ ...baseValues });
    expect('allowedProviders' in payload).toBe(false);
    expect('excludedProviders' in payload).toBe(false);
    expect('allowedModels' in payload).toBe(false);
    expect('excludedModels' in payload).toBe(false);
  });

  test('partial scope: only allowedProviders set produces the exact main-identical shape', () => {
    const payload = toUserQuotaPayload({ ...baseValues, allowedProviders: ['anthropic'] });
    expect(payload).toMatchObject({
      type: 'daily',
      limitType: 'requests',
      limit: 100,
      shared: false,
      allowedProviders: ['anthropic'],
    });
    expect('excludedProviders' in payload).toBe(false);
    expect('allowedModels' in payload).toBe(false);
    expect('excludedModels' in payload).toBe(false);
  });

  test('partial scope: only excludedModels set produces the exact main-identical shape', () => {
    const payload = toUserQuotaPayload({ ...baseValues, excludedModels: ['gpt-4'] });
    expect(payload.excludedModels).toEqual(['gpt-4']);
    expect('allowedProviders' in payload).toBe(false);
    expect('excludedProviders' in payload).toBe(false);
    expect('allowedModels' in payload).toBe(false);
  });

  test('all four scope fields populated are all included verbatim', () => {
    const payload = toUserQuotaPayload({
      ...baseValues,
      allowedProviders: ['anthropic'],
      excludedProviders: ['openai'],
      allowedModels: ['claude-sonnet'],
      excludedModels: ['gpt-4'],
    });
    expect(payload.allowedProviders).toEqual(['anthropic']);
    expect(payload.excludedProviders).toEqual(['openai']);
    expect(payload.allowedModels).toEqual(['claude-sonnet']);
    expect(payload.excludedModels).toEqual(['gpt-4']);
  });
});

// ---------------------------------------------------------------------------
// defHasScope — shared "is this def scoped" fact used by both the User
// Quotas page and UserQuotaTable
// ---------------------------------------------------------------------------

describe('defHasScope', () => {
  test('false for a definition with no scope fields', () => {
    expect(defHasScope({ type: 'daily', limitType: 'requests', limit: 100 })).toBe(false);
  });

  test('false for a definition with only empty scope arrays', () => {
    expect(
      defHasScope({
        type: 'daily',
        limitType: 'requests',
        limit: 100,
        allowedProviders: [],
        excludedModels: [],
      })
    ).toBe(false);
  });

  test('true when allowedProviders is non-empty', () => {
    expect(
      defHasScope({
        type: 'daily',
        limitType: 'requests',
        limit: 100,
        allowedProviders: ['anthropic'],
      })
    ).toBe(true);
  });

  test('true when excludedModels is non-empty', () => {
    expect(
      defHasScope({
        type: 'daily',
        limitType: 'requests',
        limit: 100,
        excludedModels: ['gpt-4'],
      })
    ).toBe(true);
  });

  test('false for undefined', () => {
    expect(defHasScope(undefined)).toBe(false);
  });
});

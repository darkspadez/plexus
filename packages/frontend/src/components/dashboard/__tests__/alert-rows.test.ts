import { describe, expect, it } from 'vitest';
import { INDEFINITE_COOLDOWN_THRESHOLD_MS } from '@plexus/shared';
import type { Cooldown, ErrorsByProviderPoint } from '../../../lib/api';
import {
  cooldownAlertMeta,
  cooldownFailureLabel,
  cooldownModelLabel,
  cooldownModelNames,
  cooldownTickMs,
  errorRowMeta,
  formatCooldownCountdown,
  groupCooldownsByProvider,
  joinAlertMeta,
} from '../alert-rows';

const cooldown = (overrides: Partial<Cooldown> = {}): Cooldown => ({
  provider: 'flaky-lab',
  model: 'flaky-model-v1',
  expiry: 1_000_000,
  timeRemainingMs: 60_000,
  consecutiveFailures: 0,
  ...overrides,
});

const HOUR_MS = 60 * 60 * 1000;

describe('joinAlertMeta', () => {
  it('joins parts with a spaced middle dot', () => {
    expect(joinAlertMeta(['1 model', '7 failures', 'HTTP 503'])).toBe(
      '1 model · 7 failures · HTTP 503'
    );
  });

  it('drops null, undefined and empty parts', () => {
    expect(joinAlertMeta([null, '1 model', undefined, '', 'boom'])).toBe('1 model · boom');
  });

  it('returns an empty string when nothing is left', () => {
    expect(joinAlertMeta([null, undefined, ''])).toBe('');
  });
});

describe('groupCooldownsByProvider', () => {
  it('groups entries by provider in first-seen order', () => {
    const groups = groupCooldownsByProvider([
      cooldown({ provider: 'b', model: 'm1' }),
      cooldown({ provider: 'a', model: 'm1' }),
      cooldown({ provider: 'b', model: 'm2' }),
    ]);
    expect(groups.map((g) => g.provider)).toEqual(['b', 'a']);
    expect(groups[0].entries.map((c) => c.model)).toEqual(['m1', 'm2']);
  });

  it('picks the longest-remaining entry as primary', () => {
    const groups = groupCooldownsByProvider([
      cooldown({ model: 'short', expiry: 1_000 }),
      cooldown({ model: 'long', expiry: 9_000 }),
      cooldown({ model: 'mid', expiry: 5_000 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].primary.model).toBe('long');
  });

  it('returns no groups for no cooldowns', () => {
    expect(groupCooldownsByProvider([])).toEqual([]);
  });
});

describe('cooldownModelLabel', () => {
  it('uses the singular for one model', () => {
    expect(cooldownModelLabel([cooldown()])).toBe('1 model');
  });

  it('uses the plural for several models', () => {
    expect(cooldownModelLabel([cooldown({ model: 'a' }), cooldown({ model: 'b' })])).toBe(
      '2 models'
    );
  });

  it('says "all models" for a provider-wide entry', () => {
    expect(cooldownModelLabel([cooldown({ model: '' })])).toBe('all models');
    expect(cooldownModelLabel([cooldown({ model: 'a' }), cooldown({ model: '' })])).toBe(
      'all models'
    );
  });
});

describe('cooldownModelNames', () => {
  it('lists the model names', () => {
    expect(cooldownModelNames([cooldown({ model: 'a' }), cooldown({ model: 'b' })])).toBe('a, b');
  });

  it('names a provider-wide entry', () => {
    expect(cooldownModelNames([cooldown({ model: '' })])).toBe('all models (provider-wide)');
  });
});

describe('cooldownFailureLabel', () => {
  it('uses the highest failure count in the group', () => {
    expect(
      cooldownFailureLabel([
        cooldown({ consecutiveFailures: 3 }),
        cooldown({ consecutiveFailures: 123 }),
        cooldown({ consecutiveFailures: 7 }),
      ])
    ).toBe('123 failures');
  });

  it('uses the singular for one failure', () => {
    expect(cooldownFailureLabel([cooldown({ consecutiveFailures: 1 })])).toBe('1 failure');
  });

  it('is omitted when there are no failures', () => {
    expect(cooldownFailureLabel([cooldown({ consecutiveFailures: 0 })])).toBeNull();
    expect(cooldownFailureLabel([cooldown({ consecutiveFailures: undefined })])).toBeNull();
  });
});

describe('cooldownAlertMeta', () => {
  it('lists model count, failures, then the primary entry error', () => {
    const [group] = groupCooldownsByProvider([
      cooldown({ model: 'a', expiry: 1_000, consecutiveFailures: 2, lastError: 'old error' }),
      cooldown({ model: 'b', expiry: 9_000, consecutiveFailures: 1, lastError: 'HTTP 503' }),
    ]);
    expect(joinAlertMeta(cooldownAlertMeta(group))).toBe('2 models · 2 failures · HTTP 503');
  });

  it('skips failures and error when absent', () => {
    const [group] = groupCooldownsByProvider([cooldown({ model: '', consecutiveFailures: 0 })]);
    expect(joinAlertMeta(cooldownAlertMeta(group))).toBe('all models');
  });
});

describe('formatCooldownCountdown', () => {
  it('shows minutes and seconds under an hour', () => {
    expect(formatCooldownCountdown(9 * 60_000 + 12_000, { multipleModels: false })).toBe('9m 12s');
  });

  it('shows hours and minutes above an hour', () => {
    expect(
      formatCooldownCountdown(4 * HOUR_MS + 37 * 60_000 + 20_000, { multipleModels: false })
    ).toBe('4h 37m');
  });

  it('prefixes "up to " only when several models are on cooldown', () => {
    expect(formatCooldownCountdown(90_000, { multipleModels: true })).toBe('up to 1m 30s');
    expect(formatCooldownCountdown(90_000, { multipleModels: false })).toBe('1m 30s');
  });

  it('rounds partial seconds up', () => {
    expect(formatCooldownCountdown(1_500, { multipleModels: false })).toBe('2s');
  });

  it('clamps an elapsed cooldown to 0s', () => {
    expect(formatCooldownCountdown(-5_000, { multipleModels: false })).toBe('0s');
  });

  it('keeps the indefinite wording, without "up to"', () => {
    expect(
      formatCooldownCountdown(INDEFINITE_COOLDOWN_THRESHOLD_MS, {
        multipleModels: true,
        lastError: 'quota exhausted',
      })
    ).toBe('until reset');
    expect(
      formatCooldownCountdown(INDEFINITE_COOLDOWN_THRESHOLD_MS * 2, {
        multipleModels: false,
        lastError: 'Insufficient credit balance',
      })
    ).toBe('until positive balance');
  });
});

describe('cooldownTickMs', () => {
  it('ticks every second under an hour', () => {
    expect(cooldownTickMs(HOUR_MS - 1)).toBe(1_000);
    expect(cooldownTickMs(5_000)).toBe(1_000);
  });

  it('ticks every 30s from an hour up', () => {
    expect(cooldownTickMs(HOUR_MS)).toBe(30_000);
    expect(cooldownTickMs(5 * HOUR_MS)).toBe(30_000);
  });
});

describe('errorRowMeta', () => {
  const row = (overrides: Partial<ErrorsByProviderPoint> = {}): ErrorsByProviderPoint => ({
    provider: 'flaky-lab',
    requests: 165,
    errors: 23,
    errorRate: 23 / 165,
    lastErrorMessage: 'HTTP 503',
    ...overrides,
  });

  it('states failed of total requests, then the last error', () => {
    expect(joinAlertMeta(errorRowMeta(row()))).toBe('23 of 165 requests failed · HTTP 503');
  });

  it('omits a missing last error', () => {
    expect(joinAlertMeta(errorRowMeta(row({ lastErrorMessage: null })))).toBe(
      '23 of 165 requests failed'
    );
  });
});

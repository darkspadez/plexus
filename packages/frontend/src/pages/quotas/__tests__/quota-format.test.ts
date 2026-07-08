import { expect, test, describe } from 'vitest';
import {
  periodAbbrev,
  allowanceSubtext,
  checkedAgoLabel,
  checkerLabel,
  remainingValue,
  usagePercent,
  usedLimitText,
} from '../quota-format';
import type { Meter } from '../../../types/quota';
import { formatResetsIn } from '../../../lib/format';
import { formatMeterValue } from '../../../components/quota/MeterValue';

// Fixed instant every time-dependent case anchors to, so results never
// depend on the real clock.
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

function meter(overrides: Partial<Meter> = {}): Meter {
  return {
    key: 'test-meter',
    label: 'Test Meter',
    kind: 'allowance',
    unit: 'tokens',
    utilizationPercent: 'unknown',
    status: 'ok',
    ...overrides,
  };
}

describe('periodAbbrev', () => {
  test('value + unit, fixed cycle stays implicit', () => {
    expect(periodAbbrev(meter({ periodValue: 1, periodUnit: 'month' }))).toBe('1mo');
  });

  test('rolling cycle appends " rolling"', () => {
    expect(periodAbbrev(meter({ periodValue: 1, periodUnit: 'day', periodCycle: 'rolling' }))).toBe(
      '1d rolling'
    );
  });

  test('abbreviates hour', () => {
    expect(periodAbbrev(meter({ periodValue: 5, periodUnit: 'hour' }))).toBe('5h');
  });

  test('abbreviates week and minute', () => {
    expect(periodAbbrev(meter({ periodValue: 2, periodUnit: 'week' }))).toBe('2wk');
    expect(periodAbbrev(meter({ periodValue: 15, periodUnit: 'minute' }))).toBe('15min');
  });

  test('null when periodValue or periodUnit is missing', () => {
    expect(periodAbbrev(meter({ periodUnit: 'month' }))).toBeNull();
    expect(periodAbbrev(meter({ periodValue: 1 }))).toBeNull();
  });
});

describe('allowanceSubtext', () => {
  test('balance kind → null even when period and resetsAt are present', () => {
    const resetsAt = new Date(NOW + 3_600_000).toISOString();
    const m = meter({ kind: 'balance', periodValue: 1, periodUnit: 'month', resetsAt });
    expect(allowanceSubtext(m, NOW)).toBeNull();
  });

  test('period + future resetsAt (within 7 days) → "1mo · resets in …"', () => {
    const resetsAt = new Date(NOW + (3 * 86400 + 4 * 3600) * 1000).toISOString();
    const expectedReset = formatResetsIn(resetsAt, NOW);
    expect(expectedReset).toBe('in 3d 4h'); // sanity: pins the <=7-day "in Xd Yh" branch
    const m = meter({ periodValue: 1, periodUnit: 'month', resetsAt });
    expect(allowanceSubtext(m, NOW)).toBe(`1mo · resets ${expectedReset}`);
  });

  test('period only (no resetsAt) → just the period', () => {
    const m = meter({ periodValue: 1, periodUnit: 'month' });
    expect(allowanceSubtext(m, NOW)).toBe('1mo');
  });

  test('resetsAt only (no period) → "resets …" with no period prefix', () => {
    const resetsAt = new Date(NOW + 45 * 60 * 1000).toISOString();
    const expectedReset = formatResetsIn(resetsAt, NOW);
    const m = meter({ resetsAt });
    expect(allowanceSubtext(m, NOW)).toBe(`resets ${expectedReset}`);
  });

  test('neither period nor resetsAt → null', () => {
    expect(allowanceSubtext(meter(), NOW)).toBeNull();
  });

  test('past resetsAt uses the verbatim "resetting now" phrasing, no "resets" prefix', () => {
    const resetsAt = new Date(NOW - 10_000).toISOString();
    const expectedReset = formatResetsIn(resetsAt, NOW);
    expect(expectedReset).toBe('resetting now'); // sanity: pins the already-has-a-verb branch
    const m = meter({ resetsAt });
    expect(allowanceSubtext(m, NOW)).toBe(expectedReset);
  });

  test('resetsAt more than 7 days out → "… · resets on …"', () => {
    const resetsAt = new Date(NOW + 10 * 86400 * 1000).toISOString();
    const expectedReset = formatResetsIn(resetsAt, NOW);
    expect(expectedReset.startsWith('on ')).toBe(true); // sanity: pins the >7-day branch
    const m = meter({ periodValue: 1, periodUnit: 'month', resetsAt });
    expect(allowanceSubtext(m, NOW)).toBe(`1mo · resets ${expectedReset}`);
  });

  test('unparseable resetsAt is NaN-guarded by formatResetsIn, so the reset part is omitted', () => {
    const m = meter({ periodValue: 1, periodUnit: 'month', resetsAt: 'not-a-real-date' });
    expect(formatResetsIn(m.resetsAt, NOW)).toBe('—'); // sanity: pins the NaN-guard branch
    expect(allowanceSubtext(m, NOW)).toBe('1mo');
  });
});

describe('checkedAgoLabel', () => {
  test('fresh (30s) → "checked 30s ago"', () => {
    const checkedAt = new Date(NOW - 30_000).toISOString();
    expect(checkedAgoLabel(checkedAt, NOW)).toBe('checked 30s ago');
  });

  test('minutes ago', () => {
    const checkedAt = new Date(NOW - 5 * 60_000).toISOString();
    expect(checkedAgoLabel(checkedAt, NOW)).toBe('checked 5m ago');
  });

  test('hours ago', () => {
    const checkedAt = new Date(NOW - 3 * 3_600_000).toISOString();
    expect(checkedAgoLabel(checkedAt, NOW)).toBe('checked 3h ago');
  });

  test('days ago', () => {
    const checkedAt = new Date(NOW - 2 * 86_400_000).toISOString();
    expect(checkedAgoLabel(checkedAt, NOW)).toBe('checked 2d ago');
  });

  test('future timestamp clamps seconds to 0 → "checked 0s ago"', () => {
    const checkedAt = new Date(NOW + 10_000).toISOString();
    expect(checkedAgoLabel(checkedAt, NOW)).toBe('checked 0s ago');
  });

  test('undefined → null', () => {
    expect(checkedAgoLabel(undefined, NOW)).toBeNull();
  });

  test('unparseable string → null', () => {
    expect(checkedAgoLabel('not-a-real-date', NOW)).toBeNull();
  });
});

describe('remainingValue', () => {
  test('explicit remaining wins even when used/limit are also present', () => {
    expect(remainingValue(meter({ remaining: 42, used: 10, limit: 100 }))).toBe(42);
  });

  test('derives limit - used when remaining is absent', () => {
    expect(remainingValue(meter({ used: 30, limit: 100 }))).toBe(70);
  });

  test('undefined when only one of used/limit is present', () => {
    expect(remainingValue(meter({ used: 30 }))).toBeUndefined();
  });

  test('undefined when none are present', () => {
    expect(remainingValue(meter())).toBeUndefined();
  });
});

describe('usagePercent', () => {
  test('passes numeric values through, including 0', () => {
    expect(usagePercent(meter({ utilizationPercent: 0 }))).toBe(0);
    expect(usagePercent(meter({ utilizationPercent: 57.5 }))).toBe(57.5);
  });

  test('"unknown" → null', () => {
    expect(usagePercent(meter({ utilizationPercent: 'unknown' }))).toBeNull();
  });

  test('"not_applicable" → null', () => {
    expect(usagePercent(meter({ utilizationPercent: 'not_applicable' }))).toBeNull();
  });

  test('undefined meter → null', () => {
    expect(usagePercent(undefined)).toBeNull();
  });
});

describe('usedLimitText', () => {
  test('usd meter uses real currency formatting', () => {
    const m = meter({ unit: 'usd', used: 11.5, limit: 25 });
    const expected = `${formatMeterValue(11.5, 'usd', true)} / ${formatMeterValue(25, 'usd', true)}`;
    expect(usedLimitText(m)).toBe(expected);
  });

  test('tokens use compact formatting on both sides', () => {
    const m = meter({ unit: 'tokens', used: 920, limit: 1000 });
    const expected = `${formatMeterValue(920, 'tokens', true)} / ${formatMeterValue(1000, 'tokens', true)}`;
    expect(expected).toBe('920 / 1,000'); // sanity: pins the compact-formatting shape
    expect(usedLimitText(m)).toBe(expected);
  });

  test('used-only → "920 / —"', () => {
    const m = meter({ unit: 'tokens', used: 920, limit: undefined });
    expect(usedLimitText(m)).toBe(`${formatMeterValue(920, 'tokens', true)} / —`);
  });

  test('limit-only → "— / 1,000"', () => {
    const m = meter({ unit: 'tokens', used: undefined, limit: 1000 });
    expect(usedLimitText(m)).toBe(`— / ${formatMeterValue(1000, 'tokens', true)}`);
  });

  test('both missing → null', () => {
    const m = meter({ used: undefined, limit: undefined });
    expect(usedLimitText(m)).toBeNull();
  });

  test('undefined meter → null', () => {
    expect(usedLimitText(undefined)).toBeNull();
  });
});

describe('checkerLabel', () => {
  test('distinct checkerId is appended in parens', () => {
    expect(checkerLabel('Synthetic', 'mock-openai')).toBe('Synthetic ( mock-openai )');
  });

  test('checkerId identical to displayName renders as just the name', () => {
    expect(checkerLabel('mock-openai', 'mock-openai')).toBe('mock-openai');
  });
});

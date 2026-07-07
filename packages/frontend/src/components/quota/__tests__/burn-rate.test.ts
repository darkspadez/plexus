import { expect, test, describe } from 'vitest';
import {
  monotonicTailSegment,
  burnRatePerDay,
  projectRunwayMs,
  computeMeterBurn,
  type BurnPoint,
  type MeterHistoryRow,
} from '../burn-rate';
import type { Meter } from '../../../types/quota';
import { formatMeterValue } from '../MeterValue';
import { formatDuration } from '../../../lib/format';

// Fixed instant every time-dependent case anchors to, so results never
// depend on the real clock.
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const HOUR = 3_600_000;

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

function point(ts: number, value: number): BurnPoint {
  return { ts, value };
}

function row(
  overrides: Partial<MeterHistoryRow> & { checkedAt: string | number }
): MeterHistoryRow {
  return { success: true, meterKey: 'test-meter', ...overrides };
}

describe('monotonicTailSegment', () => {
  test('reset boundary in an increasing (used) series', () => {
    const points = [100, 400, 700, 50, 300].map((value, i) => point(i, value));
    expect(monotonicTailSegment(points, 'increasing').map((p) => p.value)).toEqual([50, 300]);
  });

  test('top-up boundary in a decreasing (remaining) series', () => {
    const points = [90, 70, 80, 60].map((value, i) => point(i, value));
    expect(monotonicTailSegment(points, 'decreasing').map((p) => p.value)).toEqual([80, 60]);
  });

  test('fully monotonic series returns the whole series', () => {
    const points = [10, 20, 30, 40].map((value, i) => point(i, value));
    expect(monotonicTailSegment(points, 'increasing').map((p) => p.value)).toEqual([
      10, 20, 30, 40,
    ]);
  });

  test('single point returns that point', () => {
    const points = [point(0, 42)];
    expect(monotonicTailSegment(points, 'increasing')).toEqual([{ ts: 0, value: 42 }]);
    expect(monotonicTailSegment(points, 'decreasing')).toEqual([{ ts: 0, value: 42 }]);
  });
});

describe('burnRatePerDay', () => {
  test('exact math: 100 units over 12h -> 200/day', () => {
    const segment = [point(0, 0), point(12 * HOUR, 100)];
    expect(burnRatePerDay(segment)).toBe(200);
  });

  test('flat segment -> null', () => {
    const segment = [point(0, 50), point(20 * 60_000, 50)];
    expect(burnRatePerDay(segment)).toBeNull();
  });

  test('single point -> null', () => {
    expect(burnRatePerDay([point(0, 10)])).toBeNull();
  });

  test('two points 5 minutes apart (sub-MIN_SPAN) -> null', () => {
    const segment = [point(0, 10), point(5 * 60_000, 20)];
    expect(burnRatePerDay(segment)).toBeNull();
  });
});

describe('projectRunwayMs', () => {
  test('exact math', () => {
    expect(projectRunwayMs(500, 250)).toBe(172_800_000);
  });

  test('zero remaining -> null', () => {
    expect(projectRunwayMs(0, 100)).toBeNull();
  });

  test('negative remaining -> null', () => {
    expect(projectRunwayMs(-10, 100)).toBeNull();
  });

  test('zero rate -> null', () => {
    expect(projectRunwayMs(100, 0)).toBeNull();
  });
});

describe('computeMeterBurn', () => {
  test('allowance used-mode end-to-end', () => {
    const m = meter({ limit: 1000 });
    const rows: MeterHistoryRow[] = [
      row({ checkedAt: new Date(NOW - 24 * HOUR).toISOString(), used: 200 }),
      row({ checkedAt: new Date(NOW - 12 * HOUR).toISOString(), used: 400 }),
      row({ checkedAt: new Date(NOW).toISOString(), used: 600 }),
    ];
    const result = computeMeterBurn(rows, m, NOW);
    expect(result?.perDayLabel).toBe(`${formatMeterValue(400, 'tokens', true)}/day`);
    expect(result?.perDayLabel).toBe('400/day'); // sanity: pins the compact-formatting shape
    expect(result?.runwayLabel).toBe(formatDuration(86_400));
    expect(result?.runwayLabel).toBe('1d'); // sanity: pins the 24h-runway shape
    expect(result?.runwayNote).toBeUndefined();
  });

  test('%-fallback mode when rows lack a usable "used" series', () => {
    const m = meter({ unit: 'requests' });
    const rows: MeterHistoryRow[] = [
      row({ checkedAt: new Date(NOW - 12 * HOUR).toISOString(), utilizationPercent: 20 }),
      row({ checkedAt: new Date(NOW).toISOString(), utilizationPercent: 60 }),
    ];
    const result = computeMeterBurn(rows, m, NOW);
    expect(result?.perDayLabel).toBe('80.0%/day');
    expect(result?.runwayLabel).toBe(formatDuration(43_200));
    expect(result?.runwayLabel).toBe('12h'); // sanity: pins the 12h-runway shape
  });

  test('balance depletion', () => {
    const m = meter({ kind: 'balance', unit: 'usd' });
    const rows: MeterHistoryRow[] = [
      row({ checkedAt: new Date(NOW - 6 * HOUR).toISOString(), remaining: 50 }),
      row({ checkedAt: new Date(NOW).toISOString(), remaining: 20 }),
    ];
    const result = computeMeterBurn(rows, m, NOW);
    expect(result?.perDayLabel).toBe(`${formatMeterValue(120, 'usd', true)}/day`);
    expect(result?.perDayLabel).toBe('$120.0000/day'); // sanity: pins the currency formatting
    expect(result?.runwayLabel).toBe(formatDuration(14_400));
    expect(result?.runwayLabel).toBe('4h'); // sanity: pins the 4h-runway shape
    expect(result?.runwayNote).toBeUndefined();
  });

  test('balance meters ignore resetsAt — no reset-aware note even when resetsAt is imminent', () => {
    const m = meter({
      kind: 'balance',
      unit: 'usd',
      resetsAt: new Date(NOW + 1_000).toISOString(),
    });
    const rows: MeterHistoryRow[] = [
      row({ checkedAt: new Date(NOW - 6 * HOUR).toISOString(), remaining: 50 }),
      row({ checkedAt: new Date(NOW).toISOString(), remaining: 20 }),
    ];
    const result = computeMeterBurn(rows, m, NOW);
    expect(result?.runwayLabel).toBe('4h');
    expect(result?.runwayNote).toBeUndefined();
  });

  test('resets-before-exhaustion -> runwayLabel "—" with a note', () => {
    const m = meter({ limit: 1000, resetsAt: new Date(NOW + 12 * HOUR).toISOString() });
    const rows: MeterHistoryRow[] = [
      row({ checkedAt: new Date(NOW - 24 * HOUR).toISOString(), used: 200 }),
      row({ checkedAt: new Date(NOW - 12 * HOUR).toISOString(), used: 400 }),
      row({ checkedAt: new Date(NOW).toISOString(), used: 600 }),
    ];
    const result = computeMeterBurn(rows, m, NOW);
    expect(result?.runwayLabel).toBe('—');
    expect(result?.runwayNote).toBe('Window resets before projected exhaustion');
    expect(result?.perDayLabel).toBe('400/day'); // burn rate itself is still real
  });

  test('resets AFTER projected exhaustion -> real runway label', () => {
    const m = meter({ limit: 1000, resetsAt: new Date(NOW + 48 * HOUR).toISOString() });
    const rows: MeterHistoryRow[] = [
      row({ checkedAt: new Date(NOW - 24 * HOUR).toISOString(), used: 200 }),
      row({ checkedAt: new Date(NOW - 12 * HOUR).toISOString(), used: 400 }),
      row({ checkedAt: new Date(NOW).toISOString(), used: 600 }),
    ];
    const result = computeMeterBurn(rows, m, NOW);
    expect(result?.runwayLabel).toBe('1d');
    expect(result?.runwayNote).toBeUndefined();
  });

  test('unparseable/absent resetsAt -> real runway label', () => {
    const rows: MeterHistoryRow[] = [
      row({ checkedAt: new Date(NOW - 24 * HOUR).toISOString(), used: 200 }),
      row({ checkedAt: new Date(NOW - 12 * HOUR).toISOString(), used: 400 }),
      row({ checkedAt: new Date(NOW).toISOString(), used: 600 }),
    ];

    const absent = meter({ limit: 1000, resetsAt: undefined });
    expect(computeMeterBurn(rows, absent, NOW)?.runwayLabel).toBe('1d');

    const unparseable = meter({ limit: 1000, resetsAt: 'not-a-real-date' });
    expect(computeMeterBurn(rows, unparseable, NOW)?.runwayLabel).toBe('1d');
  });

  test('empty rows -> null (both stats collapse to "—" at the call site)', () => {
    expect(computeMeterBurn([], meter(), NOW)).toBeNull();
    expect(computeMeterBurn([], meter({ kind: 'balance' }), NOW)).toBeNull();
  });

  test('rows belonging to a different meter are excluded', () => {
    const m = meter({ limit: 1000 });
    const rows: MeterHistoryRow[] = [
      row({ checkedAt: new Date(NOW - 24 * HOUR).toISOString(), used: 200 }),
      // Same checker, different meter — an outlier value that would corrupt
      // the monotonic tail if the meterKey filter didn't exclude it.
      row({
        checkedAt: new Date(NOW - 18 * HOUR).toISOString(),
        used: 9_999,
        meterKey: 'other-meter',
      }),
      row({ checkedAt: new Date(NOW - 12 * HOUR).toISOString(), used: 220 }),
      row({ checkedAt: new Date(NOW).toISOString(), used: 600 }),
    ];
    const result = computeMeterBurn(rows, m, NOW);
    // Full real series (200 -> 220 -> 600) is monotonic end-to-end, so the
    // segment spans the full 24h/400-unit delta -> 400/day. If the outlier
    // leaked through, it would break monotonicity and truncate the segment
    // to the last 12h/380-unit delta (~760/day) instead.
    expect(result?.perDayLabel).toBe('400/day');
  });

  test('unsuccessful rows are excluded', () => {
    const m = meter({ limit: 1000 });
    const rows: MeterHistoryRow[] = [
      row({ checkedAt: new Date(NOW - 24 * HOUR).toISOString(), used: 200 }),
      row({
        checkedAt: new Date(NOW - 18 * HOUR).toISOString(),
        used: 9_999,
        success: false,
      }),
      row({ checkedAt: new Date(NOW - 12 * HOUR).toISOString(), used: 220 }),
      row({ checkedAt: new Date(NOW).toISOString(), used: 600 }),
    ];
    const result = computeMeterBurn(rows, m, NOW);
    expect(result?.perDayLabel).toBe('400/day');
  });
});

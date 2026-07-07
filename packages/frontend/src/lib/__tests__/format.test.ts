import { describe, expect, it, test } from 'vitest';
import { countdownTickMs, formatResetCountdown, formatResetsIn, formatTimeAgo } from '../format';

const NOW = Date.parse('2026-08-06T12:00:00.000Z');
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe('formatResetCountdown', () => {
  it('returns null when the meter reports no reset time', () => {
    expect(formatResetCountdown(null, NOW)).toBeNull();
    expect(formatResetCountdown(undefined, NOW)).toBeNull();
    expect(formatResetCountdown('not-a-date', NOW)).toBeNull();
  });

  it('formats hours and minutes for a 5-hour window', () => {
    const reset = formatResetCountdown(at(3 * 3600_000 + 12 * 60_000), NOW);
    expect(reset?.short).toBe('3h 12m');
    expect(reset?.long).toBe('resets in 3h 12m');
    expect(reset?.remainingMs).toBe(3 * 3600_000 + 12 * 60_000);
  });

  it('formats days and hours for a weekly window', () => {
    expect(formatResetCountdown(at(2 * 86400_000 + 4 * 3600_000), NOW)?.short).toBe('2d 4h');
  });

  it('drops to minutes under an hour and seconds under a minute', () => {
    expect(formatResetCountdown(at(47 * 60_000), NOW)?.short).toBe('47m');
    expect(formatResetCountdown(at(41_000), NOW)?.short).toBe('41s');
  });

  it('rolls over between seconds, minutes and hours at the unit boundaries', () => {
    expect(formatResetCountdown(at(59_999), NOW)?.short).toBe('59s');
    expect(formatResetCountdown(at(60_000), NOW)?.short).toBe('1m');
    expect(formatResetCountdown(at(3599_000), NOW)?.short).toBe('59m');
    expect(formatResetCountdown(at(3600_000), NOW)?.short).toBe('1h 0m');
  });

  it('reports a due reset as resetting now', () => {
    const reset = formatResetCountdown(at(-5_000), NOW);
    expect(reset?.short).toBe('now');
    expect(reset?.long).toBe('resetting now');
    expect(reset?.remainingMs).toBe(-5_000);

    expect(formatResetCountdown(at(0), NOW)?.long).toBe('resetting now');
  });

  it('still counts down relatively at exactly 7 days', () => {
    const reset = formatResetCountdown(at(7 * 86400_000), NOW);
    expect(reset?.short).toBe('7d 0h');
    expect(reset?.long).toBe('resets in 7d 0h');
  });

  it('falls back to an absolute date beyond 7 days', () => {
    const iso = at(9 * 86400_000);
    const expected = new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    const reset = formatResetCountdown(iso, NOW);
    expect(reset?.short).toBe(expected);
    expect(reset?.long).toBe(`resets ${expected}`);
  });

  it('exposes the absolute timestamp for tooltips', () => {
    const iso = at(3600_000);
    expect(formatResetCountdown(iso, NOW)?.absolute).toBe(new Date(iso).toLocaleString());
  });
});

describe('countdownTickMs', () => {
  it('ticks every second only while seconds are displayed', () => {
    expect(countdownTickMs(41_000)).toBe(1_000);
    expect(countdownTickMs(59_999)).toBe(1_000);
  });

  it('ticks every 30s for minute-or-coarser precision', () => {
    expect(countdownTickMs(60_000)).toBe(30_000);
    expect(countdownTickMs(3 * 3600_000)).toBe(30_000);
  });

  it('does not tick every second once the reset is overdue', () => {
    expect(countdownTickMs(0)).toBe(30_000);
    expect(countdownTickMs(-5_000)).toBe(30_000);
  });
});

describe('formatResetsIn', () => {
  // Fixed instant injected as `now` so results are deterministic without
  // spies or fake timers (frontend tests must not use either).
  const NOW = new Date('2026-01-15T12:00:00.000Z').getTime();

  test('returns an em dash for a null timestamp', () => {
    expect(formatResetsIn(null, NOW)).toBe('—');
  });

  test('returns an em dash for an undefined timestamp', () => {
    expect(formatResetsIn(undefined, NOW)).toBe('—');
  });

  test('returns "resetting now" for a timestamp in the past', () => {
    const iso = new Date(NOW - 1000).toISOString();
    expect(formatResetsIn(iso, NOW)).toBe('resetting now');
  });

  test('formats a few minutes ahead as "in Xm"', () => {
    const iso = new Date(NOW + 5 * 60 * 1000).toISOString();
    expect(formatResetsIn(iso, NOW)).toBe('in 5m');
  });

  test('formats hours and minutes ahead as "in Xh Ym"', () => {
    const iso = new Date(NOW + (3 * 3600 + 20 * 60) * 1000).toISOString();
    expect(formatResetsIn(iso, NOW)).toBe('in 3h 20m');
  });

  test('formats days ahead as "in Xd Yh"', () => {
    const iso = new Date(NOW + (4 * 86400 + 5 * 3600) * 1000).toISOString();
    expect(formatResetsIn(iso, NOW)).toBe('in 4d 5h');
  });

  test('falls back to an absolute locale date beyond 7 days out', () => {
    const iso = new Date(NOW + 10 * 86400 * 1000).toISOString();
    // Computed the same way the implementation computes it, so this doesn't
    // hardcode a locale-specific date string.
    const expected = `on ${new Date(iso).toLocaleDateString()}`;
    expect(formatResetsIn(iso, NOW)).toBe(expected);
  });

  test('an unparseable ISO string produces "in NaNm" (documents existing behavior; not desired handling)', () => {
    expect(formatResetsIn('not-a-real-date', NOW)).toBe('in NaNm');
  });
});

// formatTimeAgo has no consumers yet -- it gains its first one later in this
// project. Lock its current behavior now so that consumer can rely on it.
describe('formatTimeAgo', () => {
  test('formats seconds under a minute', () => {
    expect(formatTimeAgo(59)).toBe('59s ago');
  });

  test('crosses into minutes at 60 seconds', () => {
    expect(formatTimeAgo(60)).toBe('1m ago');
  });

  test('stays in minutes at 59 minutes', () => {
    expect(formatTimeAgo(59 * 60)).toBe('59m ago');
  });

  test('crosses into hours at 60 minutes', () => {
    expect(formatTimeAgo(60 * 60)).toBe('1h ago');
  });

  test('crosses into days at 24 hours', () => {
    expect(formatTimeAgo(24 * 60 * 60)).toBe('1d ago');
  });
});

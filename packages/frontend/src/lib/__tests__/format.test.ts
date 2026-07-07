import { expect, test, describe } from 'vitest';
import { formatResetsIn, formatTimeAgo } from '../format';

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

  test('an unparseable ISO string is guarded against NaN and returns an em dash', () => {
    expect(formatResetsIn('not-a-real-date', NOW)).toBe('—');
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

import { describe, expect, it } from 'vitest';
import { rangeRefetchMs, stepPreset } from '../TimeRangeSelector';

describe('rangeRefetchMs', () => {
  it('polls sub-hour ranges every 10 seconds', () => {
    expect(rangeRefetchMs('1m')).toBe(10_000);
    expect(rangeRefetchMs('5m')).toBe(10_000);
    expect(rangeRefetchMs('15m')).toBe(10_000);
  });

  it('polls the hour range every 30 seconds', () => {
    expect(rangeRefetchMs('hour')).toBe(30_000);
  });

  it('polls day-or-longer ranges every minute', () => {
    expect(rangeRefetchMs('day')).toBe(60_000);
    expect(rangeRefetchMs('week')).toBe(60_000);
    expect(rangeRefetchMs('month')).toBe(60_000);
    expect(rangeRefetchMs('all')).toBe(60_000);
  });

  it('never auto-refetches a custom range', () => {
    expect(rangeRefetchMs('custom')).toBe(false);
  });
});

describe('stepPreset', () => {
  const presets = ['1m', '5m', '15m', 'hour'] as const;

  it('moves one preset in the arrow direction', () => {
    expect(stepPreset(presets, '5m', 1)).toBe('15m');
    expect(stepPreset(presets, '5m', -1)).toBe('1m');
  });

  it('wraps past either end of the group', () => {
    expect(stepPreset(presets, 'hour', 1)).toBe('1m');
    expect(stepPreset(presets, '1m', -1)).toBe('hour');
  });
});

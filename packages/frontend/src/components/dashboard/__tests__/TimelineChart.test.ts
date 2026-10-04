import { describe, expect, it } from 'vitest';
import { pickAxisLabelFormatter } from '../TimelineChart';
import { formatDateLabel, formatTimeLabel } from '../../../lib/format';

const T0 = Date.parse('2026-08-06T12:34:05.000Z');
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const LABEL_AT = String(T0);

const seriesAt = (...offsetsMs: number[]) =>
  offsetsMs.map((offset) => ({ bucketStartMs: T0 + offset }));

describe('pickAxisLabelFormatter', () => {
  it('labels sub-minute buckets with seconds', () => {
    const format = pickAxisLabelFormatter(seriesAt(0, 15 * SECOND));
    expect(format(LABEL_AT)).toBe(formatTimeLabel(LABEL_AT, { seconds: true }));
  });

  it('labels minute-to-hourly buckets with a clock time', () => {
    expect(pickAxisLabelFormatter(seriesAt(0, MINUTE))(LABEL_AT)).toBe(formatTimeLabel(LABEL_AT));
    expect(pickAxisLabelFormatter(seriesAt(0, HOUR))(LABEL_AT)).toBe(formatTimeLabel(LABEL_AT));
  });

  it('labels daily buckets with a date', () => {
    expect(pickAxisLabelFormatter(seriesAt(0, DAY))(LABEL_AT)).toBe(formatDateLabel(LABEL_AT));
  });

  it('reads the bucket step from the closest pair in a sparse series', () => {
    // 15s buckets with empty ones omitted: the first gap spans three buckets.
    const format = pickAxisLabelFormatter(seriesAt(0, 45 * SECOND, 60 * SECOND));
    expect(format(LABEL_AT)).toBe(formatTimeLabel(LABEL_AT, { seconds: true }));
  });

  it('falls back to the requested window when there are fewer than two buckets', () => {
    const start = new Date(T0).toISOString();
    const format = pickAxisLabelFormatter(seriesAt(0), start, new Date(T0 + 7 * DAY).toISOString());
    expect(format(LABEL_AT)).toBe(formatDateLabel(LABEL_AT));
  });

  it('defaults to a clock time when nothing indicates the granularity', () => {
    expect(pickAxisLabelFormatter([])(LABEL_AT)).toBe(formatTimeLabel(LABEL_AT));
  });
});

/**
 * burn-rate.ts — pure math for the meter history modal's forward-looking
 * stats: average burn/day and projected runway ("Exhausts in 12d 4h").
 * Derived entirely from the history rows the modal already fetches — no new
 * endpoints, no table changes. No React, no `Date.now()`: `now` is always an
 * injected parameter so this module stays deterministic and unit-testable.
 */
import type { Meter } from '../../types/quota';
import { formatMeterValue } from './MeterValue';
import { formatDuration } from '../../lib/format';

export type BurnPoint = { ts: number; value: number };

/**
 * Shape of one row from GET /v0/management/quotas/:checkerId/history.
 * Mirrors MeterHistoryModal's local `HistoryRow` field-for-field; kept as a
 * separate type (rather than imported) so this module has no dependency on
 * a .tsx file — TS structural typing makes the two interchangeable at the
 * modal's call site.
 */
export interface MeterHistoryRow {
  checkedAt: string | number;
  remaining?: number | null;
  used?: number | null;
  limit?: number | null;
  utilizationPercent?: number | null;
  success?: boolean;
  meterKey?: string;
}

export interface MeterBurn {
  perDayLabel: string;
  runwayLabel: string;
  runwayNote?: string;
}

const MS_PER_DAY = 86_400_000;
// Two adjacent noisy snapshots must not produce absurd slopes.
const MIN_SPAN_MS = 10 * 60 * 1000;

/**
 * Walk BACKWARD from the last point while the series stays monotonic
 * (non-strict) in `direction`; stop at the first violation.
 * Allowances (used grows within a window): a DROP marks the window-reset
 * boundary. Balances (remaining falls): a RISE marks a top-up. This confines
 * the slope to the current window segment / spend run.
 */
export function monotonicTailSegment(
  points: BurnPoint[],
  direction: 'increasing' | 'decreasing'
): BurnPoint[] {
  if (points.length === 0) return [];
  let start = points.length - 1;
  for (let i = points.length - 2; i >= 0; i--) {
    const older = points[i].value;
    const newer = points[i + 1].value;
    const violates = direction === 'increasing' ? older > newer : older < newer;
    if (violates) break;
    start = i;
  }
  return points.slice(start);
}

/**
 * Per-day rate over a segment. Guards: >= 2 points, time span >= MIN_SPAN_MS
 * (10 minutes), non-zero total delta. The segment is already confined to a
 * single direction by monotonicTailSegment, so this only reports the
 * magnitude of change per day. Returns a positive units/day figure, or null
 * when any guard fails.
 */
export function burnRatePerDay(segment: BurnPoint[]): number | null {
  if (segment.length < 2) return null;
  const first = segment[0];
  const last = segment[segment.length - 1];
  const spanMs = last.ts - first.ts;
  // Number.isFinite also rejects a NaN span (unparseable timestamp) — a bare
  // `<` comparison is false for NaN, i.e. it would fail OPEN and let a NaN
  // rate leak into the labels.
  if (!Number.isFinite(spanMs) || spanMs < MIN_SPAN_MS) return null;
  const delta = last.value - first.value;
  if (delta === 0) return null;
  return (Math.abs(delta) / spanMs) * MS_PER_DAY;
}

/** remaining > 0 && perDay > 0 ? (remaining / perDay) * 86_400_000 : null */
export function projectRunwayMs(remaining: number, perDay: number): number | null {
  if (!(remaining > 0) || !(perDay > 0)) return null;
  return (remaining / perDay) * MS_PER_DAY;
}

function parseResetsAtMs(resetsAt: string | undefined): number | null {
  if (!resetsAt) return null;
  const ms = new Date(resetsAt).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function toTs(checkedAt: string | number): number {
  return typeof checkedAt === 'number' ? checkedAt : new Date(checkedAt).getTime();
}

type TimedRow = MeterHistoryRow & { ts: number };

function numericPoints(
  rows: TimedRow[],
  key: 'used' | 'utilizationPercent' | 'remaining'
): BurnPoint[] {
  const points: BurnPoint[] = [];
  for (const row of rows) {
    const value = row[key];
    if (typeof value === 'number') points.push({ ts: row.ts, value });
  }
  return points;
}

// Shared runway finalization: project remaining/perDay into a duration
// label, then (allowances only) check whether the meter's window resets
// before that projected exhaustion.
function finalizeRunway(
  perDayLabel: string,
  remaining: number | undefined,
  perDay: number,
  meter: Meter,
  now: number,
  resetAware: boolean
): MeterBurn {
  const runwayMs = remaining !== undefined ? projectRunwayMs(remaining, perDay) : null;
  if (runwayMs === null) return { perDayLabel, runwayLabel: '—' };

  if (resetAware) {
    const resetsAtMs = parseResetsAtMs(meter.resetsAt);
    if (resetsAtMs !== null && resetsAtMs < now + runwayMs) {
      return {
        perDayLabel,
        runwayLabel: '—',
        runwayNote: 'Window resets before projected exhaustion',
      };
    }
  }

  return { perDayLabel, runwayLabel: formatDuration(Math.round(runwayMs / 1000)) };
}

function computeAllowanceBurn(rows: TimedRow[], meter: Meter, now: number): MeterBurn | null {
  const usedPoints = numericPoints(rows, 'used');
  const pctPoints = numericPoints(rows, 'utilizationPercent');
  const useUsedSeries = usedPoints.length >= 2;
  const series = useUsedSeries ? usedPoints : pctPoints;
  if (series.length < 2) return null;

  const segment = monotonicTailSegment(series, 'increasing');
  const perDay = burnRatePerDay(segment);
  if (perDay === null) return null;

  const perDayLabel = useUsedSeries
    ? `${formatMeterValue(perDay, meter.unit, true)}/day`
    : `${perDay.toFixed(1)}%/day`;

  const lastUsed = usedPoints[usedPoints.length - 1]?.value;
  const remaining = useUsedSeries
    ? (meter.remaining ??
      (meter.limit !== undefined && lastUsed !== undefined ? meter.limit - lastUsed : undefined))
    : 100 - pctPoints[pctPoints.length - 1].value;

  return finalizeRunway(perDayLabel, remaining, perDay, meter, now, true);
}

function computeBalanceBurn(rows: TimedRow[], meter: Meter, now: number): MeterBurn | null {
  const points = numericPoints(rows, 'remaining');
  if (points.length < 2) return null;

  const segment = monotonicTailSegment(points, 'decreasing');
  const perDay = burnRatePerDay(segment);
  if (perDay === null) return null;

  const perDayLabel = `${formatMeterValue(perDay, meter.unit, true)}/day`;
  const remaining = points[points.length - 1].value;

  return finalizeRunway(perDayLabel, remaining, perDay, meter, now, false);
}

/**
 * Composed entry point the modal calls.
 *
 * Null-vs-'—' contract: returns null iff no per-day rate is computable
 * (no usable series, flat/short/sub-span segment) — exactly the case where
 * BOTH tiles show '—', so the modal renders `burn?.x ?? '—'`. When a rate
 * exists but the runway doesn't (no remaining, or an allowance window
 * resets before projected exhaustion), the result is non-null with
 * `runwayLabel: '—'` (plus `runwayNote` in the reset case).
 */
export function computeMeterBurn(
  rows: MeterHistoryRow[],
  meter: Meter,
  now: number
): MeterBurn | null {
  const relevant: TimedRow[] = rows
    .filter((row) => row.success && (row.meterKey == null || row.meterKey === meter.key))
    .map((row) => ({ ...row, ts: toTs(row.checkedAt) }))
    // Drop rows whose checkedAt didn't parse — a NaN ts would poison every
    // downstream span/sort computation.
    .filter((row) => Number.isFinite(row.ts))
    .sort((a, b) => a.ts - b.ts);

  return meter.kind === 'allowance'
    ? computeAllowanceBurn(relevant, meter, now)
    : computeBalanceBurn(relevant, meter, now);
}

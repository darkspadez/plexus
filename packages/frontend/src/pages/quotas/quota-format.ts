/**
 * quota-format.ts — pure text-builder helpers for the Quotas table's cells.
 * No React, no page state: given a Meter (and, for time-dependent helpers, a
 * fixed `now`), each function returns the exact string (or null) a cell
 * should render.
 */
import type { Meter } from '../../types/quota';
import { formatMeterValue } from '../../components/quota/MeterValue';
import { formatTimeAgo, formatResetsIn } from '../../lib/format';

// Same mapping the page's old periodLabel used. Anything other than these
// four (in practice, 'month') abbreviates to 'mo'.
const PERIOD_UNIT_ABBREV: Record<string, string> = {
  hour: 'h',
  day: 'd',
  minute: 'min',
  week: 'wk',
};

/** "1mo", "5h", "1wk" — value+abbreviated unit; append " rolling" only for rolling cycles
 *  (fixed is the default and stays implicit). null when periodValue/periodUnit missing. */
export function periodAbbrev(meter: Meter): string | null {
  if (!meter.periodValue || !meter.periodUnit) return null;
  const unit = PERIOD_UNIT_ABBREV[meter.periodUnit] ?? 'mo';
  const suffix = meter.periodCycle === 'rolling' ? ' rolling' : '';
  return `${meter.periodValue}${unit}${suffix}`;
}

/** Meter-cell subtext for allowances: "1mo · resets in 12d 4h".
 *  null for kind==='balance' and when no parts exist. */
export function allowanceSubtext(meter: Meter, now: number = Date.now()): string | null {
  if (meter.kind === 'balance') return null;
  const parts: string[] = [];
  const period = periodAbbrev(meter);
  if (period) parts.push(period);
  const r = formatResetsIn(meter.resetsAt, now);
  if (r.startsWith('in ') || r.startsWith('on ')) {
    parts.push(`resets ${r}`);
  } else if (r !== '—') {
    // Covers phrasing like "resetting now" that already contains a verb.
    parts.push(r);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** "checked 5m ago" from an ISO timestamp; seconds clamped to ≥0 (future/clock-skew → "0s ago").
 *  null when absent or unparseable (NaN date). */
export function checkedAgoLabel(
  checkedAt: string | undefined,
  now: number = Date.now()
): string | null {
  if (!checkedAt) return null;
  const checkedAtMs = new Date(checkedAt).getTime();
  if (isNaN(checkedAtMs)) return null;
  const seconds = Math.max(0, Math.floor((now - checkedAtMs) / 1000));
  return `checked ${formatTimeAgo(seconds)}`;
}

/** Moved VERBATIM from Quotas.tsx (remaining ?? limit-used ?? undefined). */
export function remainingValue(meter: Meter): number | undefined {
  if (meter.remaining !== undefined) return meter.remaining;
  if (meter.used !== undefined && meter.limit !== undefined) return meter.limit - meter.used;
  return undefined;
}

/** Numeric utilizationPercent or null ('unknown' | 'not_applicable' | no meter). */
export function usagePercent(meter: Meter | undefined): number | null {
  if (!meter) return null;
  return typeof meter.utilizationPercent === 'number' ? meter.utilizationPercent : null;
}

/** "920 / 1,000" via formatMeterValue(v, unit, true) per side; '—' for a missing side;
 *  null when BOTH used and limit are undefined or meter is undefined. */
export function usedLimitText(meter: Meter | undefined): string | null {
  if (!meter) return null;
  if (meter.used === undefined && meter.limit === undefined) return null;
  const used = meter.used !== undefined ? formatMeterValue(meter.used, meter.unit, true) : '—';
  const limit = meter.limit !== undefined ? formatMeterValue(meter.limit, meter.unit, true) : '—';
  return `${used} / ${limit}`;
}

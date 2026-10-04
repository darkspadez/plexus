import type { UsageSummaryBreakdownResult, UsageSummaryGroup } from '../../lib/api';
import { formatNumber } from '../../lib/format';

/**
 * Row derivation for the dashboard's Top Providers / Top Models tables
 * (`TopUsageCard`), kept free of React so it can be unit-tested in the node
 * test environment.
 */

/** Name of the roll-up row the backend appends to a truncated breakdown. */
const ROLLUP_NAME = 'Other';

/**
 * Name of the provider breakdown's bucket for requests no provider was
 * recorded on (the backend groups by `COALESCE(provider, 'unknown')`).
 */
const UNATTRIBUTED_PROVIDER_NAME = 'unknown';

/** A breakdown entity plus the name the table shows for it. */
export interface TopUsageRow extends UsageSummaryGroup {
  /**
   * Same as `name`, except the provider breakdown's unattributed bucket reads
   * "Unattributed" (as Errors by Provider labels it) instead of like a
   * provider slug. `name` stays the backend's key.
   */
  label: string;
}

/**
 * The breakdown's top-N entities, labelled for display; `noun` is the
 * breakdown's entity ("provider", "model"). A truncated breakdown ends with a
 * synthetic 'Other' roll-up of everything past the limit, which is dropped;
 * without truncation there is no roll-up, so an entity really named 'Other'
 * stays.
 */
export function topUsageRows(
  breakdown: UsageSummaryBreakdownResult | undefined,
  noun: string
): TopUsageRow[] {
  if (!breakdown) return [];
  const { items, truncated } = breakdown;
  const entities = truncated && items.at(-1)?.name === ROLLUP_NAME ? items.slice(0, -1) : items;
  return entities.map((item) => ({
    ...item,
    label:
      noun === 'provider' && item.name === UNATTRIBUTED_PROVIDER_NAME ? 'Unattributed' : item.name,
  }));
}

export type SuccessTone = 'success' | 'warning' | 'danger';

/** Tone for a 0-100 success rate: from 95 healthy, from 80 degraded, below that failing. */
export function successRateTone(successRate: number): SuccessTone {
  if (successRate >= 95) return 'success';
  if (successRate >= 80) return 'warning';
  return 'danger';
}

/** "1 provider" / "N providers", for a card header's entity count. */
export function formatCountLabel(count: number, noun: string): string {
  return `${formatNumber(count, 0)} ${count === 1 ? noun : `${noun}s`}`;
}

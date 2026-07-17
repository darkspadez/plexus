import type { UsageSummaryWindowStats } from '../../lib/api';

/**
 * Per-tile change vs the preceding window, for the dashboard KPI grid.
 *
 * Volume tiles (`requests`, `avgLatency`, `tokens`, `cost`, `energy`) carry a
 * signed relative-% change; rate tiles (`errorRate`, `cacheHit`) carry a
 * signed percentage-point change. `null` means "don't render a chip" — the
 * prior window is missing, empty, or the metric's denominator is degenerate.
 */
export interface KpiDeltas {
  requests: number | null;
  errorRate: number | null;
  avgLatency: number | null;
  tokens: number | null;
  cacheHit: number | null;
  cost: number | null;
  energy: number | null;
}

/** Relative % change from `prev` to `current`; null when `prev` has no signal. */
export function relativeDelta(current: number, prev: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prev) || prev <= 0) return null;
  return ((current - prev) / prev) * 100;
}

/** Error rate as a percentage of requests; 0 when the window saw no requests. */
export function errorRatePct(
  stats: Pick<UsageSummaryWindowStats, 'totalRequests' | 'totalErrors'>
): number {
  if (stats.totalRequests <= 0) return 0;
  return (stats.totalErrors / stats.totalRequests) * 100;
}

/**
 * Cache hit rate: what share of prompt tokens were served from cache.
 * Cache writes are excluded — they are neither hits nor misses.
 * 0 when the window saw no prompt tokens.
 */
export function cacheHitRatePct(
  stats: Pick<UsageSummaryWindowStats, 'inputTokens' | 'cachedTokens'>
): number {
  const denominator = stats.inputTokens + stats.cachedTokens;
  if (denominator <= 0) return 0;
  return (stats.cachedTokens / denominator) * 100;
}

/** All-null deltas — the "render no chips" state (loading, range=all, empty prior window). */
export const EMPTY_KPI_DELTAS: KpiDeltas = {
  requests: null,
  errorRate: null,
  avgLatency: null,
  tokens: null,
  cacheHit: null,
  cost: null,
  energy: null,
};

/**
 * Compute all KPI deltas for the dashboard grid.
 *
 * Everything is null when `prevStats` is absent (range=all) or the prior
 * window had no traffic; rate deltas additionally require both windows'
 * denominators to be non-degenerate.
 */
export function buildKpiDeltas(
  stats: UsageSummaryWindowStats,
  prevStats: UsageSummaryWindowStats | null | undefined
): KpiDeltas {
  if (!prevStats || prevStats.totalRequests <= 0) return EMPTY_KPI_DELTAS;

  // Rate-style metrics (error rate, avg latency, cache hit) are undefined —
  // not zero — over a window with no traffic, so their deltas require a
  // non-degenerate denominator on BOTH sides. Volume metrics stay visible
  // even at -100%: "traffic stopped" is a real signal.
  const hasCurrentTraffic = stats.totalRequests > 0;
  const prevCacheDenominator = prevStats.inputTokens + prevStats.cachedTokens;
  const cacheDenominator = stats.inputTokens + stats.cachedTokens;

  return {
    requests: relativeDelta(stats.totalRequests, prevStats.totalRequests),
    errorRate: hasCurrentTraffic ? errorRatePct(stats) - errorRatePct(prevStats) : null,
    avgLatency: hasCurrentTraffic
      ? relativeDelta(stats.avgDurationMs, prevStats.avgDurationMs)
      : null,
    tokens: relativeDelta(stats.totalTokens, prevStats.totalTokens),
    cacheHit:
      prevCacheDenominator > 0 && cacheDenominator > 0
        ? cacheHitRatePct(stats) - cacheHitRatePct(prevStats)
        : null,
    cost: relativeDelta(stats.totalCost, prevStats.totalCost),
    energy: relativeDelta(stats.totalKwhUsed, prevStats.totalKwhUsed),
  };
}

/** Magnitude formatter for relative-% delta chips (direction comes from the chip icon). */
export const formatDeltaPercent = (n: number): string => `${n.toFixed(1)}%`;

/** Magnitude formatter for percentage-point delta chips. */
export const formatDeltaPp = (n: number): string => `${n.toFixed(1)}pp`;

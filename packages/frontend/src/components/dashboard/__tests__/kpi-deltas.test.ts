import { describe, expect, it } from 'vitest';
import type { UsageSummaryWindowStats } from '../../../lib/api';
import {
  buildKpiDeltas,
  cacheHitRatePct,
  errorRatePct,
  formatDeltaPp,
  formatDeltaPercent,
  relativeDelta,
} from '../kpi-deltas';

const windowStats = (
  overrides: Partial<UsageSummaryWindowStats> = {}
): UsageSummaryWindowStats => ({
  totalRequests: 100,
  totalTokens: 1000,
  inputTokens: 400,
  outputTokens: 300,
  cachedTokens: 200,
  cacheWriteTokens: 100,
  totalCost: 2,
  totalKwhUsed: 0.5,
  avgDurationMs: 800,
  totalDurationMs: 80_000,
  totalErrors: 5,
  ...overrides,
});

describe('relativeDelta', () => {
  it('computes signed percentage change', () => {
    expect(relativeDelta(120, 100)).toBeCloseTo(20, 8);
    expect(relativeDelta(80, 100)).toBeCloseTo(-20, 8);
    expect(relativeDelta(100, 100)).toBeCloseTo(0, 8);
  });

  it('returns null when the previous value has no signal', () => {
    expect(relativeDelta(50, 0)).toBeNull();
    expect(relativeDelta(50, -1)).toBeNull();
    expect(relativeDelta(Number.NaN, 100)).toBeNull();
    expect(relativeDelta(50, Number.NaN)).toBeNull();
  });
});

describe('errorRatePct', () => {
  it('computes errors as a percentage of requests', () => {
    expect(errorRatePct({ totalRequests: 200, totalErrors: 5 })).toBeCloseTo(2.5, 8);
  });

  it('returns 0 for an empty window', () => {
    expect(errorRatePct({ totalRequests: 0, totalErrors: 0 })).toBe(0);
  });
});

describe('cacheHitRatePct', () => {
  it('computes cached share of prompt tokens, excluding cache writes', () => {
    expect(cacheHitRatePct({ inputTokens: 400, cachedTokens: 600 })).toBeCloseTo(60, 8);
  });

  it('returns 0 when there were no prompt tokens', () => {
    expect(cacheHitRatePct({ inputTokens: 0, cachedTokens: 0 })).toBe(0);
  });
});

describe('buildKpiDeltas', () => {
  it('computes all deltas against the previous window', () => {
    const stats = windowStats({
      totalRequests: 120,
      totalTokens: 1500,
      inputTokens: 500,
      cachedTokens: 500, // 50% hit rate
      totalCost: 3,
      totalKwhUsed: 0.75,
      avgDurationMs: 600,
      totalErrors: 12, // 10% error rate
    });
    const prev = windowStats({
      totalRequests: 100,
      totalTokens: 1000,
      inputTokens: 600,
      cachedTokens: 400, // 40% hit rate
      totalCost: 2,
      totalKwhUsed: 0.5,
      avgDurationMs: 800,
      totalErrors: 8, // 8% error rate
    });

    const deltas = buildKpiDeltas(stats, prev);

    expect(deltas.requests).toBeCloseTo(20, 8);
    expect(deltas.errorRate).toBeCloseTo(2, 8); // 10% - 8% = +2pp
    expect(deltas.avgLatency).toBeCloseTo(-25, 8);
    expect(deltas.tokens).toBeCloseTo(50, 8);
    expect(deltas.cacheHit).toBeCloseTo(10, 8); // 50% - 40% = +10pp
    expect(deltas.cost).toBeCloseTo(50, 8);
    expect(deltas.energy).toBeCloseTo(50, 8);
  });

  it('returns all nulls without a previous window (range=all)', () => {
    const deltas = buildKpiDeltas(windowStats(), null);
    expect(Object.values(deltas).every((d) => d === null)).toBe(true);
  });

  it('returns all nulls when the previous window had no traffic', () => {
    const deltas = buildKpiDeltas(windowStats(), windowStats({ totalRequests: 0 }));
    expect(Object.values(deltas).every((d) => d === null)).toBe(true);
  });

  it('nulls per-metric deltas whose previous value has no signal', () => {
    const prev = windowStats({
      totalRequests: 10,
      totalCost: 0, // no cost signal
      avgDurationMs: 0, // no latency signal
    });
    const deltas = buildKpiDeltas(windowStats(), prev);
    expect(deltas.cost).toBeNull();
    expect(deltas.avgLatency).toBeNull();
    expect(deltas.requests).not.toBeNull();
  });

  it('nulls rate deltas but keeps volume deltas when the current window is empty', () => {
    const emptyCurrent = windowStats({
      totalRequests: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      cacheWriteTokens: 0,
      totalCost: 0,
      totalKwhUsed: 0,
      avgDurationMs: 0,
      totalErrors: 0,
    });
    const deltas = buildKpiDeltas(emptyCurrent, windowStats());

    // Rates are undefined (not zero) over an empty window.
    expect(deltas.errorRate).toBeNull();
    expect(deltas.avgLatency).toBeNull();
    expect(deltas.cacheHit).toBeNull();
    // Volume drops to zero are real signal: -100%.
    expect(deltas.requests).toBeCloseTo(-100, 8);
    expect(deltas.tokens).toBeCloseTo(-100, 8);
    expect(deltas.cost).toBeCloseTo(-100, 8);
    expect(deltas.energy).toBeCloseTo(-100, 8);
  });

  it('nulls the cache-hit delta when either window lacks prompt tokens', () => {
    const noPromptTokens = { inputTokens: 0, cachedTokens: 0 };
    expect(buildKpiDeltas(windowStats(), windowStats(noPromptTokens)).cacheHit).toBeNull();
    expect(buildKpiDeltas(windowStats(noPromptTokens), windowStats()).cacheHit).toBeNull();
  });
});

describe('delta chip formatters', () => {
  it('formats magnitudes without an explicit sign (direction comes from the chip icon)', () => {
    expect(formatDeltaPercent(12.34)).toBe('12.3%');
    expect(formatDeltaPp(3.14)).toBe('3.1pp');
  });
});

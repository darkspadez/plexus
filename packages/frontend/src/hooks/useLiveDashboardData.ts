/**
 * @file useLiveDashboardData.ts
 *
 * Data hook for the two Live Metrics cards salvaged onto AdminDashboard as
 * drill-in cards: Concurrency and Model Stack. This is a deliberate trim of
 * upstream's 835-line `useLiveDashboardData` (which powered the full 10-card
 * Live Metrics tab) down to just the concurrency-history accumulation and
 * model-stack bucketing those two cards need — see docs/DESIGN_MIGRATION.md
 * for the product decision to drop the rest (per-provider/per-model
 * breakdowns, request stream, aggregate stats) in favour of Grafana + the
 * Logs ledger.
 *
 * Rather than re-implement raw polling with setInterval/useEffect (the old
 * LiveTab pattern), this hook builds on the existing TanStack Query hooks
 * (`useConcurrencyData`, `useLiveLogs`) already used elsewhere on
 * AdminDashboard, so the concurrency query is shared/deduped with the
 * Active Requests KPI tile's poll rather than issuing a second one.
 */

import { useEffect, useMemo, useState } from 'react';
import type { UsageRecord } from '../lib/api';
import { useConcurrencyData, useLiveLogs } from './queries/useDashboard';
import {
  MODEL_TIMELINE_MAX_SERIES,
  type ModelTimelineBucket,
  type ModelTimelineSeries,
} from '../components/dashboard/liveTypes';
import { getModelLabel } from '../components/dashboard/liveUtils';
import { chartColor } from '../lib/chartPalette';

/** Rolling live window used for the model-stack bucketing (minutes). */
const LIVE_WINDOW_MINUTES = 30;
/** Cap on the number of polled points kept for the concurrency history chart. */
const CONCURRENCY_HISTORY_LIMIT = 30;
/** Shared poll cadence with the rest of AdminDashboard's live tiles. */
const POLL_INTERVAL_MS = 10000;
/** Number of recent logs fetched to bucket into the model-stack timeline. */
const LOGS_FETCH_LIMIT = 500;

export interface LiveDashboardData {
  liveWindowMinutes: number;

  concurrencyLoading: boolean;
  concurrencyHistory: Record<string, unknown>[];
  concurrencyProviders: string[];
  totalConcurrentRequests: number;

  modelTimeline: {
    series: ModelTimelineSeries[];
    seriesLabelMap: Map<string, string>;
    data: ModelTimelineBucket[];
  };
  modelTimelineLoading: boolean;
}

export function useLiveDashboardData(): LiveDashboardData {
  // Same queryKey as the Active Requests KPI tile's useConcurrencyData call —
  // TanStack Query dedupes these into a single shared 10s poll.
  const concurrencyQuery = useConcurrencyData({ refetchInterval: POLL_INTERVAL_MS });
  const liveLogsQuery = useLiveLogs({
    limit: LOGS_FETCH_LIMIT,
    refetchInterval: POLL_INTERVAL_MS,
  });

  // ---------------------------------------------------------------------------
  // Concurrency history -- a client-side rolling buffer of per-poll snapshots,
  // keyed by provider, for the AreaChart in ConcurrencyCard/ConcurrencyModal.
  // ---------------------------------------------------------------------------
  const [concurrencyHistory, setConcurrencyHistory] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (!concurrencyQuery.data) {
      return;
    }

    const point: Record<string, unknown> = { time: new Date().toLocaleTimeString() };
    for (const item of concurrencyQuery.data) {
      const label = item.provider || 'unknown';
      point[label] = Number(item.count || 0);
    }

    setConcurrencyHistory((prev) => {
      const next = [...prev, point];
      return next.length > CONCURRENCY_HISTORY_LIMIT
        ? next.slice(-CONCURRENCY_HISTORY_LIMIT)
        : next;
    });
  }, [concurrencyQuery.data]);

  const totalConcurrentRequests = useMemo(
    () => (concurrencyQuery.data ?? []).reduce((acc, item) => acc + Number(item.count || 0), 0),
    [concurrencyQuery.data]
  );

  const concurrencyProviders = useMemo(() => {
    const providers = new Set<string>();
    for (const point of concurrencyHistory) {
      for (const key of Object.keys(point)) {
        if (key !== 'time') providers.add(key);
      }
    }
    return Array.from(providers).sort();
  }, [concurrencyHistory]);

  // ---------------------------------------------------------------------------
  // Model stack -- bucket recent logs (within the live window) into per-minute
  // stacked counts for the top N models, plus avg TTFT / avg TPS lines.
  // ---------------------------------------------------------------------------
  const liveWindowMs = useMemo(() => LIVE_WINDOW_MINUTES * 60 * 1000, []);

  const liveRequests = useMemo<UsageRecord[]>(() => {
    const logs = liveLogsQuery.data ?? [];
    const cutoff = Date.now() - liveWindowMs;
    return logs.filter((request) => {
      const requestTime = new Date(request.date).getTime();
      return Number.isFinite(requestTime) && requestTime >= cutoff;
    });
  }, [liveLogsQuery.data, liveWindowMs]);

  const modelTimeline = useMemo(() => {
    const modelCounts = new Map<string, number>();
    for (const request of liveRequests) {
      const model = getModelLabel(request);
      modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
    }

    const topModels = Array.from(modelCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MODEL_TIMELINE_MAX_SERIES)
      .map(([label]) => label);

    const series: ModelTimelineSeries[] = topModels.map((label, index) => ({
      key: 'model_' + index,
      label,
      color: chartColor(index + 1),
    }));
    const seriesKeyByLabel = new Map(series.map((entry) => [entry.label, entry.key]));

    const buckets = new Map<string, ModelTimelineBucket>();
    const now = Date.now();

    const useMinuteBuckets = LIVE_WINDOW_MINUTES <= 30;
    const use5MinuteBuckets = LIVE_WINDOW_MINUTES <= 24 * 60;

    const bucketCount = useMinuteBuckets ? LIVE_WINDOW_MINUTES : Math.ceil(LIVE_WINDOW_MINUTES / 5);
    const bucketSizeMs = useMinuteBuckets ? 60000 : 300000;

    for (let i = bucketCount - 1; i >= 0; i--) {
      const bucketDate = new Date(now - i * bucketSizeMs);
      const key = bucketDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: useMinuteBuckets || use5MinuteBuckets ? '2-digit' : undefined,
        hour12: false,
      });
      const bucket: ModelTimelineBucket = {
        time: key,
        requests: 0,
        errors: 0,
        tokens: 0,
        avgTtftMs: 0,
        avgTps: 0,
        ttftTotal: 0,
        ttftCount: 0,
        tpsTotal: 0,
        tpsCount: 0,
      };

      for (const item of series) {
        bucket[item.key] = 0;
      }
      buckets.set(key, bucket);
    }

    for (const request of liveRequests) {
      const requestTime = new Date(request.date).getTime();
      const bucketIndex = Math.floor((now - requestTime) / bucketSizeMs);
      const bucketDate = new Date(now - bucketIndex * bucketSizeMs);
      const key = bucketDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: useMinuteBuckets || use5MinuteBuckets ? '2-digit' : undefined,
        hour12: false,
      });
      const bucket = buckets.get(key);
      if (!bucket) {
        continue;
      }

      bucket.requests += 1;
      if ((request.responseStatus || '').toLowerCase() !== 'success') {
        bucket.errors += 1;
      }
      bucket.tokens +=
        Number(request.tokensInput || 0) +
        Number(request.tokensOutput || 0) +
        Number(request.tokensCached || 0) +
        Number(request.tokensCacheWrite || 0);

      const modelLabel = getModelLabel(request);
      const seriesKey = seriesKeyByLabel.get(modelLabel);
      if (seriesKey) {
        bucket[seriesKey] = Number(bucket[seriesKey] || 0) + 1;
      }

      const ttft = Number(request.ttftMs || 0);
      if (Number.isFinite(ttft) && ttft > 0) {
        bucket.ttftTotal += ttft;
        bucket.ttftCount += 1;
      }

      const tps = Number(request.tokensPerSec || 0);
      if (Number.isFinite(tps) && tps > 0) {
        bucket.tpsTotal += tps;
        bucket.tpsCount += 1;
      }
    }

    const data = Array.from(buckets.values()).map((bucket) => ({
      ...bucket,
      avgTtftMs: bucket.ttftCount > 0 ? bucket.ttftTotal / bucket.ttftCount : 0,
      avgTps: bucket.tpsCount > 0 ? bucket.tpsTotal / bucket.tpsCount : 0,
    }));

    return {
      series,
      seriesLabelMap: new Map(series.map((entry) => [entry.key, entry.label])),
      data,
    };
  }, [liveRequests]);

  return {
    liveWindowMinutes: LIVE_WINDOW_MINUTES,

    concurrencyLoading: concurrencyQuery.isLoading,
    concurrencyHistory,
    concurrencyProviders,
    totalConcurrentRequests,

    modelTimeline,
    modelTimelineLoading: liveLogsQuery.isLoading,
  };
}

export default useLiveDashboardData;

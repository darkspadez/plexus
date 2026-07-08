import React, { useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '../ui/Card';
import { useConcurrencyData } from '../../hooks/queries/useDashboard';
import { formatNumber } from '../../lib/format';

/** Colour palette for concurrency provider lines */
const CONCURRENCY_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
];

/** Max rolling history points kept for the stacked area chart (5 min at a 10s poll interval) */
const MAX_HISTORY_POINTS = 30;

/**
 * Live in-flight-request gauge, stacked by provider. Driven entirely by its
 * own 10s poll (`useConcurrencyData`) — independent of any page-level time
 * range, since this is a live snapshot rather than a ranged aggregate.
 * Ported verbatim from LiveTab's 'concurrency' case.
 */
export const ConcurrencyGauge: React.FC = () => {
  const concurrencyQuery = useConcurrencyData({ refetchInterval: 10000, enabled: true });
  const concurrencyData = concurrencyQuery.data ?? [];
  const concurrencyLoading = concurrencyQuery.isFetching;

  /** Rolling history of concurrency snapshots for the stacked area chart */
  const [concurrencyHistory, setConcurrencyHistory] = useState<Record<string, unknown>[]>([]);

  /**
   * Accumulate concurrency snapshots into a rolling history (max
   * MAX_HISTORY_POINTS). Fires whenever new concurrency data arrives.
   */
  useEffect(() => {
    const data = concurrencyQuery.data;
    if (!data) return;
    const point: Record<string, unknown> = { time: new Date().toLocaleTimeString() };
    for (const item of data) {
      const label = item.provider || 'unknown';
      point[label] = Number(item.count || 0);
    }
    setConcurrencyHistory((prev) => {
      const next = [...prev, point];
      return next.length > MAX_HISTORY_POINTS ? next.slice(-MAX_HISTORY_POINTS) : next;
    });
  }, [concurrencyQuery.dataUpdatedAt]);

  /** Total in-flight requests across all providers (sum of concurrencyData counts) */
  const totalConcurrentRequests = useMemo(
    () => concurrencyData.reduce((acc, item) => acc + Number(item.count || 0), 0),
    [concurrencyData]
  );

  /** Unique provider names seen across all concurrency history snapshots, for chart lines */
  const concurrencyProviders = useMemo(() => {
    const providers = new Set<string>();
    for (const point of concurrencyHistory) {
      for (const key of Object.keys(point)) {
        if (key !== 'time') providers.add(key);
      }
    }
    return Array.from(providers).sort();
  }, [concurrencyHistory]);

  return (
    <Card
      title="Concurrency"
      extra={
        <span className="text-xs text-foreground-subtle">
          <span className="sm:hidden">10s</span>
          <span className="hidden sm:inline">Auto-refresh: 10s</span>
        </span>
      }
    >
      {concurrencyLoading && concurrencyHistory.length === 0 ? (
        <div className="h-48 sm:h-56 flex items-center justify-center text-foreground-muted text-sm">
          Loading concurrency data...
        </div>
      ) : concurrencyHistory.length === 0 ? (
        <div className="h-48 sm:h-56 flex items-center justify-center text-foreground-muted text-sm">
          Collecting concurrency data...
        </div>
      ) : (
        <div className="h-48 sm:h-56">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-foreground-subtle">In-Flight by Provider</span>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {formatNumber(totalConcurrentRequests, 0)}
            </span>
          </div>
          <ResponsiveContainer width="100%" height="85%">
            <AreaChart
              data={concurrencyHistory}
              margin={{ top: 10, right: 24, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="time" stroke="var(--foreground-subtle)" />
              <YAxis stroke="var(--foreground-subtle)" allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                }}
              />
              {concurrencyProviders.map((provider, idx) => (
                <Area
                  key={provider}
                  type="monotone"
                  dataKey={provider}
                  stackId="1"
                  stroke={CONCURRENCY_COLORS[idx % CONCURRENCY_COLORS.length]}
                  fill={CONCURRENCY_COLORS[idx % CONCURRENCY_COLORS.length]}
                  fillOpacity={0.6}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

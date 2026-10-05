import React, { useMemo } from 'react';
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
import type { UsageSummarySeriesPoint } from '../../lib/api';
import { formatDateLabel, formatNumber, formatTimeLabel, formatTokens } from '../../lib/format';

interface TimelineChartProps {
  /** The usage-summary series for the selected range (fetched by `AdminDashboard`). */
  series?: UsageSummarySeriesPoint[];
  loading: boolean;
  /** Requested window bounds; the axis-label fallback when the series is too short. */
  startDate?: string;
  endDate?: string;
}

// A bucket gap at or above this threshold is treated as day-granularity (or
// coarser); anything below it is treated as sub-day and gets a time label.
// Set comfortably under 24h so daily buckets (which can drift by DST-related
// minutes) still clear the bar, while hourly/5-minute/1-minute buckets don't.
const DAY_GRANULARITY_THRESHOLD_MS = 20 * 60 * 60 * 1000;

// Buckets closer together than this (the 1m/5m/15m ranges' 5-30s steps) would
// repeat the same hour:minute label, so they get seconds too.
const SECOND_GRANULARITY_THRESHOLD_MS = 60 * 1000;

type AxisLabelFormatter = (timestamp: string) => string;

const formatSecondsLabel: AxisLabelFormatter = (timestamp) =>
  formatTimeLabel(timestamp, { seconds: true });

/**
 * Determine whether X-axis tick labels need a date, a clock time, or a clock
 * time with seconds, based on the *actual* gap between fetched bucket
 * timestamps rather than the selected range's name.
 *
 * This matters because backend bucketing for 'custom' ranges is duration-
 * adaptive (packages/backend/src/routes/management/usage.ts): a short
 * same-day custom range buckets sub-hourly (needs a time label, like
 * 'hour'/'day'), while a long multi-week custom range buckets daily or
 * coarser (needs a date label, like 'week'/'month'). Branching on the range
 * name alone can't distinguish these two custom-range shapes.
 *
 * The series is sparse (buckets without traffic are omitted), so the step is
 * read from the closest pair of buckets; with fewer than two buckets the
 * requested window's span stands in for it.
 */
export function pickAxisLabelFormatter(
  series: { bucketStartMs: number }[],
  startDate?: string,
  endDate?: string
): AxisLabelFormatter {
  let gapMs: number | null = null;

  if (series.length >= 2) {
    gapMs = Infinity;
    for (let i = 1; i < series.length; i++) {
      gapMs = Math.min(gapMs, series[i].bucketStartMs - series[i - 1].bucketStartMs);
    }
  } else if (startDate && endDate) {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    if (!isNaN(start) && !isNaN(end)) gapMs = end - start;
  }

  if (gapMs === null) return formatTimeLabel;
  if (gapMs >= DAY_GRANULARITY_THRESHOLD_MS) return formatDateLabel;
  if (gapMs < SECOND_GRANULARITY_THRESHOLD_MS) return formatSecondsLabel;
  return formatTimeLabel;
}

/**
 * Dual-axis area chart: requests + errors on the left axis, tokens on the
 * right. Ported from LiveTab's 'timeline' case, re-pointed at the
 * range-driven `useUsageSummary` series instead of the bounded live-window
 * `useLiveLogs` data (a deliberate trade of live-tailing resolution for one
 * consistent range-driven data source across the dashboard).
 */
export const TimelineChart: React.FC<TimelineChartProps> = ({
  series,
  loading,
  startDate,
  endDate,
}) => {
  const chartData = useMemo(() => {
    const points = series ?? [];
    const formatAxisLabel = pickAxisLabelFormatter(points, startDate, endDate);

    return points.map((point) => ({
      time: formatAxisLabel(String(point.bucketStartMs)),
      requests: point.requests,
      errors: point.errors,
      tokens: point.tokens,
    }));
  }, [series, startDate, endDate]);

  return (
    <Card title="Timeline">
      {loading ? (
        <div className="h-48 sm:h-56 flex items-center justify-center text-foreground-muted">
          Loading...
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-48 sm:h-56 flex items-center justify-center text-foreground-muted">
          No requests in the selected range
        </div>
      ) : (
        <div className="h-48 sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="liveRequests" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.2} />
                </linearGradient>
                <linearGradient id="liveTokens" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="time"
                stroke="var(--foreground-subtle)"
                tick={{ fill: 'var(--foreground-subtle)', fontSize: 11 }}
              />
              <YAxis
                yAxisId="left"
                stroke="var(--foreground-subtle)"
                tick={{ fill: 'var(--foreground-subtle)', fontSize: 11 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="var(--foreground-subtle)"
                tick={{ fill: 'var(--foreground-subtle)', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'var(--foreground)' }}
                formatter={(value, name) => {
                  if (name === 'tokens') {
                    return [formatTokens(Number(value || 0)), 'Tokens'];
                  }

                  return [
                    formatNumber(Number(value || 0), 0),
                    name === 'requests' ? 'Requests' : 'Errors',
                  ];
                }}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="requests"
                stroke="var(--chart-1)"
                fillOpacity={1}
                fill="url(#liveRequests)"
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="errors"
                stroke="var(--danger-text)"
                fillOpacity={0.15}
                fill="var(--danger-text)"
                strokeWidth={1.5}
                isAnimationActive={false}
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="tokens"
                stroke="var(--chart-3)"
                fillOpacity={1}
                fill="url(#liveTokens)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

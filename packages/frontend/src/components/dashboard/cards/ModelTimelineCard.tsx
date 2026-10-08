/**
 * @file ModelTimelineCard.tsx
 *
 * Static card rendering a ComposedChart of model-stacked request bars with
 * avg TTFT and avg TPS lines. One of two cards salvaged from upstream's Live
 * Metrics tab onto AdminDashboard — see docs/DESIGN_MIGRATION.md. The
 * upstream "Analyze" deep-link into Detailed Usage was dropped along with
 * that page.
 */

import React from 'react';
import { Clock } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '../../ui/Card';
import { formatMs, formatNumber, formatTPS } from '../../../lib/format';
import type { ModelTimelineBucket, ModelTimelineSeries } from '../liveTypes';
import { useScaledPx } from '../../../hooks/useScaledPx';

export interface ModelTimelineCardProps {
  loading: boolean;
  modelTimeline: {
    series: ModelTimelineSeries[];
    seriesLabelMap: Map<string, string>;
    data: ModelTimelineBucket[];
  };
  liveWindowMinutes: number;
}

export const ModelTimelineCard: React.FC<ModelTimelineCardProps> = ({
  loading,
  modelTimeline,
  liveWindowMinutes,
}) => {
  const yAxisWidth = useScaledPx(60);
  return (
    <Card
      title="Model Stack"
      className="min-w-0"
      extra={<Clock size="1rem" className="text-primary-text" />}
    >
      {loading ? (
        <div className="h-48 sm:h-56 flex items-center justify-center text-foreground-muted">
          Loading...
        </div>
      ) : modelTimeline.series.length === 0 ? (
        <div className="h-48 sm:h-56 flex items-center justify-center text-foreground-muted">
          No model stack data in the last {liveWindowMinutes} minutes
        </div>
      ) : (
        <div className="h-48 sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={modelTimeline.data}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="time"
                stroke="var(--foreground-subtle)"
                tick={{ fill: 'var(--foreground-subtle)', fontSize: '0.6875rem' }}
              />
              <YAxis
                width={yAxisWidth}
                yAxisId="left"
                stroke="var(--foreground-subtle)"
                tick={{ fill: 'var(--foreground-subtle)', fontSize: '0.6875rem' }}
                allowDecimals={false}
              />
              <YAxis
                width={yAxisWidth}
                yAxisId="right"
                orientation="right"
                stroke="var(--foreground-subtle)"
                tick={{ fill: 'var(--foreground-subtle)', fontSize: '0.6875rem' }}
                tickFormatter={(value) => formatNumber(Number(value || 0), 1)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'min(var(--theme-radius-field), 0.5rem)',
                }}
                labelStyle={{ color: 'var(--foreground)' }}
                formatter={(value, name) => {
                  const numeric = Number(value || 0);
                  const label = modelTimeline.seriesLabelMap.get(String(name));
                  if (label) {
                    return [formatNumber(numeric, 0), label];
                  }

                  if (name === 'avgTtftMs') {
                    return [formatMs(numeric), 'Avg TTFT'];
                  }

                  if (name === 'avgTps') {
                    return [formatTPS(numeric), 'Avg TPS'];
                  }

                  return [formatNumber(numeric, 0), String(name)];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '0.6875rem' }}
                formatter={(value) => (
                  <span style={{ color: 'var(--foreground-muted)' }}>
                    {modelTimeline.seriesLabelMap.get(String(value)) || value}
                  </span>
                )}
              />
              {modelTimeline.series.map((series) => (
                <Bar
                  key={series.key}
                  yAxisId="left"
                  stackId="model-stack"
                  dataKey={series.key}
                  fill={series.color}
                />
              ))}
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="avgTtftMs"
                stroke="var(--warning-text)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="avgTps"
                stroke="var(--success-text)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

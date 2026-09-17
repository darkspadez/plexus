/**
 * @file ModelTimelineCard.tsx
 *
 * Draggable card rendering a ComposedChart of model-stacked request bars
 * with avg TTFT and avg TPS lines. One of two cards salvaged from upstream's
 * Live Metrics tab onto AdminDashboard as a drill-in — see
 * docs/DESIGN_MIGRATION.md. The upstream "Analyze" deep-link into Detailed
 * Usage was dropped along with that page; clicking the card opens
 * ModelTimelineModal instead.
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
import { SortableCard } from '../../ui/SortableCard';
import { formatMs, formatNumber, formatTPS } from '../../../lib/format';
import type { ModelTimelineBucket, ModelTimelineSeries } from '../liveTypes';

export interface ModelTimelineCardProps {
  index: number;
  isOverlay?: boolean;
  onClick?: () => void;
  loading: boolean;
  modelTimeline: {
    series: ModelTimelineSeries[];
    seriesLabelMap: Map<string, string>;
    data: ModelTimelineBucket[];
  };
  liveWindowMinutes: number;
}

export const ModelTimelineCard: React.FC<ModelTimelineCardProps> = ({
  index,
  isOverlay = false,
  onClick,
  loading,
  modelTimeline,
  liveWindowMinutes,
}) => {
  return (
    <SortableCard
      key="sortable-modelstack"
      card={{
        id: 'modelstack',
        title: 'Model Stack',
        extra: <Clock size={16} className="text-accent" />,
        onClick,
        style: { cursor: 'pointer' },
        className: 'min-w-0 hover:shadow-lg hover:border-accent/30 transition-all',
        content: loading ? (
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
                  tick={{ fill: 'var(--foreground-subtle)', fontSize: 11 }}
                />
                <YAxis
                  yAxisId="left"
                  stroke="var(--foreground-subtle)"
                  tick={{ fill: 'var(--foreground-subtle)', fontSize: 11 }}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="var(--foreground-subtle)"
                  tick={{ fill: 'var(--foreground-subtle)', fontSize: 11 }}
                  tickFormatter={(value) => formatNumber(Number(value || 0), 1)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--surface-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
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
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) => modelTimeline.seriesLabelMap.get(String(value)) || value}
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
                  stroke="var(--warning)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avgTps"
                  stroke="var(--success)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ),
      }}
      index={index}
      isOverlay={isOverlay}
    />
  );
};

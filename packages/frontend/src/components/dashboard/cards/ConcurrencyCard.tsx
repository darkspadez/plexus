/**
 * @file ConcurrencyCard.tsx
 *
 * Draggable card rendering active in-flight request counts per provider,
 * with an AreaChart of concurrency history. One of two cards salvaged from
 * upstream's Live Metrics tab onto AdminDashboard as a drill-in — see
 * docs/DESIGN_MIGRATION.md. The upstream "Analyze" deep-link into Detailed
 * Usage was dropped along with that page; clicking the card opens
 * ConcurrencyModal instead.
 */

import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SortableCard } from '../../ui/SortableCard';
import { formatNumber } from '../../../lib/format';
import { chartColor } from '../../../lib/chartPalette';

export interface ConcurrencyCardProps {
  index: number;
  isOverlay?: boolean;
  onClick?: () => void;
  concurrencyLoading: boolean;
  concurrencyHistory: Record<string, unknown>[];
  totalConcurrentRequests: number;
  concurrencyProviders: string[];
}

export const ConcurrencyCard: React.FC<ConcurrencyCardProps> = ({
  index,
  isOverlay = false,
  onClick,
  concurrencyLoading,
  concurrencyHistory,
  totalConcurrentRequests,
  concurrencyProviders,
}) => {
  return (
    <SortableCard
      key="sortable-concurrency"
      card={{
        id: 'concurrency',
        title: 'Concurrency',
        extra: (
          <span className="text-xs text-foreground-muted">
            <span className="sm:hidden">10s</span>
            <span className="hidden sm:inline">Auto-refresh: 10s</span>
          </span>
        ),
        onClick,
        style: { cursor: 'pointer' },
        className: 'hover:shadow-lg hover:border-accent/30 transition-all',
        content:
          concurrencyLoading && concurrencyHistory.length === 0 ? (
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
                <span className="text-xs text-foreground-muted">In-Flight by Provider</span>
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
                      stroke={chartColor(idx + 1)}
                      fill={chartColor(idx + 1)}
                      fillOpacity={0.6}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ),
      }}
      index={index}
      isOverlay={isOverlay}
    />
  );
};

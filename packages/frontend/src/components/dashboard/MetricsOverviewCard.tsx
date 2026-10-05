import React from 'react';
import { Card } from '../ui/Card';
import { DeltaChip } from '../chips';

export interface MetricDelta {
  /** Signed change vs the prior window (relative % or percentage points). */
  value: number;
  /** For metrics where lower is better (errors, latency, cost) — up renders as danger. */
  inverse?: boolean;
  /** Magnitude formatter; the chip icon carries direction. */
  format?: (n: number) => string;
}

export interface MetricItem {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  delta?: MetricDelta;
}

interface MetricsOverviewCardProps {
  metrics: MetricItem[];
  title?: string;
}

export const MetricsOverviewCard: React.FC<MetricsOverviewCardProps> = ({
  metrics,
  title = 'Key Metrics',
}) => {
  return (
    <Card title={title}>
      {/* Capped at 4 columns so 8 tiles hold a stable 2×4 on desktop instead
          of auto-fit's width-dependent wrapping (8×1 on ultrawide, 5+3 splits).
          Columns follow the card's own width (container query, rem-based) so a
          larger UI scale drops to 2 columns rather than overflowing the tiles. */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @[50rem]:grid-cols-4">
          {metrics.map((metric, index) => (
            <div
              key={index}
              className="glass-bg rounded-lg p-4 h-full flex flex-col gap-1 transition-all duration-300"
            >
              <div className="flex justify-between items-center gap-2">
                <span className="min-w-0 font-sans text-xs font-semibold text-foreground-subtle uppercase tracking-wider">
                  {metric.label}
                </span>
                <div className="w-8 h-8 rounded-sm flex items-center justify-center bg-surface-elevated text-primary-text">
                  {metric.icon}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 my-1 min-w-0">
                <span className="whitespace-nowrap font-sans text-3xl font-bold text-foreground">
                  {metric.value}
                </span>
                {metric.delta && (
                  <DeltaChip
                    value={metric.delta.value}
                    inverse={metric.delta.inverse}
                    format={metric.delta.format}
                  />
                )}
              </div>
              {/* Always rendered so every tile shares one height and the values
                line up across rows, whether or not a tile has a subtitle. */}
              <div className="min-h-4 text-xs text-foreground-subtle">{metric.subtitle}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

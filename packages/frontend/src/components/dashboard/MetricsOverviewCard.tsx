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
          of auto-fit's width-dependent wrapping (8×1 on ultrawide, 5+3 splits). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metrics.map((metric, index) => (
          <div
            key={index}
            className="glass-bg rounded-lg p-4 flex flex-col gap-1 transition-all duration-300"
          >
            <div className="flex justify-between items-start">
              <span className="font-sans text-xs font-semibold text-foreground-subtle uppercase tracking-wider">
                {metric.label}
              </span>
              <div className="w-8 h-8 rounded-sm flex items-center justify-center bg-surface-elevated text-accent">
                {metric.icon}
              </div>
            </div>
            <div className="flex items-baseline gap-2 my-1">
              <span className="font-sans text-3xl font-bold text-foreground">{metric.value}</span>
              {metric.delta && (
                <DeltaChip
                  value={metric.delta.value}
                  inverse={metric.delta.inverse}
                  format={metric.delta.format}
                />
              )}
            </div>
            {metric.subtitle && (
              <div className="text-xs text-foreground-subtle">{metric.subtitle}</div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};

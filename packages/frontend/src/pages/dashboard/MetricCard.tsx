import React from 'react';
import { Pill } from '../../components/chips/Pill';
import { Sparkline } from '../../components/charts';

interface MetricCardProps {
  label: string;
  /** Pre-formatted big number (mono tabular). */
  value: string;
  /** Optional period pill, e.g. "24h". */
  period?: string;
  /** Sparkline data — uses --chart-1 (user accent). */
  spark?: number[];
}

export const MetricCard: React.FC<MetricCardProps> = ({ label, value, period, spark }) => (
  <div className="rounded-xl border border-border bg-surface p-4">
    <div className="flex items-start justify-between gap-2">
      <span className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
        {label}
      </span>
      {period && (
        <Pill size="sm" tone="neutral">
          {period}
        </Pill>
      )}
    </div>
    <div className="mt-2 font-mono text-2xl font-medium tabular-nums text-foreground">{value}</div>
    {spark && spark.length > 0 && (
      <div className="mt-3">
        <Sparkline data={spark} className="w-full" />
      </div>
    )}
  </div>
);

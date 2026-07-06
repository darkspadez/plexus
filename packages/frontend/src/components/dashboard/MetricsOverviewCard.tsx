import React from 'react';
import { Card } from '../ui/Card';

export interface MetricItem {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: number;
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
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-4">
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
            <div className="font-sans text-3xl font-bold text-foreground my-1">{metric.value}</div>
            {metric.subtitle && (
              <div className="text-xs text-foreground-subtle">{metric.subtitle}</div>
            )}
            {metric.trend !== undefined && (
              <div
                className={`text-sm leading-normal ${metric.trend > 0 ? 'text-success' : 'text-danger'}`}
              >
                {metric.trend > 0 ? '+' : ''}
                {metric.trend}% from last week
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};

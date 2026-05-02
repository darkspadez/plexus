import React from 'react';
import { cn } from '../../lib/cn';

interface QuotaProgressBarProps {
  /** 0–100 utilization. */
  percent: number;
  className?: string;
}

/**
 * Quota progress bar — color thresholds per DESIGN_SYSTEM.md §12.5:
 * success < 70%, warning 70–95%, danger > 95%.
 */
export const QuotaProgressBar: React.FC<QuotaProgressBarProps> = ({ percent, className }) => {
  const clamped = Math.max(0, Math.min(100, percent));
  const color = clamped > 95 ? 'bg-danger' : clamped >= 70 ? 'bg-warning' : 'bg-success';
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'relative h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated',
        className
      )}
    >
      <div
        className={cn('h-full rounded-full transition-[width]', color)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
};

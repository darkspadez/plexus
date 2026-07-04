import React from 'react';
import { ChevronDown, ChevronUp, Minus } from 'lucide-react';
import { cn } from '../../lib/cn';

interface DeltaChipProps {
  /** Signed numeric value (positive = up). */
  value: number;
  /**
   * Inverse interpretation — for metrics where lower is better (latency, errors).
   * When true, negative deltas render as success and positive as danger.
   */
  inverse?: boolean;
  /** Format the magnitude. Defaults to one-decimal percent. */
  format?: (n: number) => string;
  className?: string;
}

const defaultFormat = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

export const DeltaChip: React.FC<DeltaChipProps> = ({
  value,
  inverse,
  format = defaultFormat,
  className,
}) => {
  const direction = value === 0 ? 'flat' : value > 0 ? 'up' : 'down';
  const isGood = direction === 'flat' ? null : inverse ? direction === 'down' : direction === 'up';
  const tone =
    isGood === null
      ? 'text-foreground-muted bg-surface-elevated'
      : isGood
        ? 'text-success bg-success-subtle'
        : 'text-danger bg-danger-subtle';

  const Icon = direction === 'flat' ? Minus : direction === 'up' ? ChevronUp : ChevronDown;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none tabular-nums',
        tone,
        className
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {format(Math.abs(value))}
    </span>
  );
};

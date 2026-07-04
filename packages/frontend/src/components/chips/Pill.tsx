import React from 'react';
import { cn } from '../../lib/cn';

export type PillTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export type PillSize = 'sm' | 'default';

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  size?: PillSize;
  asChild?: boolean;
}

const toneStyles: Record<PillTone, string> = {
  neutral: 'bg-surface-elevated text-foreground-muted',
  accent: 'bg-accent-subtle text-accent',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
};

const sizeStyles: Record<PillSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  default: 'px-2.5 py-0.5 text-xs',
};

/**
 * Tinted-fill, rounded-full chip — the design's signature secondary visual.
 * Use this for status, provider, format, model, and delta indicators.
 */
export const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  ({ className, tone = 'neutral', size = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium leading-none',
        toneStyles[tone],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  )
);
Pill.displayName = 'Pill';

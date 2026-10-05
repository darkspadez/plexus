import React from 'react';
import { cn } from '../../lib/cn';

export type PillTone =
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

export type PillSize = 'sm' | 'default';

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  size?: PillSize;
  asChild?: boolean;
}

const toneStyles: Record<PillTone, string> = {
  neutral: 'bg-neutral-subtle text-neutral-text',
  primary: 'bg-primary-subtle text-primary-text',
  secondary: 'bg-secondary-subtle text-secondary-text',
  accent: 'bg-accent-subtle text-accent-text',
  success: 'bg-success-subtle text-success-text',
  warning: 'bg-warning-subtle text-warning-text',
  danger: 'bg-danger-subtle text-danger-text',
  info: 'bg-info-subtle text-info-text',
};

const sizeStyles: Record<PillSize, string> = {
  sm: 'px-2 py-0.5 text-label',
  default: 'px-2.5 py-0.5 text-xs',
};

/**
 * Tinted-fill chip with the theme selector radius (rounded-selector) — the design's signature secondary visual.
 * Use this for status, provider, format, model, and delta indicators.
 */
export const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  ({ className, tone = 'neutral', size = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-selector font-medium leading-none',
        toneStyles[tone],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  )
);
Pill.displayName = 'Pill';

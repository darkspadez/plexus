import React from 'react';
import { cn } from '../../lib/cn';
import { type Status, statusTone, type StatusTone } from '../../lib/status-vocab';

interface StatusDotProps {
  status: Status;
  /** Render the label text after the dot. Default true. */
  label?: boolean;
  className?: string;
}

const dotColorByTone: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-foreground-subtle',
};

/**
 * Dot + label preferred for table rows. The dot is colored by status tone; the
 * label uses normal foreground weight 500 — readable independent of color.
 */
export const StatusDot: React.FC<StatusDotProps> = ({ status, label = true, className }) => {
  const tone = statusTone(status);
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden
        className={cn('inline-block size-2 shrink-0 rounded-full', dotColorByTone[tone])}
      />
      {label && <span className="text-sm font-medium text-foreground">{status}</span>}
    </span>
  );
};

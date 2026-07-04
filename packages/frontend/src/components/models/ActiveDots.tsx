import React from 'react';
import { cn } from '../../lib/cn';

/** Per-target health state shown as a colored dot in the Models ACTIVE column. */
export type DotState = 'active' | 'cooldown' | 'disabled';

interface ActiveDotsProps {
  /** One state per target (flattened across all target groups). */
  states: DotState[];
  className?: string;
}

/**
 * ActiveDots — a row of small dots (green = active, red = cooldown, gray =
 * disabled) followed by an "X/Y active" count. Mirrors the old design's
 * ACTIVE column indicator.
 */
export const ActiveDots: React.FC<ActiveDotsProps> = ({ states, className }) => {
  if (states.length === 0) {
    return <span className="text-xs text-foreground-subtle">no targets</span>;
  }
  const enabled = states.filter((s) => s !== 'disabled').length;
  return (
    <div className={cn('inline-flex items-center gap-2 text-[11px]', className)}>
      <div className="flex items-center gap-1">
        {states.map((s, i) => (
          <span
            key={i}
            className={cn(
              'inline-block size-1.5 rounded-full',
              s === 'active' && 'bg-success',
              s === 'cooldown' && 'bg-danger',
              s === 'disabled' && 'bg-border'
            )}
          />
        ))}
      </div>
      <span className="font-medium tabular-nums text-foreground-muted">
        {enabled}/{states.length} active
      </span>
    </div>
  );
};

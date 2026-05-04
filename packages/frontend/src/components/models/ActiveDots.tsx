// packages/frontend/src/components/models/ActiveDots.tsx
import React from 'react';
import { cn } from '../../lib/cn';

export type DotState = 'active' | 'cooldown' | 'disabled';

interface ActiveDotsProps {
  states: DotState[];
  className?: string;
}

export const ActiveDots: React.FC<ActiveDotsProps> = ({ states, className }) => {
  if (states.length === 0) {
    return <span className="text-xs text-foreground-subtle">no targets</span>;
  }
  const enabled = states.filter((s) => s !== 'disabled').length;
  return (
    <div
      className={cn('inline-flex items-center gap-2 text-[11px] text-foreground-muted', className)}
    >
      <div className="flex items-center gap-1" aria-label={`${enabled} of ${states.length} active`}>
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
      <span className="font-medium tabular-nums">
        {enabled}/{states.length} active
      </span>
    </div>
  );
};

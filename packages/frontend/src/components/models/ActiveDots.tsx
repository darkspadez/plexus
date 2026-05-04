// packages/frontend/src/components/models/ActiveDots.tsx
import React from 'react';
import { cn } from '../../lib/cn';

interface ActiveDotsProps {
  total: number;
  active: number;
  className?: string;
}

export const ActiveDots: React.FC<ActiveDotsProps> = ({ total, active, className }) => {
  if (total === 0) {
    return <span className="text-xs text-foreground-subtle">no targets</span>;
  }
  return (
    <div
      className={cn(
        'flex w-full items-center justify-between gap-3 text-[11px] text-foreground-muted',
        className
      )}
    >
      <div className="flex items-center gap-1" aria-label={`${active} of ${total} active`}>
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'inline-block size-1.5 rounded-full',
              i < active ? 'bg-success' : 'bg-border'
            )}
          />
        ))}
      </div>
      <span className="font-medium tabular-nums">
        {active}/{total} active
      </span>
    </div>
  );
};

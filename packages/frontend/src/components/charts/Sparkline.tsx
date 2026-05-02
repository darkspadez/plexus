import React from 'react';
import { cn } from '../../lib/cn';

interface SparklineProps {
  data: number[];
  /** Total height of the sparkline. Width is fluid. */
  height?: number;
  /** Gap between bars in px. */
  gap?: number;
  className?: string;
}

/**
 * Capsule-bar sparkline used on dashboard metric cards (DESIGN_SYSTEM.md §12.1).
 * Each bar is fully rounded; color is the user accent (--chart-1).
 */
export const Sparkline: React.FC<SparklineProps> = ({ data, height = 32, gap = 2, className }) => {
  const max = Math.max(1, ...data);
  return (
    <div
      className={cn('flex items-end', className)}
      style={{ height, gap }}
      role="img"
      aria-label="trend sparkline"
    >
      {data.map((v, i) => {
        const ratio = Math.max(0.08, v / max);
        return (
          <span
            key={i}
            className="block flex-1 rounded-full"
            style={{
              height: `${ratio * 100}%`,
              backgroundColor: 'var(--chart-1)',
              minHeight: 2,
            }}
          />
        );
      })}
    </div>
  );
};

import React from 'react';
import { cn } from '../../lib/cn';

interface ModelChipProps {
  model: string;
  className?: string;
}

/** Neutral monospace chip for model names. See DESIGN_SYSTEM.md §7.5. */
export const ModelChip: React.FC<ModelChipProps> = ({ model, className }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full bg-surface-elevated px-2.5 py-0.5 font-mono text-label font-medium text-foreground',
      className
    )}
  >
    {model}
  </span>
);

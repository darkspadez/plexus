import React from 'react';
import { cn } from '../../lib/cn';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** @deprecated Use `variant="dense"` instead. */
  dense?: boolean;
  variant?: 'default' | 'dense' | 'fill';
}

/**
 * `default` — standard empty-state padding for full sections/pages.
 * `dense` — compact padding for tighter contexts (tables, cards).
 * `fill` — fills a fixed-height container (e.g. charts/lists) with smaller type and a ~24px icon.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
  dense,
  variant,
}) => {
  const resolvedVariant = variant ?? (dense === true ? 'dense' : 'default');
  const isFill = resolvedVariant === 'fill';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        resolvedVariant === 'dense' && 'py-8 px-4',
        resolvedVariant === 'default' && 'py-12 sm:py-16 px-6',
        isFill && 'h-full min-h-0 py-4 px-4',
        className
      )}
    >
      {icon && (
        <div
          className={cn(
            'mb-4 text-foreground-muted',
            isFill
              ? '[&>svg]:h-6 [&>svg]:w-6'
              : '[&>svg]:h-10 [&>svg]:w-10 [&>svg]:sm:h-12 [&>svg]:sm:w-12'
          )}
        >
          {icon}
        </div>
      )}
      <h3
        className={
          isFill
            ? 'font-sans text-sm font-medium text-foreground-muted m-0'
            : 'font-sans text-base font-medium text-foreground m-0'
        }
      >
        {title}
      </h3>
      {description && (
        <p
          className={
            isFill
              ? 'mt-1 max-w-md font-sans text-xs text-foreground-muted'
              : 'mt-2 max-w-md font-sans text-sm text-foreground-muted'
          }
        >
          {description}
        </p>
      )}
      {action && <div className={isFill ? 'mt-3' : 'mt-6'}>{action}</div>}
    </div>
  );
};

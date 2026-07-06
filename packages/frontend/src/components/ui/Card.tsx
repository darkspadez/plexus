import React from 'react';
import { clsx } from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  extra?: React.ReactNode;
  /** Use a minimal variant with less padding. */
  dense?: boolean;
  /** Remove default body padding so caller can control layout. */
  flush?: boolean;
}

export const Card: React.FC<CardProps> = ({
  title,
  extra,
  children,
  className,
  dense,
  flush,
  ...props
}) => {
  return (
    <div
      className={clsx(
        'bg-surface border border-border rounded-lg overflow-hidden transition-colors duration-150 max-w-full',
        className
      )}
      {...props}
    >
      {(title || extra) && (
        <div
          className={clsx(
            // flex-wrap so a long `extra` (e.g. "Analyze Concurrency" + auto-refresh
            // status) drops to its own line on narrow viewports instead of
            // overflowing the card.
            // h-11 + py-2 matches DataTable's <thead> row height (also h-11)
            // exactly, so Card headers line up with table headers on pages like
            // Requests. items-center handles the common single-line case; min-h
            // (not a fixed height) lets the row grow past 44px only when `extra`
            // genuinely wraps to a second line on narrow viewports.
            'flex items-start justify-between gap-2 sm:gap-3 flex-wrap border-b border-border bg-surface-elevated/50 sm:items-center min-h-11 py-2',
            dense ? 'px-3 sm:px-4' : 'px-3 sm:px-5'
          )}
        >
          {title && (
            <h3 className="font-sans text-[10px] font-medium uppercase tracking-wider text-foreground-muted m-0 truncate min-w-0 leading-none">
              {title}
            </h3>
          )}
          {extra && (
            <div className="min-w-0 max-w-full flex flex-wrap items-center justify-start gap-2 sm:justify-end">
              {extra}
            </div>
          )}
        </div>
      )}
      {!flush && (
        <div className={clsx('max-w-full', dense ? 'p-3 sm:p-4' : 'p-3 sm:p-5')}>{children}</div>
      )}
      {flush && <div className="max-w-full">{children}</div>}
    </div>
  );
};

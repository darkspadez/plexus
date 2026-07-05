import React from 'react';
import { clsx } from 'clsx';

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Render below the title/actions row (filters, tabs, etc.). */
  children?: React.ReactNode;
  className?: string;
  /** Sticky to top of scroll container with glass background. Defaults to true. */
  sticky?: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  children,
  className,
  sticky = true,
}) => {
  return (
    <div
      className={clsx(
        'px-3 py-3 sm:px-6 sm:py-4 lg:px-8',
        // Mobile: AppBar is h-12 sticky at top-0, so PageHeader must start at top-12.
        // Desktop (md+): TopBar is also h-12 sticky at top-0, so PageHeader must
        // remain at top-12 on desktop too (it sits inside the content column which
        // is already offset right of the sidebar, but not below the TopBar).
        sticky && 'sticky top-12 z-20 bg-background',
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-sans text-lg sm:text-2xl font-semibold tracking-tight text-foreground m-0 leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] sm:text-xs text-foreground-muted mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
};

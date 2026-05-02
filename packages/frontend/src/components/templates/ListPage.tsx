import React from 'react';
import { cn } from '../../lib/cn';
import { PageShell } from '../layout/PageShell';

interface ListPageProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional sticky filter bar — placed above the table per DESIGN_SYSTEM.md §7.3. */
  filters?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const ListPage: React.FC<ListPageProps> = ({
  title,
  subtitle,
  actions,
  filters,
  children,
  className,
}) => (
  <PageShell className={className}>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
    {filters && (
      <div
        className={cn(
          'mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2'
        )}
      >
        {filters}
      </div>
    )}
    <div>{children}</div>
  </PageShell>
);

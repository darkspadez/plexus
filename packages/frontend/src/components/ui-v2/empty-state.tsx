import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  children,
  className,
}) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface px-6 py-16 text-center',
      className
    )}
  >
    <Icon className="size-6 text-foreground-subtle" strokeWidth={1.5} />
    <h2 className="text-base font-medium text-foreground">{title}</h2>
    {description && <p className="max-w-sm text-sm text-foreground-muted">{description}</p>}
    {children && <div className="mt-2 flex items-center gap-2">{children}</div>}
  </div>
);

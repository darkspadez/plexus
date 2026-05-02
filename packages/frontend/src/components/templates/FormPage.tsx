import React from 'react';
import { PageShell } from '../layout/PageShell';

interface FormPageProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const FormPage: React.FC<FormPageProps> = ({
  title,
  subtitle,
  actions,
  children,
  className,
}) => (
  <PageShell className={className}>
    <div className="mx-auto max-w-[640px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  </PageShell>
);

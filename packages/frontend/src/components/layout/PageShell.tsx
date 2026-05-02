import React from 'react';
import { cn } from '../../lib/cn';

interface PageShellProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps a page's content area with the standard padding rhythm. Page templates
 * (List/Dashboard/Detail/Form) compose this so spacing is identical across views.
 */
export const PageShell: React.FC<PageShellProps> = ({ children, className }) => (
  <div className={cn('px-6 py-6 lg:px-8 lg:py-8', className)}>{children}</div>
);

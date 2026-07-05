import React from 'react';
import { cn } from '../../lib/cn';

interface PageContainerProps {
  children: React.ReactNode;
  /** Constrain content width. Defaults to full. */
  width?: 'narrow' | 'standard' | 'wide' | 'full';
  className?: string;
}

const widthClasses: Record<NonNullable<PageContainerProps['width']>, string> = {
  narrow: 'max-w-3xl',
  standard: 'max-w-5xl',
  wide: 'max-w-7xl',
  full: 'max-w-none',
};

export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  width = 'full',
  className,
}) => {
  return (
    <div
      className={cn(
        'mx-auto w-full min-w-0 p-3 pt-1 sm:p-6 sm:pt-2 lg:p-8 lg:pt-2',
        widthClasses[width],
        className
      )}
    >
      {children}
    </div>
  );
};

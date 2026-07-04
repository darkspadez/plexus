import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

interface DisclosureProps {
  title: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const Disclosure: React.FC<DisclosureProps> = ({
  title,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  extra,
  children,
  className,
}) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const toggle = () => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className={cn('border border-border rounded-lg bg-surface overflow-hidden', className)}>
      <div className="flex flex-wrap items-center">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex-1 basis-52 min-w-0 flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        >
          <ChevronRight
            size={14}
            className={cn(
              'text-foreground-muted flex-shrink-0 transition-transform duration-150',
              open && 'rotate-90'
            )}
          />
          <span className="flex-1 min-w-0 font-sans text-sm font-medium text-foreground">
            {title}
          </span>
        </button>
        {extra && (
          <div
            className="ml-auto flex flex-shrink-0 flex-wrap items-center gap-2 px-4 py-2 sm:py-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            {extra}
          </div>
        )}
      </div>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-border animate-[fadeIn_0.15s_ease]">
          {children}
        </div>
      )}
    </div>
  );
};

import * as React from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

export type SectionProps = {
  title: React.ReactNode;
  info?: React.ReactNode;
  rightSlot?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  size?: 'sm' | 'md';
  bodyClassName?: string;
  bodyStyle?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
};

const Section = React.forwardRef<HTMLDivElement, SectionProps>(
  (
    {
      title,
      info,
      rightSlot,
      collapsible = false,
      defaultOpen = true,
      open,
      onOpenChange,
      size = 'sm',
      bodyClassName,
      bodyStyle,
      className,
      children,
    },
    ref
  ) => {
    const isControlled = open !== undefined;
    const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
    const isOpen = isControlled ? open : internalOpen;

    const toggle = React.useCallback(() => {
      if (!collapsible) return;
      if (isControlled) {
        onOpenChange?.(!isOpen);
      } else {
        setInternalOpen((v) => {
          const next = !v;
          onOpenChange?.(next);
          return next;
        });
      }
    }, [collapsible, isControlled, isOpen, onOpenChange]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!collapsible) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    };

    const headerPadding = size === 'md' ? 'px-3 py-2' : 'p-2 px-3';

    return (
      <div ref={ref} className={cn('border border-border rounded-md overflow-hidden', className)}>
        <div
          className={cn(
            headerPadding,
            'flex items-center gap-2 bg-surface-elevated select-none',
            collapsible && 'cursor-pointer transition-colors duration-200 hover:bg-surface-elevated'
          )}
          onClick={collapsible ? toggle : undefined}
          role={collapsible ? 'button' : undefined}
          tabIndex={collapsible ? 0 : undefined}
          onKeyDown={collapsible ? handleKeyDown : undefined}
          aria-expanded={collapsible ? isOpen : undefined}
        >
          {collapsible && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
          <span
            className="text-[13px] font-medium text-foreground"
            style={{ flex: 1, minWidth: 0 }}
          >
            {title}
          </span>
          {info && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="text-foreground-muted hover:text-foreground inline-flex items-center"
                    aria-label="More information"
                  >
                    <Info size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[360px]">
                  {info}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {rightSlot && (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {rightSlot}
            </div>
          )}
        </div>
        {(!collapsible || isOpen) && (
          <div
            className={bodyClassName}
            style={{
              borderTop: '1px solid var(--border)',
              padding: '12px',
              background: 'var(--background)',
              ...bodyStyle,
            }}
          >
            {children}
          </div>
        )}
      </div>
    );
  }
);
Section.displayName = 'Section';

export { Section };

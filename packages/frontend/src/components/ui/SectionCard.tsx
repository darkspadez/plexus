import React, { useState } from 'react';
import { ChevronRight, Info } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Tooltip } from './Tooltip';

interface SectionCardProps {
  title: React.ReactNode;
  /**
   * Renders a keyboard-focusable Info icon button (wrapped in `Tooltip`) in the
   * header, after the title. Sits in a sibling cell outside the toggle button so
   * focusing/clicking it never collapses the section.
   */
  info?: React.ReactNode;
  /** Right-aligned slot, rendered in a sibling cell so clicks never toggle the section. */
  extra?: React.ReactNode;
  /** When false (default), the header is a plain div — no button semantics, no chevron, body always shown. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  size?: 'md' | 'sm';
  /** Body without the default `p-3` padding. */
  flush?: boolean;
  bodyClassName?: string;
  className?: string;
  id?: string;
  children: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  info,
  extra,
  collapsible = false,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  size = 'md',
  flush,
  bodyClassName,
  className,
  id,
  children,
}) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const toggle = () => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const showBody = collapsible ? open : true;

  const headerPadding = size === 'sm' ? 'px-3 py-2' : 'px-3 py-2.5 min-h-[44px]';
  const cellPadding = size === 'sm' ? 'px-3 py-2' : 'px-3 py-2 sm:py-2.5';

  const titleContent = (
    <>
      {collapsible && (
        <ChevronRight
          size={14}
          className={cn(
            'text-foreground-muted flex-shrink-0 transition-transform duration-150',
            open && 'rotate-90'
          )}
        />
      )}
      <span className="flex-1 min-w-0 font-sans text-[13px] font-medium text-foreground">
        {title}
      </span>
    </>
  );

  return (
    <div
      id={id}
      className={cn(
        'border border-border rounded-lg bg-surface overflow-hidden scroll-mt-14',
        className
      )}
    >
      <div className="flex flex-wrap items-center bg-surface-elevated/50">
        {collapsible ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className={cn(
              'flex-1 basis-52 min-w-0 flex items-center gap-2 text-left transition-colors duration-150 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
              headerPadding
            )}
          >
            {titleContent}
          </button>
        ) : (
          <div className={cn('flex-1 basis-52 min-w-0 flex items-center gap-2', headerPadding)}>
            {titleContent}
          </div>
        )}
        {info && (
          <div
            className="flex flex-shrink-0 items-center pr-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip content={info}>
              <button
                type="button"
                aria-label="More information"
                className="flex items-center justify-center rounded p-1 text-foreground-muted transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Info size={14} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        )}
        {extra && (
          <div
            className={cn('ml-auto flex flex-shrink-0 flex-wrap items-center gap-2', cellPadding)}
            onClick={(e) => e.stopPropagation()}
          >
            {extra}
          </div>
        )}
      </div>
      {showBody && (
        <div className={cn('border-t border-border', flush ? 'p-0' : 'p-3', bodyClassName)}>
          {children}
        </div>
      )}
    </div>
  );
};

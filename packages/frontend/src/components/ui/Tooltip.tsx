import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'bottom' | 'right' | 'top' | 'left';
}

const GAP = 8;
const VIEWPORT_MARGIN = 8;

/**
 * Renders its panel into a `document.body` portal (not inline) so it can
 * never be clipped by an ancestor's `overflow-hidden` — every `Card` sets
 * that on its outer wrapper, which silently truncated tooltips anchored
 * near a card edge before this used a portal. Position is computed from
 * the trigger's real screen coordinates and clamped to stay on-screen.
 */
export const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'bottom' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isVisible) return;
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let top = 0;
    let left = 0;

    switch (position) {
      case 'right':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.right + GAP;
        break;
      case 'left':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.left - tooltipRect.width - GAP;
        break;
      case 'top':
        top = triggerRect.top - tooltipRect.height - GAP;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        break;
      case 'bottom':
      default:
        top = triggerRect.bottom + GAP;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        break;
    }

    // Clamp so the panel never overflows off-screen, regardless of where
    // the trigger sits (e.g. near a viewport edge).
    left = Math.min(
      Math.max(left, VIEWPORT_MARGIN),
      window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN
    );
    top = Math.min(
      Math.max(top, VIEWPORT_MARGIN),
      window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN
    );

    setStyle({ position: 'fixed', top, left });
  }, [isVisible, position]);

  return (
    <div
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            style={style}
            className="z-[500] px-2.5 py-1.5 bg-surface-elevated border border-border rounded-md shadow-md max-w-xs text-xs text-foreground pointer-events-none font-sans"
          >
            {content}
          </div>,
          document.body
        )}
    </div>
  );
};

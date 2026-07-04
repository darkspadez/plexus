import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: 'left' | 'right';
  children: React.ReactNode;
  className?: string;
  /**
   * Controls the max-width of a right-side drawer on desktop (sm: breakpoint).
   * - 'nav'  (default) — 560px cap, used for the mobile navigation drawer.
   * - 'md'   — ~640px on desktop, full-width on mobile; used for medium sheet panels.
   * - 'lg'   — ~840px on desktop, full-width on mobile; used for large sheet panels.
   * Has no effect when side="left".
   */
  width?: 'nav' | 'md' | 'lg';
  /**
   * Override the z-index tier.
   * - 'drawer' (default) — z-[300] backdrop / z-[310] panel (mobile nav use).
   * - 'modal'  — z-[400] backdrop / z-[410] panel (sheet panels from Modal).
   */
  zTier?: 'drawer' | 'modal';
  /** Aria label for the off-canvas region. */
  'aria-label'?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  open,
  onClose,
  side = 'left',
  children,
  className,
  width = 'nav',
  zTier = 'drawer',
  'aria-label': ariaLabel = 'Navigation',
}) => {
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const backdropZ = zTier === 'modal' ? 'z-[400]' : 'z-[300]';
  const panelZ = zTier === 'modal' ? 'z-[410]' : 'z-[310]';

  return createPortal(
    <div
      className={clsx('fixed inset-0', backdropZ)}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease]"
        onClick={onClose}
      />
      <div
        className={clsx(
          // Solid background — glass-bg let underlying page content (Dashboard
          // title, page tabs) bleed through the drawer when open. Backdrop blur
          // alone isn't enough on mobile browsers.
          'absolute top-0 bottom-0 flex bg-surface-elevated border-border shadow-2xl outline-none',
          panelZ,
          side === 'left' &&
            'left-0 w-[260px] max-w-[85vw] border-r animate-[drawerSlideLeft_250ms_cubic-bezier(0.22,1,0.36,1)] flex-col',
          side === 'right' && [
            'right-0 w-full border-l animate-[drawerSlideRight_250ms_cubic-bezier(0.22,1,0.36,1)] flex-col',
            width === 'nav' && 'max-w-[560px]',
            width === 'md' && 'sm:max-w-[640px]',
            width === 'lg' && 'sm:max-w-[840px]',
          ],
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

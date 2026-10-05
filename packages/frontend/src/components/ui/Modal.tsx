import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { Drawer } from './Drawer';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Small muted metadata rendered in the header row, before the close button. */
  headerMeta?: React.ReactNode;
  /** Muted second line rendered under the title (e.g. "name · id"). */
  subtitle?: React.ReactNode;
  /** Action slot rendered in the header row between the title block and the close button. */
  headerActions?: React.ReactNode;
  /** Pinned strip between the header and the scrollable body (e.g. a tab bar). */
  subHeader?: React.ReactNode;
  /** Element to focus when the dialog opens; defaults to the first control that isn't Close. */
  initialFocus?: (container: HTMLElement) => HTMLElement | null;
}

/* -------------------------------------------------------------------------- */
/* Centered dialog — size="sm" (confirmations), "xl" and "2xl" (wide)       */
/* -------------------------------------------------------------------------- */

const CENTERED_WIDTH = { sm: 'max-w-md', xl: 'max-w-3xl', '2xl': 'max-w-5xl' } as const;
// xl and 2xl are top-aligned so their position stays put while the content height changes.
const CENTERED_ALIGN = {
  sm: 'items-center',
  xl: 'items-start pt-[8vh]',
  '2xl': 'items-start pt-[8vh]',
} as const;

const CenteredDialog: React.FC<ModalProps & { size: keyof typeof CENTERED_WIDTH }> = ({
  size,
  isOpen,
  onClose,
  title,
  children,
  footer,
  headerMeta,
  subtitle,
  headerActions,
  subHeader,
  initialFocus,
}) => {
  useBodyScrollLock(isOpen);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, isOpen, { onClose, initialFocus });

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      className={`fixed inset-0 z-[420] flex ${CENTERED_ALIGN[size]} justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm outline-none animate-[fadeIn_0.2s_ease]`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`bg-surface border-(length:--theme-border-width) border-border w-full ${CENTERED_WIDTH[size]} max-h-[92vh] overflow-hidden rounded-box flex flex-col shadow-modal animate-[slideUp_0.3s_ease] sm:max-h-[90vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border-strong sm:p-5">
          <div className="min-w-0 flex-1">
            <h2 className="font-sans text-base font-medium text-foreground m-0 truncate">
              {title}
            </h2>
            {subtitle && (
              <div className="mt-0.5 text-xs text-foreground-muted truncate">{subtitle}</div>
            )}
          </div>
          {headerMeta && (
            <div className="flex-shrink-0 text-xs text-foreground-muted">{headerMeta}</div>
          )}
          {headerActions && (
            <div className="flex flex-shrink-0 items-center gap-2">{headerActions}</div>
          )}
          <button
            type="button"
            className="flex-shrink-0 bg-transparent border-0 text-foreground-muted cursor-pointer rounded-field p-1.5 transition-colors duration-150 hover:text-foreground hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={onClose}
            data-dialog-close
            aria-label="Close"
          >
            <X size="1rem" />
          </button>
        </div>
        {subHeader && <div className="flex-shrink-0 px-4 sm:px-5">{subHeader}</div>}
        <div className="p-4 overflow-y-auto flex-1 sm:p-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-border-strong sm:px-5 sm:py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

/* -------------------------------------------------------------------------- */
/* Sheet panel — used for size="md" / size="lg" (forms, lists, detail panels) */
/* Reuses the main Drawer with side="right" so all existing Drawer behaviours  */
/* (slide animation, backdrop, focus management, Escape-to-close, body scroll lock) are inherited */
/* -------------------------------------------------------------------------- */

const SheetPanel: React.FC<ModalProps & { size: 'md' | 'lg' }> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size,
  headerMeta,
  subtitle,
  headerActions,
  subHeader,
  initialFocus,
}) => {
  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      side="right"
      width={size}
      zTier="modal"
      aria-label={title}
      initialFocus={initialFocus}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-strong flex-shrink-0">
        <div className="min-w-0 flex-1">
          <h2 className="font-sans text-base font-medium text-foreground m-0 truncate">{title}</h2>
          {subtitle && (
            <div className="mt-0.5 text-xs text-foreground-muted truncate">{subtitle}</div>
          )}
        </div>
        {headerMeta && (
          <div className="flex-shrink-0 text-xs text-foreground-muted">{headerMeta}</div>
        )}
        {headerActions && (
          <div className="flex flex-shrink-0 items-center gap-2">{headerActions}</div>
        )}
        <button
          type="button"
          className="flex-shrink-0 bg-transparent border-0 text-foreground-muted cursor-pointer rounded-field p-1.5 transition-colors duration-150 hover:text-foreground hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={onClose}
          data-dialog-close
          aria-label="Close"
        >
          <X size="1rem" />
        </button>
      </div>

      {/* Pinned sub-header (e.g. tab bar) */}
      {subHeader && <div className="flex-shrink-0 px-5">{subHeader}</div>}

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-5">{children}</div>

      {/* Pinned footer */}
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4 border-t border-border-strong flex-shrink-0">
          {footer}
        </div>
      )}
    </Drawer>
  );
};

/* -------------------------------------------------------------------------- */
/* Modal router — public API unchanged; size drives which variant renders      */
/* -------------------------------------------------------------------------- */

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  headerMeta,
  subtitle,
  headerActions,
  subHeader,
  initialFocus,
}) => {
  if (size === 'sm' || size === 'xl' || size === '2xl') {
    return (
      <CenteredDialog
        size={size}
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        footer={footer}
        headerMeta={headerMeta}
        subtitle={subtitle}
        headerActions={headerActions}
        subHeader={subHeader}
        initialFocus={initialFocus}
      >
        {children}
      </CenteredDialog>
    );
  }

  return (
    <SheetPanel
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={footer}
      size={size}
      headerMeta={headerMeta}
      subtitle={subtitle}
      headerActions={headerActions}
      subHeader={subHeader}
      initialFocus={initialFocus}
    >
      {children}
    </SheetPanel>
  );
};

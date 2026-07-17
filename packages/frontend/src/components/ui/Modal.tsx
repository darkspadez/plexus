import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { Drawer } from './Drawer';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Small muted metadata rendered in the header row, before the close button. */
  headerMeta?: React.ReactNode;
}

/* -------------------------------------------------------------------------- */
/* Centered dialog — used for size="sm" (confirmations, alerts, small forms)  */
/* -------------------------------------------------------------------------- */

const CenteredDialog: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  headerMeta,
}) => {
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[420] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-surface border border-border w-full max-w-md max-h-[92vh] overflow-hidden rounded-lg flex flex-col shadow-md animate-[slideUp_0.3s_ease] sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border-strong sm:p-5">
          <h2 className="min-w-0 flex-1 font-sans text-base font-medium text-foreground m-0 truncate">
            {title}
          </h2>
          {headerMeta && (
            <div className="flex-shrink-0 text-xs text-foreground-muted">{headerMeta}</div>
          )}
          <button
            type="button"
            className="flex-shrink-0 bg-transparent border-0 text-foreground-muted cursor-pointer rounded-md p-1.5 transition-colors duration-150 hover:text-foreground hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
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
/* (slide animation, backdrop, Escape-to-close, body scroll lock) are inherited */
/* -------------------------------------------------------------------------- */

const SheetPanel: React.FC<ModalProps & { size: 'md' | 'lg' }> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size,
  headerMeta,
}) => {
  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      side="right"
      width={size}
      zTier="modal"
      aria-label={title}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-strong flex-shrink-0">
        <h2 className="min-w-0 flex-1 font-sans text-base font-medium text-foreground m-0 truncate">
          {title}
        </h2>
        {headerMeta && (
          <div className="flex-shrink-0 text-xs text-foreground-muted">{headerMeta}</div>
        )}
        <button
          type="button"
          className="flex-shrink-0 bg-transparent border-0 text-foreground-muted cursor-pointer rounded-md p-1.5 transition-colors duration-150 hover:text-foreground hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

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
}) => {
  if (size === 'sm') {
    return (
      <CenteredDialog
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        footer={footer}
        headerMeta={headerMeta}
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
    >
      {children}
    </SheetPanel>
  );
};

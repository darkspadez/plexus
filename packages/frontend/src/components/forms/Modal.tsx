/**
 * Legacy Modal shim — delegates to the shadcn ui-v2 Dialog while preserving
 * the legacy `isOpen` / `onClose` / `title` / `footer` API. The 2 remaining
 * Models + Providers consumers (alias edit and provider edit) keep working
 * unchanged. New code should compose Dialog (or Sheet for >4 fields) from
 * `components/ui-v2/dialog` directly.
 */

import React from 'react';
import { cn } from '../../lib/cn';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui-v2/dialog';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClass: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'sm:max-w-[420px]',
  md: 'sm:max-w-[640px]',
  lg: 'sm:max-w-[960px]',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}) => (
  <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
    <DialogContent
      className={cn('flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0', sizeClass[size])}
    >
      <DialogHeader className="border-b border-border px-6 py-4">
        <DialogTitle className="truncate">{title}</DialogTitle>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      {footer && (
        <DialogFooter className="border-t border-border bg-surface px-6 py-3 sm:justify-end">
          {footer}
        </DialogFooter>
      )}
    </DialogContent>
  </Dialog>
);

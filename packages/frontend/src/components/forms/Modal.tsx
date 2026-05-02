/**
 * Legacy Modal shim — delegates to either shadcn Dialog (for size="sm",
 * confirm-style modals ≤ 4 fields per §7.6) or shadcn Sheet (size md/lg,
 * the create/edit flows that the design doc says belong on a right-side
 * sheet so the rest of the page stays readable).
 *
 * The 2 remaining unmigrated consumers — the Models alias edit and the
 * Providers provider edit — both pass size="lg", so they automatically
 * render as right-side Sheets ≥ 640px wide. New code should compose
 * Dialog or Sheet from `components/ui-v2/` directly instead of using this
 * shim.
 */

import React from 'react';
import { cn } from '../../lib/cn';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui-v2/dialog';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '../ui-v2/sheet';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sheetWidthClass: Record<'md' | 'lg', string> = {
  md: 'sm:max-w-[640px]',
  lg: 'sm:max-w-[840px]',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}) => {
  // Small modals stay as centered Dialogs (confirm/alert style).
  if (size === 'sm') {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[420px]">
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
  }

  // Larger create/edit modals render as a right-side Sheet per §7.6.
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className={cn('flex w-full flex-col gap-0 p-0', sheetWidthClass[size])}
      >
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="truncate">{title}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <SheetFooter className="border-t border-border bg-surface px-6 py-3 sm:justify-end">
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};

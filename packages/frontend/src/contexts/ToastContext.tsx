/**
 * Legacy ToastContext shim — bridges the legacy `useToast()` API
 * (showToast/success/error/warning/info + confirm()) onto sonner toasts +
 * a shadcn AlertDialog. Kept so unmigrated callers (Models, Providers,
 * useModels hook) keep working unchanged. New code should import
 * `toast` from `sonner` directly and use shadcn AlertDialog inline for
 * confirmation prompts.
 */

import React from 'react';
import { toast as sonnerToast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui-v2/alert-dialog';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
}

interface ToastContextValue {
  showToast: (variant: ToastVariant, message: React.ReactNode, title?: React.ReactNode) => void;
  success: (message: React.ReactNode, title?: React.ReactNode) => void;
  error: (message: React.ReactNode, title?: React.ReactNode) => void;
  warning: (message: React.ReactNode, title?: React.ReactNode) => void;
  info: (message: React.ReactNode, title?: React.ReactNode) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

const dispatch = (variant: ToastVariant, message: React.ReactNode, title?: React.ReactNode) => {
  const text = typeof message === 'string' ? message : String(message ?? '');
  const description = typeof title === 'string' ? title : title ? String(title) : undefined;
  switch (variant) {
    case 'success':
      sonnerToast.success(text, { description });
      break;
    case 'error':
      sonnerToast.error(text, { description });
      break;
    case 'warning':
      sonnerToast.warning(text, { description });
      break;
    case 'info':
    default:
      sonnerToast.info(text, { description });
  }
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [confirmState, setConfirmState] = React.useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);

  const value = React.useMemo<ToastContextValue>(
    () => ({
      showToast: dispatch,
      success: (m, t) => dispatch('success', m, t),
      error: (m, t) => dispatch('error', m, t),
      warning: (m, t) => dispatch('warning', m, t),
      info: (m, t) => dispatch('info', m, t),
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          setConfirmState({ ...options, resolve });
        }),
    }),
    []
  );

  const handleConfirm = (result: boolean) => {
    if (confirmState) {
      confirmState.resolve(result);
      setConfirmState(null);
    }
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <AlertDialog open={!!confirmState} onOpenChange={(open) => !open && handleConfirm(false)}>
        <AlertDialogContent>
          {confirmState && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirmState.title}</AlertDialogTitle>
                <AlertDialogDescription>{confirmState.message}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => handleConfirm(false)}>
                  {confirmState.cancelLabel ?? 'Cancel'}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handleConfirm(true)}
                  className={
                    confirmState.variant === 'danger'
                      ? 'bg-danger text-danger-foreground hover:bg-danger/90'
                      : undefined
                  }
                >
                  {confirmState.confirmLabel ?? 'Confirm'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Button } from '../components/ui/Button';

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

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/** Convert a React.ReactNode title/message to what sonner accepts (string | undefined). */
const toStr = (node: React.ReactNode): string | undefined => {
  if (node == null) return undefined;
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  // For complex ReactNode, fall back to rendering without a string title.
  return undefined;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // idRef is kept so the showToast signature stays identical — the id returned
  // by sonner is a string/number we don't expose externally, but callers that
  // call showToast multiple times need stable internal behavior.
  const idRef = useRef(0);

  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);

  const showToast = useCallback(
    (variant: ToastVariant, message: React.ReactNode, title?: React.ReactNode) => {
      idRef.current++;
      const msgStr =
        typeof message === 'string' || typeof message === 'number' ? String(message) : undefined;
      const titleStr = toStr(title);

      // Delegate to sonner's typed methods.
      switch (variant) {
        case 'success':
          toast.success(titleStr ?? msgStr ?? 'Done', {
            description: titleStr != null ? msgStr : undefined,
          });
          break;
        case 'error':
          toast.error(titleStr ?? msgStr ?? 'Error', {
            description: titleStr != null ? msgStr : undefined,
          });
          break;
        case 'warning':
          toast.warning(titleStr ?? msgStr ?? 'Warning', {
            description: titleStr != null ? msgStr : undefined,
          });
          break;
        case 'info':
        default:
          toast.info(titleStr ?? msgStr ?? 'Info', {
            description: titleStr != null ? msgStr : undefined,
          });
          break;
      }
    },
    []
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast,
      success: (m, t) => showToast('success', m, t),
      error: (m, t) => showToast('error', m, t),
      warning: (m, t) => showToast('warning', m, t),
      info: (m, t) => showToast('info', m, t),
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          setConfirmState({ ...options, resolve });
        }),
    }),
    [showToast]
  );

  const resolveConfirm = (result: boolean) => {
    if (confirmState) {
      confirmState.resolve(result);
      setConfirmState(null);
    }
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Confirm modal — kept as-is; sonner has no confirm dialog */}
      {confirmState &&
        createPortal(
          <div
            className="fixed inset-0 z-[410] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
            onClick={() => resolveConfirm(false)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="bg-surface border border-border rounded-xl w-full max-w-[420px] shadow-modal animate-[slideUp_0.2s_ease]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 sm:p-6 border-b border-border">
                <h2 className="font-sans text-h2 font-semibold text-foreground m-0">
                  {confirmState.title}
                </h2>
              </div>
              <div className="p-5 sm:p-6 font-sans text-sm text-foreground-muted">
                {confirmState.message}
              </div>
              <div className="flex items-center justify-end gap-3 px-5 py-4 sm:px-6 border-t border-border">
                <Button variant="secondary" onClick={() => resolveConfirm(false)}>
                  {confirmState.cancelLabel ?? 'Cancel'}
                </Button>
                <Button
                  variant={confirmState.variant === 'danger' ? 'danger' : 'primary'}
                  onClick={() => resolveConfirm(true)}
                >
                  {confirmState.confirmLabel ?? 'Confirm'}
                </Button>
              </div>
              <button
                type="button"
                className="absolute top-4 right-4 text-foreground-subtle hover:text-foreground"
                onClick={() => resolveConfirm(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};

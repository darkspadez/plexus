import React from 'react';
import { clsx } from 'clsx';
import type { TargetTestState } from '../../pages/models/test-state';

interface TargetTestMessageProps {
  state?: TargetTestState;
  onDismiss?: () => void;
  className?: string;
}

/** Dismissible result line for a single target test (success or error). */
export const TargetTestMessage: React.FC<TargetTestMessageProps> = ({
  state,
  onDismiss,
  className,
}) => {
  if (!state?.showMessage || !state.message) return null;
  const isError = state.result === 'error';
  return (
    <button
      type="button"
      aria-label="Dismiss test message"
      onClick={(e) => {
        // Never let a dismiss click bubble to a clickable parent (e.g. a card tap opens edit).
        e.stopPropagation();
        onDismiss?.();
      }}
      className={clsx(
        'w-fit max-w-full cursor-pointer rounded border px-2 py-1 text-left',
        isError ? 'border-danger/30 bg-danger/10' : 'border-success/30 bg-success/10',
        className
      )}
      title="Click to dismiss"
    >
      <span
        className={clsx(
          'break-words text-[11px] italic',
          isError ? 'text-danger-text' : 'text-success-text'
        )}
      >
        {state.message} [×]
      </span>
    </button>
  );
};

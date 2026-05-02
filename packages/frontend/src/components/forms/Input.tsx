/**
 * Project-style labeled input — a labeled-field wrapper around the shadcn
 * ui-v2 Input that bundles label + input + hint/error in one component
 * matching the design-doc §7.2 form pattern (label above, hint below, errors
 * below hint). Used by Models + Providers + the per-provider quota config
 * forms; new code building forms with react-hook-form + zod uses ui-v2's
 * Form/FormField primitives instead.
 */

import React from 'react';
import { Input as UiInput } from '../ui-v2/input';
import { cn } from '../../lib/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leadingIcon?: React.ReactNode;
  trailingAction?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  leadingIcon,
  trailingAction,
  className,
  id,
  ...props
}) => {
  const generatedId = React.useId();
  const inputId = id || props.name || generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-foreground-muted">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leadingIcon && (
          <span className="pointer-events-none absolute left-3 flex items-center text-foreground-muted">
            {leadingIcon}
          </span>
        )}
        <UiInput
          id={inputId}
          aria-invalid={!!error}
          className={cn(
            leadingIcon && 'pl-10',
            trailingAction && 'pr-10',
            error && 'border-danger focus-visible:ring-danger',
            className
          )}
          {...props}
        />
        {trailingAction && (
          <span className="absolute right-2 flex items-center">{trailingAction}</span>
        )}
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
      {!error && hint && <span className="text-xs text-foreground-muted">{hint}</span>}
    </div>
  );
};

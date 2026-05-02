import React from 'react';
import { clsx } from 'clsx';

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
        <input
          id={inputId}
          aria-invalid={!!error}
          className={clsx(
            'w-full py-2.5 text-sm text-foreground bg-surface-elevated border rounded-md outline-none transition-all duration-fast backdrop-blur-md placeholder:text-foreground-muted',
            'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            leadingIcon ? 'pl-10' : 'pl-3.5',
            trailingAction ? 'pr-10' : 'pr-3.5',
            error ? 'border-danger' : 'border-border',
            className
          )}
          {...props}
        />
        {trailingAction && (
          <span className="absolute right-2 flex items-center">{trailingAction}</span>
        )}
      </div>
      {error && <span className="text-danger text-xs">{error}</span>}
      {!error && hint && <span className="text-foreground-muted text-xs">{hint}</span>}
    </div>
  );
};

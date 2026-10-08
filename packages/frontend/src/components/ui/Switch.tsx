import React from 'react';
import { clsx } from 'clsx';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  'aria-label'?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled,
  size = 'md',
  'aria-label': ariaLabel,
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      data-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      className={clsx(
        'group relative inline-block flex-shrink-0 rounded-selector transition-colors duration-150 outline-none',
        // Forced-colors drops backgrounds; draw the track as an outline instead.
        'forced-colors:outline-solid forced-colors:outline-1 forced-colors:focus-visible:outline-2',
        'bg-border-strong',
        'data-[checked=true]:bg-secondary',
        'focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        !disabled && 'cursor-pointer',
        {
          'h-[1.125rem] w-[1.875rem]': size === 'sm',
          'h-5 w-[2.125rem]': size === 'md',
        }
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'absolute top-[0.125rem] left-[0.125rem] inline-block rounded-selector forced-colors:outline-solid forced-colors:outline-1 bg-foreground-muted group-data-[checked=true]:bg-secondary-foreground transition-transform duration-150',
          {
            'h-3.5 w-3.5 group-data-[checked=true]:translate-x-3': size === 'sm',
            'h-4 w-4 group-data-[checked=true]:translate-x-3.5': size === 'md',
          }
        )}
      />
    </button>
  );
};

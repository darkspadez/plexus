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
        'group relative inline-block flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-150 outline-none',
        'bg-border-strong',
        'data-[checked=true]:bg-accent data-[checked=true]:border-transparent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        !disabled && 'cursor-pointer',
        {
          'h-[18px] w-[30px]': size === 'sm',
          'h-5 w-[34px]': size === 'md',
        }
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'absolute top-0 left-0 inline-block rounded-full bg-foreground-muted group-data-[checked=true]:bg-accent-foreground transition-transform duration-150',
          {
            'h-3.5 w-3.5 group-data-[checked=true]:translate-x-3': size === 'sm',
            'h-4 w-4 group-data-[checked=true]:translate-x-3.5': size === 'md',
          }
        )}
      />
    </button>
  );
};

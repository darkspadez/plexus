import React from 'react';
import { ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';

interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  disabled?: boolean;
}

interface SelectProps<V extends string = string>
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> {
  value: V;
  onChange: (value: V) => void;
  options: SelectOption<V>[];
  label?: string;
  error?: string;
  placeholder?: string;
}

export function Select<V extends string = string>({
  value,
  onChange,
  options,
  label,
  error,
  placeholder,
  className,
  id,
  ...rest
}: SelectProps<V>) {
  const generatedId = React.useId();
  const selectId = id || generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="font-sans text-xs font-medium text-foreground-muted">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(e.target.value as V)}
          aria-invalid={!!error}
          className={clsx(
            'w-full h-8 appearance-none py-1.5 pl-3 pr-9 font-sans text-sm text-foreground bg-background border rounded-md outline-none transition-colors duration-150 cursor-pointer',
            'hover:border-border-strong',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error ? 'border-danger' : 'border-border',
            className
          )}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted"
        />
      </div>
      {error && <span className="text-danger text-xs">{error}</span>}
    </div>
  );
}

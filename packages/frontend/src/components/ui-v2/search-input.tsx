import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Input } from './input';

export interface SearchInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, placeholder, className, autoFocus, 'aria-label': ariaLabel }, ref) => (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground-subtle"
        strokeWidth={1.75}
        aria-hidden
      />
      <Input
        ref={ref}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 pl-8 pr-8"
        autoFocus={autoFocus}
        aria-label={ariaLabel}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-foreground-muted hover:bg-surface-elevated hover:text-foreground"
        >
          <X className="size-3.5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  )
);
SearchInput.displayName = 'SearchInput';

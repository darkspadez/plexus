import React from 'react';
import { X, Check, Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../../components/ui-v2/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui-v2/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../components/ui-v2/command';

interface Props {
  /** All choices the user can pick from. */
  options: string[];
  /** Currently selected values. */
  value: string[];
  /** Called with the new array. */
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * Compact multi-select rendered as a row of removable pills plus a
 * popover Command palette for adding new entries. Used for allowed/
 * excluded provider and model lists on the key edit Sheet.
 */
export const MultiSelectChips: React.FC<Props> = ({
  options,
  value,
  onChange,
  placeholder = 'Add…',
  ariaLabel,
  className,
}) => {
  const remaining = React.useMemo(
    () => options.filter((o) => !value.includes(o)),
    [options, value]
  );
  const remove = (v: string) => onChange(value.filter((x) => x !== v));
  const add = (v: string) => {
    if (!value.includes(v)) onChange([...value, v]);
  };

  return (
    <div
      className={cn(
        'flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-2 py-1.5',
        className
      )}
      aria-label={ariaLabel}
    >
      {value.length === 0 && (
        <span className="text-xs text-foreground-subtle">Any (unrestricted)</span>
      )}
      {value.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground"
        >
          <span className="font-mono">{v}</span>
          <button
            type="button"
            onClick={() => remove(v)}
            aria-label={`Remove ${v}`}
            className="text-foreground-subtle hover:text-danger"
          >
            <X className="size-3" strokeWidth={2} />
          </button>
        </span>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs text-foreground-muted hover:text-foreground"
            disabled={remaining.length === 0}
          >
            <Plus className="size-3" strokeWidth={2} />
            {placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandInput placeholder="Search…" />
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup>
                {remaining.map((opt) => (
                  <CommandItem key={opt} value={opt} onSelect={() => add(opt)}>
                    <Check
                      className={cn('size-3.5 opacity-0', value.includes(opt) && 'opacity-100')}
                      strokeWidth={2}
                    />
                    <span className="font-mono">{opt}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

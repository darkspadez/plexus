import type React from 'react';
import { cn } from '../../lib/cn';
import { withCurrentOption } from '../../theme/editor';

export interface SegmentedItem<V extends string | number> {
  value: V;
  label: string;
  title?: string;
}

interface SegmentedBase<V extends string | number> {
  label: string;
  value: V;
  /** Presets; labels equal values. Use `items` for custom labels or non-string values. */
  options?: readonly V[];
  /** Explicit buttons (label, optional tooltip). Takes precedence over `options`. */
  items?: readonly SegmentedItem<V>[];
  onChange: (v: V) => void;
}

/** String values may offer the editor's opening value when it is not a preset. */
interface SegmentedStringProps<V extends string> extends SegmentedBase<V> {
  /** The value the editor opened with; offered as "Current (value)" when it is not a preset. */
  initial?: string;
}

/** Any value type, without `initial`. */
interface SegmentedPlainProps<V extends string | number> extends SegmentedBase<V> {
  initial?: undefined;
}

/** A row of toggle buttons; the one matching `value` is pressed. `initial` needs string values. */
export function Segmented<V extends string>(props: SegmentedStringProps<V>): React.ReactElement;
export function Segmented<V extends string | number>(
  props: SegmentedPlainProps<V>
): React.ReactElement;
export function Segmented({
  label,
  value,
  options = [],
  items: explicitItems,
  onChange,
  initial,
}: SegmentedBase<string | number> & { initial?: string }) {
  const items: readonly SegmentedItem<string | number>[] =
    explicitItems ??
    (initial !== undefined
      ? withCurrentOption(options.map(String), initial)
      : options.map((o) => ({ value: o, label: String(o) })));
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          title={item.title}
          aria-pressed={item.value === value}
          onClick={() => onChange(item.value)}
          className={cn(
            'h-7 rounded-field border-(length:--theme-border-width) px-2.5 text-xs font-medium tabular-nums transition-colors duration-150 cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            item.value === value
              ? 'border-primary bg-primary-subtle text-primary-text'
              : 'border-border text-foreground-muted hover:bg-surface-elevated hover:text-foreground'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

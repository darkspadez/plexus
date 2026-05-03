import React, { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, X } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '../ui-v2/popover';

interface TagSelectProps {
  label?: string;
  placeholder?: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
  /**
   * When true, users can add free-form values that aren't in `options`.
   * Pressing Enter or typing a comma commits the current search text as a
   * new tag, and the dropdown shows a "Create '<search>'" affordance.
   */
  allowCustom?: boolean;
  /**
   * When true, render chips in the user's selected accent tone (via the
   * `--accent` CSS variable) instead of the default primary-pink fill.
   */
  colorize?: boolean;
}

// Single accent-tone chip style used when `colorize` is on. Uses the runtime
// `--accent` / `--accent-subtle` CSS variables, so chips track whichever
// accent the user has picked from the palette in the top bar.
const ACCENT_CHIP_CLASSES = 'bg-accent-subtle text-accent border-accent/30';

export const TagSelect: React.FC<TagSelectProps> = ({
  label,
  placeholder = 'Select...',
  options,
  selected,
  onChange,
  className,
  allowCustom = false,
  colorize = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when opening. Outside-click dismissal is handled by
  // Radix Popover's `onOpenChange` below — no manual document listener needed.
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Single source of truth for tag identity: duplicate detection across
  // filteredOptions / showCreateOption / addCustomTags must agree, otherwise
  // the dropdown can hide a "Create" option while keyboard/blur/paste still
  // commits it (or vice versa).
  const normalize = (s: string) => s.trim().toLowerCase();

  const filteredOptions = options.filter(
    (opt) =>
      normalize(opt).includes(normalize(search)) &&
      !selected.some((s) => normalize(s) === normalize(opt))
  );

  const handleToggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const handleRemove = (option: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter((s) => s !== option));
  };

  // Toggle on click so a second click on the chevron / trigger box closes the
  // popover. Without this, Radix's outside-pointer-down would fire first and
  // close the popover, then the bubbling click would re-open it (race).
  // `onPointerDownOutside` on PopoverContent below filters trigger-box clicks
  // out of Radix's auto-close so this toggle is the single source of truth.
  const handleContainerClick = () => {
    setIsOpen((o) => !o);
  };

  // Add one or more free-form tags in a single onChange call. Skips empty,
  // duplicate, and already-selected values (case-insensitive). Preserves the
  // user-typed casing in the committed value. Does NOT touch `search` —
  // callers decide whether to clear the input.
  const addCustomTags = (raws: string[]) => {
    const seen = new Set(selected.map(normalize));
    const toAdd: string[] = [];
    for (const raw of raws) {
      const value = raw.trim();
      if (!value) continue;
      const key = normalize(value);
      if (seen.has(key)) continue;
      seen.add(key);
      toAdd.push(value);
    }
    if (toAdd.length > 0) onChange([...selected, ...toAdd]);
  };

  // Commit the current search text as a new free-form tag. No-ops if the
  // value is empty (after trim) or already selected.
  const commitCustom = (raw: string) => {
    addCustomTags([raw]);
    setSearch('');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!allowCustom) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitCustom(search);
    } else if (e.key === 'Backspace' && search === '' && selected.length > 0) {
      // Quality-of-life: backspace on empty input peels off the last tag.
      onChange(selected.slice(0, -1));
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    // Commit on comma even inside onChange (handles paste of "a, b, c"). Batch
    // all new tags into a single onChange so later calls don't overwrite
    // earlier ones via the stale `selected` snapshot.
    if (allowCustom && next.includes(',')) {
      const parts = next.split(',');
      const tail = parts.pop() ?? '';
      addCustomTags(parts);
      setSearch(tail);
      return;
    }
    setSearch(next);
  };

  const searchTrimmed = search.trim();
  const searchKey = normalize(searchTrimmed);
  const showCreateOption =
    allowCustom &&
    searchTrimmed.length > 0 &&
    !selected.some((s) => normalize(s) === searchKey) &&
    !options.some((o) => normalize(o) === searchKey);

  return (
    <div className={clsx('flex flex-col gap-2', className)} ref={containerRef}>
      {label && (
        <label className="text-[13px] font-medium text-foreground-muted whitespace-nowrap">
          {label}
        </label>
      )}
      <Popover
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsOpen(false);
            setSearch('');
          }
        }}
      >
        <PopoverAnchor asChild>
          <div
            className={clsx(
              'w-full py-2 px-3 text-sm bg-background border rounded-md outline-none transition-colors cursor-text min-h-10 flex flex-wrap items-center gap-1.5',
              isOpen
                ? 'border-accent ring-2 ring-accent ring-offset-2 ring-offset-background'
                : 'border-border hover:border-border'
            )}
            onClick={handleContainerClick}
          >
            {selected.map((tag) => (
              <span
                key={tag}
                className={clsx(
                  'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border whitespace-nowrap',
                  colorize ? ACCENT_CHIP_CLASSES : 'bg-primary/15 text-primary border-primary/30'
                )}
              >
                {tag}
                <button
                  type="button"
                  className="bg-transparent border-0 p-0 m-0 cursor-pointer leading-none opacity-70 hover:opacity-100"
                  style={{ color: 'currentColor' }}
                  onClick={(e) => handleRemove(tag, e)}
                  title={`Remove ${tag}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {isOpen ? (
              <input
                ref={searchInputRef}
                className="flex-1 min-w-[80px] bg-transparent border-0 outline-none text-foreground text-sm p-0 placeholder:text-foreground-muted"
                value={search}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                onClick={(e) => {
                  // Don't let a click on the search input bubble to the
                  // trigger box's toggle handler — typing should not close
                  // the popover.
                  e.stopPropagation();
                }}
                onBlur={(e) => {
                  if (!allowCustom) return;
                  // Only commit when focus leaves the component entirely. A
                  // blur to another element inside the popover (e.g. clicking
                  // a dropdown item) would otherwise commit the partial
                  // search text as a new tag before the item's click handler
                  // fires. The PopoverContent is portalled, so check both
                  // the anchor container AND any open popover content.
                  const related = e.relatedTarget as Element | null;
                  if (related && containerRef.current?.contains(related)) return;
                  if (related && related.closest('[data-radix-popper-content-wrapper]')) return;
                  commitCustom(search);
                }}
                placeholder={
                  selected.length === 0 ? placeholder : allowCustom ? 'Type to add...' : 'Search...'
                }
              />
            ) : (
              <span className="text-foreground-muted text-sm flex-1">
                {selected.length === 0 ? placeholder : ''}
              </span>
            )}
            <ChevronDown
              size={14}
              className={clsx(
                'text-foreground-muted ml-auto shrink-0 transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => {
            // Clicks within the trigger box are handled by the trigger's
            // onClick toggle. If we let Radix close on those pointer-downs,
            // the close races with the click re-open and the popover
            // appears to bounce shut-then-open.
            const target = e.target as Node | null;
            if (target && containerRef.current?.contains(target)) {
              e.preventDefault();
            }
          }}
          className="p-0 max-h-52 overflow-y-auto bg-surface border border-border rounded-md shadow-md"
          style={{ width: 'var(--radix-popper-anchor-width)' }}
          onWheel={(e) => {
            // The parent Sheet's react-remove-scroll suppresses wheel events
            // at the document capture phase, so even the portalled popover
            // doesn't scroll natively. Drive scrollTop imperatively and stop
            // propagation so the lock doesn't see it.
            const el = e.currentTarget;
            if (el.scrollHeight > el.clientHeight) {
              el.scrollTop += e.deltaY;
              e.stopPropagation();
            }
          }}
        >
          {filteredOptions.length === 0 && !showCreateOption && (
            <div className="px-3.5 py-2.5 text-xs text-foreground-muted">
              {search
                ? 'No matches found'
                : allowCustom
                  ? 'Type to add a new tag'
                  : 'All items selected'}
            </div>
          )}
          {filteredOptions.map((option) => (
            <button
              type="button"
              key={option}
              className={clsx(
                'w-full text-left px-3.5 py-2 text-sm cursor-pointer transition-colors',
                'hover:bg-surface-elevated text-foreground'
              )}
              onClick={() => handleToggle(option)}
            >
              {option}
            </button>
          ))}
          {showCreateOption && (
            <button
              type="button"
              key={`__create__${searchTrimmed}`}
              className="w-full text-left px-3.5 py-2 text-sm cursor-pointer transition-colors hover:bg-surface-elevated text-foreground border-t border-border"
              onClick={() => commitCustom(searchTrimmed)}
            >
              <span className="text-foreground-muted">Create </span>
              <span className="font-medium">&quot;{searchTrimmed}&quot;</span>
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, X } from 'lucide-react';

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
   * When true (and `allowCustom` is set), a space also commits the current
   * text as a tag — handy for token-style inputs (e.g. IP allowlists) where
   * values never contain spaces. Enter and comma keep working. Leave off for
   * dropdowns whose option labels may legitimately contain spaces.
   */
  splitOnSpace?: boolean;
}

export const TagSelect: React.FC<TagSelectProps> = ({
  label,
  placeholder = 'Select...',
  options,
  selected,
  onChange,
  className,
  allowCustom = false,
  splitOnSpace = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when opening
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

  const handleContainerClick = () => {
    setIsOpen(true);
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
    if (e.key === 'Enter' || e.key === ',' || (splitOnSpace && e.key === ' ')) {
      e.preventDefault();
      commitCustom(search);
    } else if (e.key === 'Backspace' && search === '' && selected.length > 0) {
      // Quality-of-life: backspace on empty input peels off the last tag.
      onChange(selected.slice(0, -1));
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    // Commit on separator even inside onChange (handles paste of "a, b, c" and,
    // when splitOnSpace is set, whitespace-separated input). Batch all new tags
    // into a single onChange so later calls don't overwrite earlier ones via the
    // stale `selected` snapshot.
    const splitRe = splitOnSpace ? /[,\s]/ : /,/;
    if (allowCustom && splitRe.test(next)) {
      const parts = next.split(splitRe);
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
        <label className="font-sans text-xs font-medium text-foreground-muted whitespace-nowrap">
          {label}
        </label>
      )}
      <div
        className={clsx(
          'w-full py-2 px-3 font-sans text-sm bg-background border rounded-md outline-none transition-colors duration-150 cursor-text min-h-[38px] flex flex-wrap items-center gap-1.5',
          isOpen
            ? 'border-accent ring-2 ring-accent ring-offset-2 ring-offset-background'
            : 'border-border hover:border-border-strong'
        )}
        onClick={handleContainerClick}
      >
        {selected.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-accent-subtle text-accent border border-accent/30 whitespace-nowrap"
          >
            {tag}
            <button
              type="button"
              className="bg-transparent border-0 p-0 m-0 cursor-pointer text-accent/70 hover:text-accent leading-none"
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
            onBlur={(e) => {
              if (!allowCustom) return;
              // Only commit when focus leaves the component entirely. A blur
              // to another element inside the container (e.g. clicking a
              // dropdown item) would otherwise commit the partial search text
              // as a new tag before the item's click handler fires.
              const related = e.relatedTarget as Node | null;
              if (related && containerRef.current?.contains(related)) return;
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
            'text-foreground-muted ml-auto shrink-0 transition-transform duration-150',
            isOpen && 'rotate-180'
          )}
        />
      </div>

      {isOpen && (
        <div className="relative -mt-1">
          <div className="absolute z-50 w-full max-h-52 overflow-y-auto bg-surface border border-border rounded-md shadow-md">
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
                  'w-full text-left px-3.5 py-2 text-sm font-sans cursor-pointer transition-colors',
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
                className="w-full text-left px-3.5 py-2 text-sm font-sans cursor-pointer transition-colors hover:bg-surface-elevated text-foreground border-t border-border"
                onClick={() => commitCustom(searchTrimmed)}
              >
                <span className="text-foreground-muted">Create </span>
                <span className="font-medium">&quot;{searchTrimmed}&quot;</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Calendar, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  getPresetRange,
  formatDateRange,
  isValidDateRange,
  parseISODate,
  type DateRangePreset,
  type CustomDateRange,
} from '../../lib/date';
import type { UsageRange } from '../../types/usage';

/** Selector ids are the usage endpoints' `range` ids and are sent as-is. */
export type TimeRange = UsageRange;

const RANGE_LABELS: Record<TimeRange, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  hour: '1h',
  day: '24h',
  week: '7d',
  month: '30d',
  all: 'All',
  custom: 'Custom',
};

/**
 * How often a range's queries refetch. The backend resolves a named range
 * against its own clock on every request, so polling rolls the window
 * forward; a custom range is a fixed window and never auto-refetches.
 */
export function rangeRefetchMs(range: TimeRange): number | false {
  switch (range) {
    case '1m':
    case '5m':
    case '15m':
      return 10_000;
    case 'hour':
      return 30_000;
    case 'day':
    case 'week':
    case 'month':
    case 'all':
      return 60_000;
    case 'custom':
      return false;
  }
}

/** The preset an arrow key moves to from the focused one, wrapping at both ends. */
export function stepPreset<T>(presets: readonly T[], from: T, step: 1 | -1): T {
  const index = presets.indexOf(from);
  return presets[(index + step + presets.length) % presets.length];
}

const ARROW_STEPS: Partial<Record<string, 1 | -1>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

interface TimeRangeSelectorProps<T extends TimeRange> {
  value: T;
  onChange: (range: T) => void;
  /**
   * Presets render in this order as one segmented radio group; `'custom'`
   * adds the date-picker button after it.
   */
  options: readonly T[];
  customRange?: CustomDateRange | null;
  onCustomRangeChange?: (range: CustomDateRange | null) => void;
}

const PRESETS: { label: string; value: DateRangePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'this-week' },
  { label: 'This Month', value: 'this-month' },
  { label: 'Last Month', value: 'last-month' },
];

export function TimeRangeSelector<T extends TimeRange>({
  value,
  onChange,
  options,
  customRange,
  onCustomRangeChange,
}: TimeRangeSelectorProps<T>) {
  const presets = options.filter((range) => range !== 'custom');
  const customOption = options.find((range) => range === 'custom');
  const segmentRefs = useRef(new Map<T, HTMLButtonElement>());
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowPresetDropdown(false);
      }
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowCustomPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialize date inputs when custom range changes
  useEffect(() => {
    if (customRange && value === 'custom') {
      setStartDate(formatDateTimeLocal(customRange.start));
      setEndDate(formatDateTimeLocal(customRange.end));
      setError(null);
    }
  }, [customRange, value]);

  const handlePresetSelect = (preset: DateRangePreset) => {
    const range = getPresetRange(preset);
    setStartDate(formatDateTimeLocal(range.start));
    setEndDate(formatDateTimeLocal(range.end));
    onCustomRangeChange?.(range);
    setShowPresetDropdown(false);
    setError(null);
  };

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    if (field === 'start') {
      setStartDate(value);
    } else {
      setEndDate(value);
    }

    const newStart = field === 'start' ? parseISODate(value) : customRange?.start;
    const newEnd = field === 'end' ? parseISODate(value) : customRange?.end;

    if (newStart && newEnd) {
      if (!isValidDateRange(newStart, newEnd)) {
        setError('End date must be after start date and not in the future');
        return;
      }
      setError(null);
      onCustomRangeChange?.({ start: newStart, end: newEnd });
    }
  };

  const selectPreset = (range: T) => {
    onChange(range);
    setShowCustomPicker(false);
    setShowPresetDropdown(false);
  };

  // Radio-group keyboard model: arrows move focus and selection together.
  const handlePresetKeyDown = (event: React.KeyboardEvent, from: T) => {
    const step = ARROW_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    const next = stepPreset(presets, from, step);
    selectPreset(next);
    segmentRefs.current.get(next)?.focus();
  };

  const handleCustomClick = (custom: T) => {
    if (value === custom) {
      setShowCustomPicker(!showCustomPicker);
    } else {
      onChange(custom);
      setShowCustomPicker(true);
      // Initialize with last 7 days if no custom range exists
      if (!customRange) {
        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        onCustomRangeChange?.({ start: weekAgo, end: now });
      }
    }
    setShowPresetDropdown(false);
  };

  const formatDateTimeLocal = (date: Date): string => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.length > 0 && (
        <div
          role="radiogroup"
          aria-label="Time range"
          className="inline-flex h-7 items-stretch divide-x divide-border-strong rounded-md border border-border-strong bg-surface-elevated"
        >
          {presets.map((range, index) => {
            const selected = value === range;
            // Roving tab stop: the selected segment, or the first one while a
            // custom range is active.
            const tabbable = selected || (index === 0 && !presets.includes(value));
            return (
              <button
                key={range}
                ref={(el) => {
                  if (el) segmentRefs.current.set(range, el);
                  else segmentRefs.current.delete(range);
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={tabbable ? 0 : -1}
                onClick={() => selectPreset(range)}
                onKeyDown={(event) => handlePresetKeyDown(event, range)}
                className={cn(
                  'relative min-w-8 cursor-pointer select-none whitespace-nowrap px-2.5 font-sans text-xs font-medium tnum',
                  'transition-colors duration-150 first:rounded-l-md last:rounded-r-md',
                  'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  selected
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground-muted hover:bg-surface-hover hover:text-foreground'
                )}
              >
                {RANGE_LABELS[range]}
              </button>
            );
          })}
        </div>
      )}

      {customOption && (
        <div className="relative" ref={pickerRef}>
          <Button
            size="sm"
            variant={value === customOption ? 'primary' : 'outline'}
            onClick={() => handleCustomClick(customOption)}
            className="flex items-center gap-1.5"
          >
            <Calendar size={14} />
            {RANGE_LABELS.custom}
            <ChevronDown
              size={12}
              style={{
                transition: 'transform 0.2s',
                transform: showCustomPicker ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          </Button>

          {showCustomPicker && value === customOption && (
            <div className="absolute right-0 top-full z-[100] mt-2 min-w-[280px] rounded-lg border border-border bg-surface-elevated p-3 shadow-md">
              <div className="mb-3">
                <div className="mb-2">
                  <button
                    onClick={() => setShowPresetDropdown(!showPresetDropdown)}
                    className="flex w-full cursor-pointer items-center justify-between rounded-[6px] border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground-muted"
                  >
                    <span>Quick Select</span>
                    <ChevronDown
                      size={14}
                      style={{
                        transition: 'transform 0.2s',
                        transform: showPresetDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    />
                  </button>
                </div>

                {showPresetDropdown && (
                  <div ref={dropdownRef} className="mb-3 flex flex-col gap-1">
                    {PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => handlePresetSelect(preset.value)}
                        className="cursor-pointer rounded-sm border-0 bg-transparent px-3 py-1.5 text-left text-sm text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div>
                  <label className="mb-1 block text-xs text-foreground-muted">Start Date</label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => handleDateChange('start', e.target.value)}
                    className="w-full rounded-sm border border-border bg-surface-sunken px-2 py-1.5 text-sm text-foreground"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-foreground-muted">End Date</label>
                  <input
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => handleDateChange('end', e.target.value)}
                    className="w-full rounded-sm border border-border bg-surface-sunken px-2 py-1.5 text-sm text-foreground"
                  />
                </div>

                {error && (
                  <div className="rounded-sm border border-danger/30 bg-danger-subtle px-2 py-1.5 text-xs text-danger-text">
                    {error}
                  </div>
                )}

                <div className="rounded-sm bg-surface-elevated px-2 py-1.5 text-xs text-foreground-muted">
                  {customRange && formatDateRange(customRange.start, customRange.end)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Calendar, ChevronDown } from 'lucide-react';
import {
  getPresetRange,
  formatDateRange,
  isValidDateRange,
  parseISODate,
  type DateRangePreset,
  type CustomDateRange,
} from '../../lib/date';

export type TimeRange = 'hour' | 'day' | 'week' | 'month' | 'custom' | 'all';

const RANGE_LABELS: Partial<Record<TimeRange, string>> = { all: 'All Time' };

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  options?: TimeRange[];
  customRange?: CustomDateRange | null;
  onCustomRangeChange?: (range: CustomDateRange | null) => void;
}

const PRESETS: { label: string; value: DateRangePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'this-week' },
  { label: 'This Month', value: 'this-month' },
  { label: 'Last Month', value: 'last-month' },
];

export const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({
  value,
  onChange,
  options = ['hour', 'day', 'week', 'month', 'custom'],
  customRange,
  onCustomRangeChange,
}) => {
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

  const handleCustomClick = () => {
    if (value === 'custom') {
      setShowCustomPicker(!showCustomPicker);
    } else {
      onChange('custom');
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
      {options.map((range) => {
        if (range === 'custom') {
          return (
            <div key={range} className="relative" ref={pickerRef}>
              <Button
                size="sm"
                variant={value === range ? 'primary' : 'secondary'}
                onClick={handleCustomClick}
                className="capitalize flex items-center gap-1.5"
              >
                <Calendar size={14} />
                Custom
                <ChevronDown
                  size={12}
                  style={{
                    transition: 'transform 0.2s',
                    transform: showCustomPicker ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </Button>

              {showCustomPicker && value === 'custom' && (
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
                            className="cursor-pointer rounded-sm border-0 bg-transparent px-3 py-1.5 text-left text-sm text-foreground-muted"
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.backgroundColor = 'var(--surface-elevated)')
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.backgroundColor = 'transparent')
                            }
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
                      <div className="rounded-sm border border-danger/30 bg-danger-subtle px-2 py-1.5 text-xs text-danger">
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
          );
        }

        return (
          <Button
            key={range}
            size="sm"
            variant={value === range ? 'primary' : 'secondary'}
            onClick={() => {
              onChange(range);
              setShowCustomPicker(false);
              setShowPresetDropdown(false);
            }}
            className="capitalize"
          >
            {RANGE_LABELS[range] ?? range}
          </Button>
        );
      })}
    </div>
  );
};

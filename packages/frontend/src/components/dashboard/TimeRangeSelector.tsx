import React from 'react';
import { Button } from '../ui/Button';

type TimeRange = 'hour' | 'day' | 'week' | 'month';

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  options?: TimeRange[];
}

export const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({
  value,
  onChange,
  options = ['hour', 'day', 'week', 'month'],
}) => {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {options.map((range) => (
        <Button
          key={range}
          size="sm"
          variant={value === range ? 'primary' : 'secondary'}
          onClick={() => onChange(range)}
          style={{ textTransform: 'capitalize' }}
        >
          {range}
        </Button>
      ))}
    </div>
  );
};

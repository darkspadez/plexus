import { Input } from '../../components/ui/Input';
import type { AnomalyThresholdPolicy } from '../../lib/api/keySecurity';
import type { PolicyErrors, ThresholdField } from './keySecurityUtils';

interface PolicyFieldsProps {
  readonly value: AnomalyThresholdPolicy;
  readonly onChange: (value: AnomalyThresholdPolicy) => void;
  readonly errors: PolicyErrors;
  readonly disabled?: boolean;
}

const fields: readonly {
  readonly name: ThresholdField;
  readonly label: string;
  readonly step?: number;
}[] = [
  { name: 'lookbackMinutes', label: 'Baseline lookback (minutes)' },
  { name: 'exclusionGapMinutes', label: 'Exclusion gap (minutes)' },
  { name: 'windowMinutes', label: 'Current window (minutes)' },
  { name: 'sustainedWindows', label: 'Sustained windows' },
  { name: 'minimumRequestsPerMinute', label: 'Minimum requests / minute', step: 0.1 },
  { name: 'baselineMultiplier', label: 'Baseline multiplier', step: 0.1 },
  { name: 'minimumBaselineRequests', label: 'Minimum baseline requests' },
  { name: 'minimumActiveMinutes', label: 'Minimum active minutes' },
];

export const PolicyFields = ({ value, onChange, errors, disabled }: PolicyFieldsProps) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {fields.map((field) => (
      <Input
        key={field.name}
        type="number"
        min={field.name.startsWith('minimum') ? 0 : Number.MIN_VALUE}
        step={field.step ?? 1}
        label={field.label}
        value={value[field.name]}
        disabled={disabled}
        error={errors[field.name]}
        onChange={(event) => onChange({ ...value, [field.name]: Number(event.target.value) })}
      />
    ))}
  </div>
);

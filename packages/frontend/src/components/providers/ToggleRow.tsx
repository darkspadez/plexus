import { Switch } from '../ui/Switch';
import { cn } from '../../lib/cn';

interface ToggleRowProps {
  label: string;
  description: string;
  warning?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Let the description wrap instead of truncating (for long, meaningful copy). */
  wrap?: boolean;
}

/** Settings-style row: label + description on the left, switch on the right. */
export function ToggleRow({
  label,
  description,
  warning,
  checked,
  onChange,
  disabled,
  wrap,
}: ToggleRowProps) {
  return (
    <div
      className={cn(
        'flex justify-between gap-3',
        wrap ? 'min-h-10 items-start py-2' : 'h-10 items-center'
      )}
    >
      <div className="min-w-0 flex-1">
        <div
          className={cn('font-sans text-[12px] font-medium text-foreground', !wrap && 'truncate')}
        >
          {label}
        </div>
        <div
          className={cn('font-sans text-[11px] text-foreground-subtle', !wrap && 'truncate')}
          title={warning ? `${description} ${warning}` : description}
        >
          {description}
          {warning && <span className="ml-1 text-warning-text">{warning}</span>}
        </div>
      </div>
      <Switch aria-label={label} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

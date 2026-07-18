import { Switch } from '../ui/Switch';

interface ToggleRowProps {
  label: string;
  description: string;
  warning?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Settings-style row: label + description on the left, switch on the right. */
export function ToggleRow({
  label,
  description,
  warning,
  checked,
  onChange,
  disabled,
}: ToggleRowProps) {
  return (
    <div className="h-10 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-sans text-[12px] font-medium text-foreground truncate">{label}</div>
        <div
          className="font-sans text-[11px] text-foreground-subtle truncate"
          title={warning ? `${description} ${warning}` : description}
        >
          {description}
          {warning && <span className="ml-1 text-warning">{warning}</span>}
        </div>
      </div>
      <Switch aria-label={label} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

import React from 'react';
import { Input } from '../ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui-v2/select';

export interface ApertisQuotaConfigProps {
  options: Record<string, unknown>;
  onChange: (options: Record<string, unknown>) => void;
}

export const ApertisQuotaConfig: React.FC<ApertisQuotaConfigProps> = ({ options, onChange }) => {
  const handleChange = (key: string, value: string) => {
    onChange({ ...options, [key]: value });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <label className="text-[13px] font-medium text-foreground-muted">Endpoint (optional)</label>
        <Input
          value={(options.endpoint as string) ?? ''}
          onChange={(e) => handleChange('endpoint', e.target.value)}
          placeholder="https://api.apertis.ai/v1/dashboard/billing/credits"
        />
        <span className="text-[10px] text-foreground-muted">
          Uses the provider's API key automatically. No additional configuration needed.
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[13px] font-medium text-foreground-muted">Quota Source</label>
        <Select
          value={(options.mode as string) ?? 'subscription'}
          onValueChange={(val) => onChange({ ...options, mode: val })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="subscription">Subscription (quota only)</SelectItem>
            <SelectItem value="payg">PAYG (balance only)</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[10px] text-foreground-muted">
          Subscription mode monitors the plan quota and triggers cooldowns when exhausted. PAYG mode
          only tracks the prepaid balance, ignoring the subscription.
        </span>
      </div>
    </div>
  );
};

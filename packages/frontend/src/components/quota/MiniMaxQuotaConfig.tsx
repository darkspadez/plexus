import React from 'react';
import { Input } from '../ui/Input';

export interface MiniMaxQuotaConfigProps {
  options: Record<string, unknown>;
  onChange: (options: Record<string, unknown>) => void;
}

export const MiniMaxQuotaConfig: React.FC<MiniMaxQuotaConfigProps> = ({ options, onChange }) => {
  const handleChange = (key: string, value: string) => {
    onChange({ ...options, [key]: value });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <label className="font-sans text-sm font-medium text-foreground-muted">
          Group ID <span className="text-danger-text">*</span>
        </label>
        <Input
          value={(options.groupid as string) ?? ''}
          onChange={(e) => handleChange('groupid', e.target.value)}
          placeholder="Enter MiniMax GroupId"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-sans text-sm font-medium text-foreground-muted">
          _token Cookie <span className="text-danger-text">*</span>
        </label>
        <Input
          type="password"
          value={(options.token as string) ?? ''}
          onChange={(e) => handleChange('token', e.target.value)}
          placeholder="Paste _token cookie value"
        />
        <span className="text-2xs text-foreground-subtle">
          Treated as a password. Used to query MiniMax balance.
        </span>
      </div>
    </div>
  );
};

import React from 'react';
import { Input } from '../ui/Input';

export interface CursorQuotaConfigProps {
  options: Record<string, unknown>;
  onChange: (options: Record<string, unknown>) => void;
}

export const CursorQuotaConfig: React.FC<CursorQuotaConfigProps> = ({ options, onChange }) => {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="cursor-oauth-account"
          className="font-body text-[13px] font-medium text-text-secondary"
        >
          OAuth account (optional)
        </label>
        <Input
          id="cursor-oauth-account"
          value={(options.oauthAccountId as string) ?? ''}
          onChange={(e) => onChange({ ...options, oauthAccountId: e.target.value })}
          placeholder="Defaults to this provider's OAuth account"
        />
        <span className="text-[10px] text-text-muted">
          Uses your Cursor OAuth token automatically. Reports usage credits (usage-based plans) or
          monthly request usage (legacy plans), plus any prepaid credit balance. No additional input
          is required.
        </span>
      </div>
    </div>
  );
};

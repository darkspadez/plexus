import React from 'react';
import { Input } from '../ui/Input';

export interface XaiQuotaConfigProps {
  options: Record<string, unknown>;
  onChange: (options: Record<string, unknown>) => void;
}

export const XaiQuotaConfig: React.FC<XaiQuotaConfigProps> = ({ options, onChange }) => {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="xai-oauth-account"
          className="font-body text-[13px] font-medium text-text-secondary"
        >
          OAuth account (optional)
        </label>
        <Input
          id="xai-oauth-account"
          value={(options.oauthAccountId as string) ?? ''}
          onChange={(e) => onChange({ ...options, oauthAccountId: e.target.value })}
          placeholder="Defaults to this provider's OAuth account"
        />
        <span className="text-[10px] text-text-muted">
          Uses your xAI / Grok OAuth token automatically. xAI does not expose subscription usage or
          credits to the OAuth token, so this checker only reports account health (whether the token
          authenticates and the team is not blocked) plus the number of available models.
        </span>
      </div>
    </div>
  );
};

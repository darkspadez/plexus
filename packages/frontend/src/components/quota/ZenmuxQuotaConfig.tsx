import React from 'react';
import { Input } from '../forms/Input';
import { ExternalLink } from 'lucide-react';

export interface ZenmuxQuotaConfigProps {
  options: Record<string, unknown>;
  onChange: (options: Record<string, unknown>) => void;
}

export const ZenmuxQuotaConfig: React.FC<ZenmuxQuotaConfigProps> = ({ options, onChange }) => {
  const handleChange = (key: string, value: string) => {
    onChange({ ...options, [key]: value });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="zenmux-management-api-key"
          className="text-[13px] font-medium text-foreground-muted"
        >
          Management API Key <span className="text-danger">*</span>
        </label>
        <Input
          id="zenmux-management-api-key"
          type="password"
          value={(options.managementApiKey as string) ?? ''}
          onChange={(e) => handleChange('managementApiKey', e.target.value)}
          placeholder="Enter your Zenmux management API key"
        />
        <span className="text-[10px] text-foreground-muted">
          Required. Use a management API key from{' '}
          <a
            href="https://zenmux.ai/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Zenmux Dashboard <ExternalLink size={10} />
          </a>
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="zenmux-endpoint" className="text-[13px] font-medium text-foreground-muted">
          Endpoint (optional)
        </label>
        <Input
          id="zenmux-endpoint"
          value={(options.endpoint as string) ?? ''}
          onChange={(e) => handleChange('endpoint', e.target.value)}
          placeholder="https://zenmux.ai/api/v1/management/subscription/detail"
        />
        <span className="text-[10px] text-foreground-muted">
          Custom endpoint URL. Defaults to Zenmux's API.
        </span>
      </div>
    </div>
  );
};

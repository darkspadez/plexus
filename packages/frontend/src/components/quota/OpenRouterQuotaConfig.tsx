import React from 'react';
import { Input } from '../ui/Input';
import { ExternalLink } from 'lucide-react';

export interface OpenRouterQuotaConfigProps {
  options: Record<string, unknown>;
  onChange: (options: Record<string, unknown>) => void;
}

export const OpenRouterQuotaConfig: React.FC<OpenRouterQuotaConfigProps> = ({
  options,
  onChange,
}) => {
  const handleChange = (key: string, value: string | number) => {
    onChange({ ...options, [key]: value });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <label className="font-sans text-sm font-medium text-foreground-muted">
          Management API Key <span className="text-danger-text">*</span>
        </label>
        <Input
          type="password"
          value={(options.apiKey as string) ?? ''}
          onChange={(e) => handleChange('apiKey', e.target.value)}
          placeholder="Enter your OpenRouter management key"
        />
        <span className="text-2xs text-foreground-subtle">
          Required. Use a management key from{' '}
          <a
            href="https://openrouter.ai/settings/management-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-text hover:underline inline-flex items-center gap-1"
          >
            OpenRouter Dashboard <ExternalLink size="0.625rem" />
          </a>
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-sans text-sm font-medium text-foreground-muted">
          Endpoint (optional)
        </label>
        <Input
          value={(options.endpoint as string) ?? ''}
          onChange={(e) => handleChange('endpoint', e.target.value)}
          placeholder="https://openrouter.ai/api/v1/credits"
        />
      </div>
    </div>
  );
};

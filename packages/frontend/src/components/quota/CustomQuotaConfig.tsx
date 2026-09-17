import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { testCustomQuotaChecker } from '../../lib/api';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { Switch } from '../ui/Switch';

interface Props {
  checkerId: string;
  provider: string;
  options: Record<string, unknown>;
  onChange: (options: Record<string, unknown>) => void;
}

export function CustomQuotaConfig({ checkerId, provider, options, onChange }: Props) {
  const [optionsText, setOptionsText] = useState(JSON.stringify(options, null, 2));
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setOptionsText(JSON.stringify(options, null, 2));
  }, [options]);

  const updateOptions = (value: string) => {
    setOptionsText(value);
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) onChange(parsed);
    } catch {
      // Wait for valid JSON before updating the provider form.
    }
  };

  const updateOption = (key: string, value: unknown) => {
    onChange({ ...options, [key]: value });
  };

  const endpoint = typeof options.endpoint === 'string' ? options.endpoint : '';
  const authHeader = typeof options.authHeader === 'string' ? options.authHeader : 'Authorization';
  const authPrefix = typeof options.authPrefix === 'string' ? options.authPrefix : 'Bearer';
  const useApiKey = options.useApiKey !== false;
  const configuredHeaders =
    options.headers && typeof options.headers === 'object' && !Array.isArray(options.headers)
      ? JSON.stringify(options.headers, null, 2)
      : '{}';

  const testChecker = async () => {
    setTesting(true);
    setTestMessage(null);
    try {
      const result = await testCustomQuotaChecker(checkerId, provider, options);
      setTestMessage(`Success: ${result.meters.length} meter(s) returned.`);
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          label="Request endpoint"
          value={endpoint}
          onChange={(event) => updateOption('endpoint', event.target.value)}
          placeholder="https://provider.example.com/quota"
        />
        <Input
          label="Authentication header"
          value={authHeader}
          onChange={(event) => updateOption('authHeader', event.target.value)}
          placeholder="Authorization"
        />
        <Input
          label="Authentication prefix"
          value={authPrefix}
          onChange={(event) => updateOption('authPrefix', event.target.value)}
          placeholder="Bearer"
        />
        <div className="flex items-center justify-between gap-3 self-end pb-1">
          <span className="font-sans text-[11px] text-foreground-muted">
            Send the provider API key in this header
          </span>
          <Switch
            checked={useApiKey}
            onChange={(checked) => updateOption('useApiKey', checked)}
            size="sm"
            aria-label="Send the provider API key in this header"
          />
        </div>
      </div>

      <FormField label="Additional request headers (JSON)">
        <textarea
          className="min-h-20 w-full rounded-md border border-border bg-background p-2 font-mono text-[11px] text-foreground outline-none focus:border-accent"
          value={configuredHeaders}
          onChange={(event) => {
            try {
              const parsed = JSON.parse(event.target.value);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                onChange({ ...options, headers: parsed });
              }
            } catch {
              // Wait for valid JSON before updating the provider form.
            }
          }}
          spellCheck={false}
        />
      </FormField>

      <FormField label="Other options (JSON)">
        <textarea
          className="min-h-28 w-full rounded-md border border-border bg-background p-2 font-mono text-[11px] text-foreground outline-none focus:border-accent"
          value={optionsText}
          onChange={(event) => updateOptions(event.target.value)}
          spellCheck={false}
        />
      </FormField>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          isLoading={testing}
          onClick={testChecker}
          leftIcon={<Play size={13} />}
        >
          Test checker
        </Button>
        {testMessage && (
          <span className="font-sans text-[11px] text-foreground-muted">{testMessage}</span>
        )}
      </div>

      <p className="m-0 font-sans text-[11px] italic text-foreground-subtle">
        In checker code, use ctx.fetch(url, init) to apply these settings automatically, or use
        ctx.requestHeaders() with the regular fetch function. The provider API key is inherited from
        the provider above and is never displayed here.
      </p>
    </div>
  );
}

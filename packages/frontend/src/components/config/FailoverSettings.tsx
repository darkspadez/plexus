import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save, Shield } from 'lucide-react';
import { api } from '../../lib/api';
import { useSaveFailoverPolicy } from '../../hooks/queries/useConfig';
import {
  failoverFormSchema,
  toFailoverPayload,
  type FailoverFormValues,
} from '../../pages/config-schemas';
import { Button } from '../ui/Button';
import { SectionCard } from '../ui/SectionCard';
import { Switch } from '../ui/Switch';

export function FailoverSettings() {
  const saveFailover = useSaveFailoverPolicy();

  const { register, handleSubmit, reset, watch, setValue } = useForm<FailoverFormValues>({
    resolver: zodResolver(failoverFormSchema),
    defaultValues: { enabled: true, statusCodesText: '', errorsText: '' },
  });

  const [loaded, setLoaded] = useState(false);
  const enabled = watch('enabled');

  useEffect(() => {
    api.getFailoverPolicy().then((policy) => {
      reset({
        enabled: policy.enabled,
        statusCodesText: policy.retryableStatusCodes.join(', '),
        errorsText: policy.retryableErrors.join(', '),
      });
      setLoaded(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (values: FailoverFormValues) => {
    const payload = toFailoverPayload(values);
    saveFailover.mutate(payload, {
      onSuccess: (updated) => {
        reset({
          enabled: updated.enabled,
          statusCodesText: updated.retryableStatusCodes.join(', '),
          errorsText: updated.retryableErrors.join(', '),
        });
      },
    });
  };

  return (
    <SectionCard
      title="Failover Settings"
      collapsible
      defaultOpen={false}
      extra={
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit(onSubmit)}
          isLoading={saveFailover.isPending}
          disabled={!loaded || saveFailover.isPending}
          leftIcon={<Save size={14} />}
        >
          Save
        </Button>
      }
    >
      <form id="failover-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-accent" />
              <div>
                <p className="font-sans text-[12px] font-medium text-foreground">Enable Failover</p>
                <p className="font-sans text-[11px] text-foreground-subtle">
                  When enabled, failed requests are automatically retried on the next available
                  provider.
                </p>
              </div>
            </div>
            <Switch
              checked={enabled}
              onChange={(checked) => setValue('enabled', checked, { shouldDirty: true })}
              aria-label="Toggle failover on/off"
            />
          </div>

          <div>
            <label
              htmlFor="retryableStatusCodes"
              className="font-sans text-[12px] font-medium text-foreground"
            >
              Retryable Status Codes
            </label>
            <p className="text-xs text-foreground-subtle mb-2">
              HTTP status codes that trigger a retry on the next provider. Enter comma-separated
              values (100–599). Defaults to all non-2xx codes except 413 and 422 when empty.
            </p>
            <textarea
              id="retryableStatusCodes"
              {...register('statusCodesText')}
              placeholder="e.g. 429, 500, 502, 503"
              rows={3}
              className="w-full py-1 px-2 font-mono text-[12px] text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle resize-y"
            />
          </div>

          <div>
            <label
              htmlFor="retryableErrors"
              className="font-sans text-[12px] font-medium text-foreground"
            >
              Retryable Network Errors
            </label>
            <p className="text-xs text-foreground-subtle mb-2">
              Network error codes that trigger a retry on the next provider. Enter comma-separated
              values. Defaults to ECONNREFUSED, ETIMEDOUT, ENOTFOUND when empty.
            </p>
            <textarea
              id="retryableErrors"
              {...register('errorsText')}
              placeholder="e.g. ECONNREFUSED, ETIMEDOUT, ENOTFOUND"
              rows={2}
              className="w-full py-1 px-2 font-mono text-[12px] text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle resize-y"
            />
          </div>
        </div>
      </form>
    </SectionCard>
  );
}

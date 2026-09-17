import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { api } from '../../lib/api';
import { useSaveTimeoutConfig } from '../../hooks/queries/useConfig';
import {
  timeoutFormSchema,
  toTimeoutPayload,
  type TimeoutFormValues,
} from '../../pages/config-schemas';
import { Button } from '../ui/Button';
import { SectionCard } from '../ui/SectionCard';

function formatSeconds(s: number): string {
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

export function TimeoutSettings() {
  const saveTimeout = useSaveTimeoutConfig();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isValid },
  } = useForm<TimeoutFormValues>({
    resolver: zodResolver(timeoutFormSchema),
    defaultValues: { defaultSeconds: 300 },
    mode: 'onChange',
  });

  const [loaded, setLoaded] = useState(false);
  const defaultSecondsWatch = watch('defaultSeconds');

  useEffect(() => {
    api.getTimeoutConfig().then((cfg) => {
      reset({ defaultSeconds: cfg.defaultSeconds });
      setLoaded(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (values: TimeoutFormValues) => {
    const payload = toTimeoutPayload(values);
    saveTimeout.mutate(payload, {
      onSuccess: (updated) => {
        reset({ defaultSeconds: updated.defaultSeconds });
      },
    });
  };

  return (
    <SectionCard
      title="Timeout Settings"
      collapsible
      defaultOpen={false}
      extra={
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit(onSubmit)}
          isLoading={saveTimeout.isPending}
          disabled={!loaded || !isValid || saveTimeout.isPending}
          leftIcon={<Save size={14} />}
        >
          Save
        </Button>
      }
    >
      <form id="timeout-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="timeoutDefaultSeconds"
            className="font-sans text-[12px] font-medium text-foreground"
          >
            Default Timeout (seconds){' '}
            <span className="text-foreground-subtle font-normal">— global default, 1–3600s</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              id="timeoutDefaultSeconds"
              type="number"
              min={1}
              max={3600}
              step={1}
              {...register('defaultSeconds', { valueAsNumber: true })}
              className="w-48 h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
            />
            <span className="text-[11px] text-foreground-subtle tabular-nums">
              {typeof defaultSecondsWatch === 'number' && isFinite(defaultSecondsWatch)
                ? formatSeconds(defaultSecondsWatch)
                : '—'}
            </span>
          </div>
          {errors.defaultSeconds && (
            <span className="text-[11px] text-warning">{errors.defaultSeconds.message}</span>
          )}
        </div>
      </form>
    </SectionCard>
  );
}

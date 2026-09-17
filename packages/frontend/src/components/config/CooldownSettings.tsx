import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { formatMinutesToMinSec } from '@plexus/shared';
import { api } from '../../lib/api';
import { useSaveCooldownPolicy } from '../../hooks/queries/useConfig';
import {
  cooldownFormSchema,
  toCooldownPayload,
  type CooldownFormValues,
} from '../../pages/config-schemas';
import { Button } from '../ui/Button';
import { SectionCard } from '../ui/SectionCard';

export function CooldownSettings() {
  const saveCooldown = useSaveCooldownPolicy();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isValid },
  } = useForm<CooldownFormValues>({
    resolver: zodResolver(cooldownFormSchema),
    defaultValues: { initialMinutes: 2, maxMinutes: 300 },
    mode: 'onChange',
  });

  const [loaded, setLoaded] = useState(false);
  const initialMinutesWatch = watch('initialMinutes');
  const maxMinutesWatch = watch('maxMinutes');

  useEffect(() => {
    api.getCooldownPolicy().then((policy) => {
      reset({ initialMinutes: policy.initialMinutes, maxMinutes: policy.maxMinutes });
      setLoaded(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (values: CooldownFormValues) => {
    const payload = toCooldownPayload(values);
    saveCooldown.mutate(payload, {
      onSuccess: (updated) => {
        reset({ initialMinutes: updated.initialMinutes, maxMinutes: updated.maxMinutes });
      },
    });
  };

  return (
    <SectionCard
      title="Cooldown Settings"
      collapsible
      defaultOpen={false}
      extra={
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit(onSubmit)}
          isLoading={saveCooldown.isPending}
          disabled={!loaded || !isValid || saveCooldown.isPending}
          leftIcon={<Save size={14} />}
        >
          Save
        </Button>
      }
    >
      <form id="cooldown-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="cooldownInitialMinutes"
              className="font-sans text-[12px] font-medium text-foreground"
            >
              Initial Cooldown (min){' '}
              <span className="text-foreground-subtle font-normal">— C₀, first failure</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                id="cooldownInitialMinutes"
                type="number"
                min={0.1}
                step={0.1}
                {...register('initialMinutes', { valueAsNumber: true })}
                className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
              />
              <span className="text-[11px] text-foreground-subtle tabular-nums whitespace-nowrap">
                {typeof initialMinutesWatch === 'number' && isFinite(initialMinutesWatch)
                  ? formatMinutesToMinSec(initialMinutesWatch)
                  : '—'}
              </span>
            </div>
            {errors.initialMinutes && (
              <span className="text-[11px] text-warning">{errors.initialMinutes.message}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="cooldownMaxMinutes"
              className="font-sans text-[12px] font-medium text-foreground"
            >
              Maximum Cooldown (min){' '}
              <span className="text-foreground-subtle font-normal">— C_max, upper limit</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                id="cooldownMaxMinutes"
                type="number"
                min={0.1}
                step={0.1}
                {...register('maxMinutes', { valueAsNumber: true })}
                className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
              />
              <span className="text-[11px] text-foreground-subtle tabular-nums whitespace-nowrap">
                {typeof maxMinutesWatch === 'number' && isFinite(maxMinutesWatch)
                  ? formatMinutesToMinSec(maxMinutesWatch)
                  : '—'}
              </span>
            </div>
            {errors.maxMinutes && (
              <span className="text-[11px] text-warning">{errors.maxMinutes.message}</span>
            )}
          </div>
        </div>
      </form>
    </SectionCard>
  );
}

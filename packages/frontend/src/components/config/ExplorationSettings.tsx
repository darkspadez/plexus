import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Radar, Save } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import {
  useSaveBackgroundExploration,
  useSaveExplorationRates,
} from '../../hooks/queries/useConfig';
import {
  explorationFormSchema,
  toExplorationPayload,
  type ExplorationFormValues,
} from '../../pages/config-schemas';
import { Button } from '../ui/Button';
import { SectionCard } from '../ui/SectionCard';
import { Switch } from '../ui/Switch';

export function ExplorationSettings() {
  const toast = useToast();
  const saveBgExploration = useSaveBackgroundExploration();
  const saveRates = useSaveExplorationRates();
  const isSaving = saveBgExploration.isPending || saveRates.isPending;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<ExplorationFormValues>({
    resolver: zodResolver(explorationFormSchema),
    defaultValues: {
      performanceExplorationRate: 0.05,
      latencyExplorationRate: 0.05,
      e2ePerformanceExplorationRate: 0.05,
      bgEnabled: false,
      stalenessThresholdSeconds: 600,
      workerConcurrency: 2,
    },
    mode: 'onChange',
  });

  const [loaded, setLoaded] = useState(false);
  const bgEnabled = watch('bgEnabled');

  useEffect(() => {
    Promise.all([api.getExplorationRates(), api.getBackgroundExploration()]).then(([rates, bg]) => {
      reset({
        performanceExplorationRate: rates.performanceExplorationRate,
        latencyExplorationRate: rates.latencyExplorationRate,
        e2ePerformanceExplorationRate: rates.e2ePerformanceExplorationRate,
        bgEnabled: bg.enabled,
        stalenessThresholdSeconds: bg.stalenessThresholdSeconds,
        workerConcurrency: bg.workerConcurrency,
      });
      setLoaded(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (values: ExplorationFormValues) => {
    const { bgExploration, rates } = toExplorationPayload(values);

    const tasks: Promise<unknown>[] = [
      saveBgExploration.mutateAsync(bgExploration),
      saveRates.mutateAsync(rates),
    ];

    void Promise.all(tasks)
      .then(async () => {
        const [updatedRates, updatedBg] = await Promise.all([
          api.getExplorationRates(),
          api.getBackgroundExploration(),
        ]);
        reset({
          performanceExplorationRate: updatedRates.performanceExplorationRate,
          latencyExplorationRate: updatedRates.latencyExplorationRate,
          e2ePerformanceExplorationRate: updatedRates.e2ePerformanceExplorationRate,
          bgEnabled: updatedBg.enabled,
          stalenessThresholdSeconds: updatedBg.stalenessThresholdSeconds,
          workerConcurrency: updatedBg.workerConcurrency,
        });
        toast.success('Exploration settings saved');
      })
      .catch(() => {
        // onError handlers on each mutation already display error toasts
      });
  };

  return (
    <SectionCard
      title="Exploration Settings"
      collapsible
      defaultOpen={false}
      extra={
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit(onSubmit)}
          isLoading={isSaving}
          disabled={!loaded || !isValid || isSaving}
          leftIcon={<Save size={14} />}
        >
          Save
        </Button>
      }
    >
      <form id="exploration-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Radar size={16} className="text-accent" />
              <div>
                <p className="font-sans text-[12px] font-medium text-foreground">
                  Background Exploration
                </p>
                <p className="font-sans text-[11px] text-foreground-subtle">
                  Fire background probe requests instead of diverting live traffic. Probes use
                  apiKey=&quot;probe&quot;.
                </p>
              </div>
            </div>
            <Switch
              checked={bgEnabled}
              onChange={(checked) => setValue('bgEnabled', checked, { shouldDirty: true })}
              aria-label="Toggle background exploration on/off"
            />
          </div>

          {bgEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="bgExplorationStaleness"
                  className="font-sans text-[12px] font-medium text-foreground"
                >
                  Staleness Threshold (s){' '}
                  <span className="text-foreground-subtle font-normal">— min 1, default 600</span>
                </label>
                <input
                  id="bgExplorationStaleness"
                  type="number"
                  min={1}
                  step={1}
                  {...register('stalenessThresholdSeconds', { valueAsNumber: true })}
                  className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
                />
                {errors.stalenessThresholdSeconds && (
                  <span className="text-[11px] text-warning">
                    {errors.stalenessThresholdSeconds.message}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="bgExplorationConcurrency"
                  className="font-sans text-[12px] font-medium text-foreground"
                >
                  Worker Concurrency{' '}
                  <span className="text-foreground-subtle font-normal">— 1–16, default 2</span>
                </label>
                <input
                  id="bgExplorationConcurrency"
                  type="number"
                  min={1}
                  max={16}
                  step={1}
                  {...register('workerConcurrency', { valueAsNumber: true })}
                  className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
                />
                {errors.workerConcurrency && (
                  <span className="text-[11px] text-warning">
                    {errors.workerConcurrency.message}
                  </span>
                )}
              </div>
            </div>
          )}

          {!bgEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="performanceExplorationRate"
                  className="font-sans text-[12px] font-medium text-foreground"
                >
                  Performance Rate{' '}
                  <span className="text-foreground-subtle font-normal">— 0–1, default 0.05</span>
                </label>
                <input
                  id="performanceExplorationRate"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  {...register('performanceExplorationRate', { valueAsNumber: true })}
                  className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
                />
                {errors.performanceExplorationRate && (
                  <span className="text-[11px] text-warning">
                    {errors.performanceExplorationRate.message}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="latencyExplorationRate"
                  className="font-sans text-[12px] font-medium text-foreground"
                >
                  Latency Rate{' '}
                  <span className="text-foreground-subtle font-normal">— 0–1, default 0.05</span>
                </label>
                <input
                  id="latencyExplorationRate"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  {...register('latencyExplorationRate', { valueAsNumber: true })}
                  className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
                />
                {errors.latencyExplorationRate && (
                  <span className="text-[11px] text-warning">
                    {errors.latencyExplorationRate.message}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="e2ePerformanceExplorationRate"
                  className="font-sans text-[12px] font-medium text-foreground"
                >
                  E2E Rate{' '}
                  <span className="text-foreground-subtle font-normal">— 0–1, default 0.05</span>
                </label>
                <input
                  id="e2ePerformanceExplorationRate"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  {...register('e2ePerformanceExplorationRate', { valueAsNumber: true })}
                  className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
                />
                {errors.e2ePerformanceExplorationRate && (
                  <span className="text-[11px] text-warning">
                    {errors.e2ePerformanceExplorationRate.message}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </form>
    </SectionCard>
  );
}

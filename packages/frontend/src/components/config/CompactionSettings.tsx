import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import type { CompactionSettings as CompactionConfig } from '../../lib/api';
import { useCompactionConfig, useSaveCompactionConfig } from '../../hooks/queries/useConfig';
import {
  compactionFormSchema,
  toCompactionPayload,
  type CompactionFormRaw,
  type CompactionFormParsed,
} from '../../pages/config-schemas';
import { Button } from '../ui/Button';
import { SectionCard } from '../ui/SectionCard';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';

/** Maps the API shape to the form's raw (string) shape, filling in defaults. */
function compactionSettingsToFormValues(cfg: CompactionConfig): CompactionFormRaw {
  return {
    enabled: cfg.enabled ?? false,
    strategy: cfg.strategy ?? 'native',
    triggerRatio: cfg.triggerRatio != null ? String(cfg.triggerRatio) : '',
    absoluteTriggerTokens:
      cfg.absoluteTriggerTokens != null ? String(cfg.absoluteTriggerTokens) : '',
    minTokens: cfg.minTokens != null ? String(cfg.minTokens) : '',
    protectRecent: cfg.protectRecent != null ? String(cfg.protectRecent) : '',
    native: {
      maxArrayItems: cfg.native?.maxArrayItems != null ? String(cfg.native.maxArrayItems) : '',
      maxStringChars: cfg.native?.maxStringChars != null ? String(cfg.native.maxStringChars) : '',
    },
    headroom: {
      baseUrl: cfg.headroom?.baseUrl ?? '',
      apiKey: cfg.headroom?.apiKey ?? '',
      targetRatio: cfg.headroom?.targetRatio != null ? String(cfg.headroom.targetRatio) : '',
      timeoutMs: cfg.headroom?.timeoutMs != null ? String(cfg.headroom.timeoutMs) : '',
    },
  };
}

export function CompactionSettings() {
  const compactionQuery = useCompactionConfig();
  const saveCompaction = useSaveCompactionConfig();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors, isValid },
  } = useForm<CompactionFormRaw, unknown, CompactionFormParsed>({
    resolver: zodResolver(compactionFormSchema),
    defaultValues: {
      enabled: false,
      strategy: 'native',
      triggerRatio: '',
      absoluteTriggerTokens: '',
      minTokens: '',
      protectRecent: '',
      native: { maxArrayItems: '', maxStringChars: '' },
      headroom: { baseUrl: '', apiKey: '', targetRatio: '', timeoutMs: '' },
    },
    mode: 'onChange',
  });

  const [loaded, setLoaded] = useState(false);
  const enabled = watch('enabled');
  const strategy = watch('strategy');

  useEffect(() => {
    if (compactionQuery.data) {
      reset(compactionSettingsToFormValues(compactionQuery.data));
      setLoaded(true);
    }
  }, [compactionQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (parsed: CompactionFormParsed) => {
    const payload = toCompactionPayload(parsed);
    saveCompaction.mutate(payload, {
      onSuccess: (updated) => {
        reset(compactionSettingsToFormValues(updated));
      },
    });
  };

  return (
    <SectionCard
      title="Context Compaction"
      collapsible
      defaultOpen={false}
      extra={
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit(onSubmit)}
          isLoading={saveCompaction.isPending}
          disabled={!loaded || !isValid || saveCompaction.isPending}
          leftIcon={<Save size={14} />}
        >
          Save
        </Button>
      }
    >
      <form id="compaction-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-sans text-[12px] font-medium text-foreground">Enabled</p>
              <p className="font-sans text-[11px] text-foreground-subtle">
                Automatically compact context when the trigger threshold is reached.
              </p>
            </div>
            <Switch
              checked={enabled}
              onChange={(checked) => setValue('enabled', checked, { shouldDirty: true })}
              aria-label="Toggle context compaction on/off"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="compactionStrategy"
              className="font-sans text-[12px] font-medium text-foreground"
            >
              Strategy
            </label>
            <Controller
              control={control}
              name="strategy"
              render={({ field }) => (
                <Select
                  id="compactionStrategy"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: 'native', label: 'native' },
                    { value: 'headroom', label: 'headroom' },
                  ]}
                  className="w-48"
                />
              )}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="compactionTriggerRatio"
                className="font-sans text-[12px] font-medium text-foreground"
              >
                Trigger Ratio{' '}
                <span className="text-foreground-subtle font-normal">— fraction 0–1</span>
              </label>
              <input
                id="compactionTriggerRatio"
                type="number"
                min={0}
                max={1}
                step={0.01}
                placeholder="e.g. 0.8"
                {...register('triggerRatio')}
                className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
              />
              {errors.triggerRatio && (
                <span className="text-[11px] text-warning">{errors.triggerRatio.message}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="compactionAbsoluteTrigger"
                className="font-sans text-[12px] font-medium text-foreground"
              >
                Absolute Trigger Tokens{' '}
                <span className="text-foreground-subtle font-normal">— empty = off</span>
              </label>
              <input
                id="compactionAbsoluteTrigger"
                type="number"
                min={0}
                step={1}
                placeholder="Disabled"
                {...register('absoluteTriggerTokens')}
                className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
              />
              {errors.absoluteTriggerTokens && (
                <span className="text-[11px] text-warning">
                  {errors.absoluteTriggerTokens.message}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="compactionMinTokens"
                className="font-sans text-[12px] font-medium text-foreground"
              >
                Min Tokens
              </label>
              <input
                id="compactionMinTokens"
                type="number"
                min={0}
                step={1}
                placeholder="e.g. 1000"
                {...register('minTokens')}
                className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
              />
              {errors.minTokens && (
                <span className="text-[11px] text-warning">{errors.minTokens.message}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="compactionProtectRecent"
                className="font-sans text-[12px] font-medium text-foreground"
              >
                Protect Recent (messages)
              </label>
              <input
                id="compactionProtectRecent"
                type="number"
                min={0}
                step={1}
                placeholder="e.g. 4"
                {...register('protectRecent')}
                className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
              />
              {errors.protectRecent && (
                <span className="text-[11px] text-warning">{errors.protectRecent.message}</span>
              )}
            </div>
          </div>

          {strategy === 'native' && (
            <div className="flex flex-col gap-2">
              <p className="font-sans text-[12px] font-medium text-foreground">Native Settings</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="compactionNativeMaxArrayItems"
                    className="font-sans text-[12px] font-medium text-foreground"
                  >
                    Max Array Items
                  </label>
                  <input
                    id="compactionNativeMaxArrayItems"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="e.g. 20"
                    {...register('native.maxArrayItems')}
                    className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
                  />
                  {errors.native?.maxArrayItems && (
                    <span className="text-[11px] text-warning">
                      {errors.native.maxArrayItems.message}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="compactionNativeMaxStringChars"
                    className="font-sans text-[12px] font-medium text-foreground"
                  >
                    Max String Chars
                  </label>
                  <input
                    id="compactionNativeMaxStringChars"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="e.g. 500"
                    {...register('native.maxStringChars')}
                    className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
                  />
                  {errors.native?.maxStringChars && (
                    <span className="text-[11px] text-warning">
                      {errors.native.maxStringChars.message}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {strategy === 'headroom' && (
            <div className="flex flex-col gap-2">
              <p className="font-sans text-[12px] font-medium text-foreground">Headroom Settings</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label
                    htmlFor="compactionHeadroomBaseUrl"
                    className="font-sans text-[12px] font-medium text-foreground"
                  >
                    Base URL
                  </label>
                  <input
                    id="compactionHeadroomBaseUrl"
                    type="text"
                    placeholder="http://localhost:8787"
                    {...register('headroom.baseUrl')}
                    className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
                  />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label
                    htmlFor="compactionHeadroomApiKey"
                    className="font-sans text-[12px] font-medium text-foreground"
                  >
                    API Key
                  </label>
                  <input
                    id="compactionHeadroomApiKey"
                    type="password"
                    placeholder="••••••••"
                    {...register('headroom.apiKey')}
                    className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="compactionHeadroomTargetRatio"
                    className="font-sans text-[12px] font-medium text-foreground"
                  >
                    Target Ratio{' '}
                    <span className="text-foreground-subtle font-normal">— 0–1, empty = off</span>
                  </label>
                  <input
                    id="compactionHeadroomTargetRatio"
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    placeholder="Disabled"
                    {...register('headroom.targetRatio')}
                    className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
                  />
                  {errors.headroom?.targetRatio && (
                    <span className="text-[11px] text-warning">
                      {errors.headroom.targetRatio.message}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="compactionHeadroomTimeoutMs"
                    className="font-sans text-[12px] font-medium text-foreground"
                  >
                    Timeout (ms)
                  </label>
                  <input
                    id="compactionHeadroomTimeoutMs"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="e.g. 30000"
                    {...register('headroom.timeoutMs')}
                    className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
                  />
                  {errors.headroom?.timeoutMs && (
                    <span className="text-[11px] text-warning">
                      {errors.headroom.timeoutMs.message}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </form>
    </SectionCard>
  );
}

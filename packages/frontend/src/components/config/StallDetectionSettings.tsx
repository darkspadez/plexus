import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { api } from '../../lib/api';
import { useSaveStallConfig } from '../../hooks/queries/useConfig';
import {
  stallFormSchema,
  toStallPayload,
  type StallFormRaw,
  type StallFormParsed,
} from '../../pages/config-schemas';
import { Button } from '../ui/Button';
import { SectionCard } from '../ui/SectionCard';

export function StallDetectionSettings() {
  const saveStall = useSaveStallConfig();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<StallFormRaw, unknown, StallFormParsed>({
    resolver: zodResolver(stallFormSchema),
    defaultValues: {
      ttfbSeconds: '',
      ttfbBytes: '100',
      minBytesPerSecond: '',
      windowSeconds: '10',
      gracePeriodSeconds: '30',
    },
    mode: 'onChange',
  });

  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.getStallConfig().then((cfg) => {
      reset({
        ttfbSeconds: cfg.ttfbSeconds != null ? String(cfg.ttfbSeconds) : '',
        ttfbBytes: String(cfg.ttfbBytes),
        minBytesPerSecond: cfg.minBytesPerSecond != null ? String(cfg.minBytesPerSecond) : '',
        windowSeconds: String(cfg.windowSeconds),
        gracePeriodSeconds: String(cfg.gracePeriodSeconds),
      });
      setLoaded(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (parsed: StallFormParsed) => {
    const payload = toStallPayload(parsed);
    saveStall.mutate(payload, {
      onSuccess: (updated) => {
        reset({
          ttfbSeconds: updated.ttfbSeconds != null ? String(updated.ttfbSeconds) : '',
          ttfbBytes: String(updated.ttfbBytes),
          minBytesPerSecond:
            updated.minBytesPerSecond != null ? String(updated.minBytesPerSecond) : '',
          windowSeconds: String(updated.windowSeconds),
          gracePeriodSeconds: String(updated.gracePeriodSeconds),
        });
      },
    });
  };

  return (
    <SectionCard
      title="Stall Detection"
      collapsible
      defaultOpen={false}
      extra={
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit(onSubmit)}
          isLoading={saveStall.isPending}
          disabled={!loaded || !isValid || saveStall.isPending}
          leftIcon={<Save size={14} />}
        >
          Save
        </Button>
      }
    >
      <form id="stall-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="stallTtfbSeconds"
              className="font-sans text-[12px] font-medium text-foreground"
            >
              TTFB Timeout (s){' '}
              <span className="text-foreground-subtle font-normal">— 5–120, empty = off</span>
            </label>
            <input
              id="stallTtfbSeconds"
              type="number"
              min={5}
              max={120}
              step={1}
              placeholder="Disabled"
              {...register('ttfbSeconds')}
              className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
            />
            {errors.ttfbSeconds && (
              <span className="text-[11px] text-warning">{errors.ttfbSeconds.message}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="stallTtfbBytes"
              className="font-sans text-[12px] font-medium text-foreground"
            >
              TTFB Byte Threshold{' '}
              <span className="text-foreground-subtle font-normal">— 50–10,000</span>
            </label>
            <input
              id="stallTtfbBytes"
              type="number"
              min={50}
              max={10000}
              step={1}
              {...register('ttfbBytes')}
              className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
            />
            {errors.ttfbBytes && (
              <span className="text-[11px] text-warning">{errors.ttfbBytes.message}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="stallMinBps"
              className="font-sans text-[12px] font-medium text-foreground"
            >
              Min Bytes/sec{' '}
              <span className="text-foreground-subtle font-normal">— 50–5,000, empty = off</span>
            </label>
            <input
              id="stallMinBps"
              type="number"
              min={50}
              max={5000}
              step={1}
              placeholder="Disabled"
              {...register('minBytesPerSecond')}
              className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
            />
            {errors.minBytesPerSecond && (
              <span className="text-[11px] text-warning">{errors.minBytesPerSecond.message}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="stallWindowSeconds"
              className="font-sans text-[12px] font-medium text-foreground"
            >
              Sliding Window (s) <span className="text-foreground-subtle font-normal">— 3–30</span>
            </label>
            <input
              id="stallWindowSeconds"
              type="number"
              min={3}
              max={30}
              step={1}
              {...register('windowSeconds')}
              className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
            />
            {errors.windowSeconds && (
              <span className="text-[11px] text-warning">{errors.windowSeconds.message}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="stallGraceSeconds"
              className="font-sans text-[12px] font-medium text-foreground"
            >
              Grace Period (s){' '}
              <span className="text-foreground-subtle font-normal">— 0–120, post-TTFB pause</span>
            </label>
            <input
              id="stallGraceSeconds"
              type="number"
              min={0}
              max={120}
              step={1}
              {...register('gracePeriodSeconds')}
              className="w-full h-[27px] py-0 px-2 font-mono text-[12px] leading-none text-foreground bg-surface-sunken border border-border rounded-sm outline-none focus:border-accent placeholder:text-foreground-subtle"
            />
            {errors.gracePeriodSeconds && (
              <span className="text-[11px] text-warning">{errors.gracePeriodSeconds.message}</span>
            )}
          </div>
        </div>
      </form>
    </SectionCard>
  );
}

import { Component, useEffect, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import Editor from '@monaco-editor/react';
import {
  RotateCcw,
  AlertTriangle,
  Download,
  Upload,
  RefreshCw,
  HardDrive,
  Archive,
  Shield,
  Save,
  Radar,
  Network,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import type { CompactionSettings } from '../lib/api';
import { SECTION_NAMES } from '../lib/nav';
import { formatMinutesToMinSec } from '@plexus/shared';
import { useToast } from '../contexts/ToastContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';
import { Select } from '../components/ui/Select';
import { Disclosure } from '../components/ui/Disclosure';
import { EmptyState } from '../components/ui/EmptyState';
import { TagSelect } from '../components/ui/TagSelect';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import type { CardLayout } from '../types/card';
import { DEFAULT_CARD_ORDER, LAYOUT_STORAGE_KEY } from '../types/card';
import { useConfigExport, CONFIG_EXPORT_KEY } from '../hooks/queries/useConfig';
import {
  useSaveFailoverPolicy,
  useSaveCooldownPolicy,
  useSaveTimeoutConfig,
  useSaveStallConfig,
  useCompactionConfig,
  useSaveCompactionConfig,
  useSaveBackgroundExploration,
  useSaveExplorationRates,
  useSaveTrustedProxies,
  useRefreshModelMetadata,
  useBackupDownload,
  useFullBackupDownload,
  useRestoreBackup,
  useResetLogs,
  useRestart,
} from '../hooks/queries/useConfig';
import {
  failoverFormSchema,
  toFailoverPayload,
  cooldownFormSchema,
  toCooldownPayload,
  timeoutFormSchema,
  toTimeoutPayload,
  stallFormSchema,
  toStallPayload,
  compactionFormSchema,
  toCompactionPayload,
  explorationFormSchema,
  toExplorationPayload,
  networkFormSchema,
  toNetworkPayload,
  type FailoverFormValues,
  type CooldownFormValues,
  type TimeoutFormValues,
  type StallFormRaw,
  type StallFormParsed,
  type CompactionFormRaw,
  type CompactionFormParsed,
  type ExplorationFormValues,
  type NetworkFormValues,
} from './config-schemas';

class EditorErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Monaco Editor failed to load:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-[400px] sm:h-[500px] flex items-center justify-center bg-surface/30 text-foreground-muted rounded-md">
          <div className="text-center p-6">
            <AlertTriangle className="mx-auto mb-3 text-warning" size={32} />
            <p className="text-sm font-semibold mb-1">Editor failed to load</p>
            <p className="font-sans text-[11px] text-foreground-subtle">
              {this.state.error.message}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Failover Panel
// ---------------------------------------------------------------------------

const FailoverPanel = () => {
  const saveFailover = useSaveFailoverPolicy();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isDirty },
  } = useForm<FailoverFormValues>({
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
    <Disclosure
      title="Failover Settings"
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
          {/* Enabled toggle */}
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
              onChange={(checked) => {
                setValue('enabled', checked, { shouldDirty: true });
              }}
              aria-label="Toggle failover on/off"
            />
          </div>

          {/* Retryable Status Codes */}
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

          {/* Retryable Errors */}
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
      {/* Suppress unused warning */}
      {isDirty && null}
    </Disclosure>
  );
};

// ---------------------------------------------------------------------------
// Trace Capture Panel
// ---------------------------------------------------------------------------

const TraceCapturePanel = () => {
  const toast = useToast();
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getCaptureTraceOnError()
      .then(({ enabled }) => {
        setEnabled(enabled);
        setLoaded(true);
      })
      .catch((e) => {
        console.error('Failed to load capture-trace-on-error setting:', e);
        toast.error('Failed to load trace capture settings');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async (checked: boolean) => {
    const previous = enabled;
    setEnabled(checked);
    setSaving(true);
    try {
      const { enabled: next } = await api.setCaptureTraceOnError(checked);
      setEnabled(next);
      toast.success(`Capture trace on error ${next ? 'enabled' : 'disabled'}`);
    } catch (e) {
      setEnabled(previous);
      toast.error((e as Error).message, 'Failed to update trace capture settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Disclosure title="Trace Capture" defaultOpen={false}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-accent" />
          <div>
            <p className="font-sans text-[12px] font-medium text-foreground">
              Capture Trace on Error
            </p>
            <p className="font-sans text-[11px] text-foreground-subtle">
              When enabled, debug traces are stored for requests that write to the inference error
              log or trigger a cooldown, even while global debug tracing is off.
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onChange={handleToggle}
          disabled={!loaded || saving}
          aria-label="Toggle capture trace on error"
        />
      </div>
    </Disclosure>
  );
};

// ---------------------------------------------------------------------------
// Cooldown Panel
// ---------------------------------------------------------------------------

const CooldownPanel = () => {
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
    <Disclosure
      title="Cooldown Settings"
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
        <div className="flex flex-col gap-3">
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
        </div>
      </form>
    </Disclosure>
  );
};

// ---------------------------------------------------------------------------
// Timeout Panel
// ---------------------------------------------------------------------------

const TimeoutPanel = () => {
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

  const formatSeconds = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

  return (
    <Disclosure
      title="Timeout Settings"
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
        <div className="flex flex-col gap-3">
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
        </div>
      </form>
    </Disclosure>
  );
};

// ---------------------------------------------------------------------------
// Stall Detection Panel
// ---------------------------------------------------------------------------

const StallPanel = () => {
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
    <Disclosure
      title="Stall Detection"
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
        <div className="flex flex-col gap-3">
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
                Sliding Window (s){' '}
                <span className="text-foreground-subtle font-normal">— 3–30</span>
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
                <span className="text-[11px] text-warning">
                  {errors.gracePeriodSeconds.message}
                </span>
              )}
            </div>
          </div>
        </div>
      </form>
    </Disclosure>
  );
};

// ---------------------------------------------------------------------------
// Context Compaction Panel
// ---------------------------------------------------------------------------

/** Maps the API shape to the form's raw (string) shape, filling in defaults. */
function compactionSettingsToFormValues(cfg: CompactionSettings): CompactionFormRaw {
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

const CompactionPanel = () => {
  const toast = useToast();
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
        toast.success('Compaction settings saved');
      },
    });
  };

  return (
    <Disclosure
      title="Context Compaction"
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
          {/* enabled toggle */}
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

          {/* strategy */}
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

          {/* trigger ratio + absoluteTriggerTokens + minTokens + protectRecent */}
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

          {/* native sub-settings */}
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

          {/* headroom sub-settings */}
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
    </Disclosure>
  );
};

// ---------------------------------------------------------------------------
// Exploration Panel
// ---------------------------------------------------------------------------

const ExplorationPanel = () => {
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

    // Always patch both bg config and rates
    const tasks: Promise<unknown>[] = [
      saveBgExploration.mutateAsync(bgExploration),
      saveRates.mutateAsync(rates!),
    ];

    void Promise.all(tasks)
      .then(async () => {
        // Re-fetch to sync state after save
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
    <Disclosure
      title="Exploration Settings"
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
          {/* Background exploration: master toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Radar size={16} className="text-accent" />
              <div>
                <p className="font-sans text-[12px] font-medium text-foreground">
                  Background Exploration
                </p>
                <p className="font-sans text-[11px] text-foreground-subtle">
                  Fire background probe requests instead of diverting live traffic. Probes use
                  apiKey="probe".
                </p>
              </div>
            </div>
            <Switch
              checked={bgEnabled}
              onChange={(checked) => setValue('bgEnabled', checked, { shouldDirty: true })}
              aria-label="Toggle background exploration on/off"
            />
          </div>

          {/* Background tunables — only rendered when background mode is on */}
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

          {/* Inline rate tunables — only rendered when background mode is off */}
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
    </Disclosure>
  );
};

// ---------------------------------------------------------------------------
// Network Settings Panel
// ---------------------------------------------------------------------------

const NetworkPanel = () => {
  const saveTrustedProxies = useSaveTrustedProxies();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isValid },
  } = useForm<NetworkFormValues>({
    resolver: zodResolver(networkFormSchema),
    defaultValues: { trustedProxies: [] },
  });

  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.getTrustedProxies().then((result) => {
      reset({ trustedProxies: result.trustedProxies });
      setLoaded(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (values: NetworkFormValues) => {
    const payload = toNetworkPayload(values);
    saveTrustedProxies.mutate(payload, {
      onSuccess: (result) => {
        reset({ trustedProxies: result.trustedProxies });
      },
    });
  };

  return (
    <Disclosure
      title="Network Settings"
      defaultOpen={false}
      extra={
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit(onSubmit)}
          isLoading={saveTrustedProxies.isPending}
          disabled={!loaded || !isValid || saveTrustedProxies.isPending}
          leftIcon={<Save size={14} />}
        >
          Save
        </Button>
      }
    >
      <form id="network-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Network size={16} className="text-accent" />
            <div>
              <p className="font-sans text-[12px] font-medium text-foreground">Trusted Proxies</p>
              <p className="font-sans text-[11px] text-foreground-subtle">
                IPs/CIDRs of reverse proxies whose forwarding headers (X-Forwarded-For,
                CF-Connecting-IP, …) are believed when resolving a client&apos;s IP. Requests
                arriving directly from any other address use their real connection IP instead, so
                spoofed headers cannot defeat per-key IP allowlists.
              </p>
            </div>
          </div>

          <div>
            <Controller
              control={control}
              name="trustedProxies"
              render={({ field }) => (
                <TagSelect
                  label="Trusted Proxy IPs"
                  placeholder="e.g. 10.0.0.0/8  172.16.0.0/12  192.168.1.5"
                  options={[]}
                  selected={field.value}
                  allowCustom
                  splitOnSpace
                  onChange={field.onChange}
                />
              )}
            />
            <p className="text-xs text-foreground-subtle mt-2">
              Type entries separated by spaces. The default trust-all list is <code>0.0.0.0/0</code>{' '}
              plus <code>::/0</code> — keep this only if Plexus is not publicly reachable except
              through your proxy. An empty list trusts no proxies. Accepts IPv4/IPv6, CIDR, and
              ranges.
            </p>
          </div>
        </div>
      </form>
    </Disclosure>
  );
};

// ---------------------------------------------------------------------------
// Main Config page
// ---------------------------------------------------------------------------

export const Config = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: configData, isSuccess: isConfigLoaded, isError: isConfigError } = useConfigExport();
  const config = configData ? JSON.stringify(configData, null, 2) : '';

  const restoreInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Action mutations
  const refreshMetadata = useRefreshModelMetadata();
  const backupDownload = useBackupDownload();
  const fullBackupDownload = useFullBackupDownload();
  const restoreBackup = useRestoreBackup();
  const resetLogs = useResetLogs();
  const restart = useRestart();

  const [cardLayout, setCardLayout] = useState<CardLayout>([]);

  // Surface config export load failures
  useEffect(() => {
    if (isConfigError) {
      toast.error('Failed to load config');
    }
  }, [isConfigError]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as CardLayout;
        setCardLayout(parsed);
      } catch {
        console.error('Failed to parse card layout');
      }
    }
  }, []);

  const triggerDownload = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportLayout = () =>
    triggerDownload(
      JSON.stringify(cardLayout, null, 2),
      'plexus-card-layout.json',
      'application/json'
    );

  const handleExportConfig = () =>
    triggerDownload(config, 'plexus-config-export.json', 'application/json');

  const handleImportLayout = () => fileInputRef.current?.click();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content) as CardLayout;

        if (
          Array.isArray(parsed) &&
          parsed.every((item) => typeof item.id === 'string' && typeof item.order === 'number')
        ) {
          const validIds = new Set<string>(DEFAULT_CARD_ORDER);
          const allIdsValid = parsed.every((item: { id: string }) => validIds.has(item.id));
          if (!allIdsValid) {
            toast.error('Invalid card layout: contains unknown card IDs');
            return;
          }

          localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(parsed));
          setCardLayout(parsed);
          toast.success('Card layout imported');
        } else {
          toast.error('Invalid card layout format');
        }
      } catch {
        toast.error('Failed to import: Invalid JSON file');
      }
    };
    reader.readAsText(file);

    event.target.value = '';
  };

  const handleRestoreClick = () => restoreInputRef.current?.click();

  const handleRestoreFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const ok = await toast.confirm({
      title: 'Restore Database?',
      message:
        'This will **replace all existing data** with the contents of the backup file. This action cannot be undone. Are you sure?',
      confirmLabel: 'Restore',
      variant: 'danger',
    });
    if (!ok) return;

    restoreBackup.mutate(file);
  };

  const handleRestart = async () => {
    const ok = await toast.confirm({
      title: 'Restart Plexus?',
      message:
        'This will briefly interrupt all ongoing requests. Are you sure you want to continue?',
      confirmLabel: 'Restart',
      variant: 'danger',
    });
    if (!ok) return;

    restart.mutate();
  };

  const handleResetLogs = async () => {
    const ok = await toast.confirm({
      title: 'Reset All Logs?',
      message:
        'This will **permanently delete all request logs, error logs, and debug trace logs**. Configuration, cooldowns, and settings will not be touched. This action cannot be undone. Are you sure?',
      confirmLabel: 'Reset Logs',
      variant: 'danger',
    });
    if (!ok) return;

    resetLogs.mutate();
  };

  const loadConfig = () => {
    queryClient.invalidateQueries({ queryKey: CONFIG_EXPORT_KEY });
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={SECTION_NAMES['/config']}
        subtitle="View current system configuration (read-only). Use the Providers, Models, and Keys pages to make changes."
      />

      <PageContainer>
        <div className="flex flex-col gap-6">
          {/* ─── Failover Settings ──────────────────────────────────── */}
          <FailoverPanel />

          <TraceCapturePanel />

          {/* ─── Cooldown Settings ──────────────────────────────────── */}
          <CooldownPanel />

          {/* ─── Timeout Settings ───────────────────────────────────── */}
          <TimeoutPanel />

          {/* ─── Stall Detection Settings ────────────────────────────── */}
          <StallPanel />

          {/* ─── Context Compaction Settings ─────────────────────────── */}
          <CompactionPanel />

          {/* ─── Exploration Settings ────────────────────────────────── */}
          <ExplorationPanel />

          {/* ─── Network / Trusted Proxies ──────────────────────────── */}
          <NetworkPanel />

          <Card
            title="Model Metadata"
            extra={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => refreshMetadata.mutate()}
                isLoading={refreshMetadata.isPending}
                leftIcon={<RefreshCw size={14} />}
              >
                Refresh Metadata
              </Button>
            }
          >
            <p className="text-sm text-foreground-muted">
              Catalog metadata for model aliases auto-refreshes every 60 minutes. Use this to
              trigger an immediate reload from OpenRouter, models.dev, and Catwalk.
            </p>
          </Card>

          <Card title="Backup & Restore">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 mr-1">
                <AlertTriangle size={13} className="text-warning shrink-0" />
                <span className="font-sans text-[11px] text-foreground-subtle">
                  Sensitive data — store securely
                </span>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={handleRestoreClick}
                isLoading={restoreBackup.isPending}
                leftIcon={<Upload size={14} />}
              >
                Restore
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fullBackupDownload.mutate()}
                isLoading={fullBackupDownload.isPending}
                leftIcon={<Archive size={14} />}
              >
                Full Backup
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => backupDownload.mutate()}
                isLoading={backupDownload.isPending}
                leftIcon={<HardDrive size={14} />}
              >
                Config Backup
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleResetLogs}
                isLoading={resetLogs.isPending}
                leftIcon={<Trash2 size={14} />}
              >
                Reset All Logs
              </Button>
              <input
                ref={restoreInputRef}
                type="file"
                accept=".json,.tar.gz,.tgz,application/gzip,application/x-gzip,application/octet-stream"
                className="hidden"
                onChange={handleRestoreFileSelect}
              />
            </div>
          </Card>

          <Card
            title="Card Layout"
            extra={
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportLayout}
                  leftIcon={<Download size={14} />}
                >
                  Export
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleImportLayout}
                  leftIcon={<Upload size={14} />}
                >
                  Import
                </Button>
              </div>
            }
          >
            <p className="text-sm text-foreground-muted mb-4">
              Import or export your Live Metrics card layout configuration.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />

            <div>
              <h4 className="font-sans text-xs font-semibold uppercase tracking-wider text-foreground-subtle mb-3">
                Current Card Order
              </h4>
              <div className="flex flex-wrap gap-2">
                {cardLayout.length === 0 && (
                  <EmptyState
                    variant="dense"
                    title="Default layout"
                    description="No card customizations saved — drag dashboard cards to arrange them."
                  />
                )}
                {cardLayout.map((card, index) => (
                  <div
                    key={card.id}
                    className="px-3 py-1.5 bg-surface rounded-md border border-border text-xs text-foreground"
                  >
                    <span className="text-foreground-subtle mr-2">{index + 1}.</span>
                    {card.id}
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* ─── Configuration Snapshot ─────────────────────────────── */}
          <Disclosure
            title="Configuration Snapshot"
            defaultOpen={false}
            extra={
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadConfig}
                  leftIcon={<RotateCcw size={14} />}
                >
                  Refresh
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRestart}
                  isLoading={restart.isPending}
                  leftIcon={<RefreshCw size={14} />}
                >
                  Restart
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportConfig}
                  disabled={!isConfigLoaded}
                  leftIcon={<Download size={14} />}
                >
                  Export JSON
                </Button>
              </div>
            }
          >
            <div className="h-[400px] sm:h-[500px] lg:h-[600px] rounded-sm overflow-hidden">
              <EditorErrorBoundary>
                <Editor
                  height="100%"
                  defaultLanguage="json"
                  value={config}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 13,
                    fontFamily: '"Fira Code", "Fira Mono", monospace',
                  }}
                />
              </EditorErrorBoundary>
            </div>
          </Disclosure>
        </div>
      </PageContainer>
    </div>
  );
};

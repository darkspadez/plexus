import { useState, useEffect } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { DebouncedInput } from '../ui/DebouncedInput';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { Badge } from '../ui/Badge';
import { SectionCard } from '../ui/SectionCard';
import { cn } from '../../lib/cn';
import { GPU_PROFILE_OPTIONS, resolveGpuParams } from '@plexus/shared';
import type { Provider, CompactionSettings } from '../../lib/api';
import { api } from '../../lib/api';

export const KNOWN_ADAPTERS: { value: string; label: string; description: string }[] = [
  {
    value: 'reasoning_content',
    label: 'Reasoning Content',
    description:
      'Maps reasoning ↔ reasoning_content on messages and responses (e.g. Fireworks DeepSeek-R1).',
  },
  {
    value: 'suppress_developer_role',
    label: 'Suppress Developer Role',
    description: 'Rewrites the "developer" role to "system" for providers that do not support it.',
  },
  {
    value: 'model_override',
    label: 'Model Override',
    description:
      'Conditionally rewrites the model name based on request fields (e.g. switching to a -fast variant when reasoning is disabled).',
  },
  {
    value: 'reasoning_rewrite',
    label: 'Reasoning Rewrite',
    description:
      'Rewrites reasoning/thinking fields to provider-specific formats (e.g. enable_thinking, budget_tokens, thinking.type).',
  },
  {
    value: 'web_search_coercion',
    label: 'Web Search Coercion',
    description:
      'Coerces server-side web search tool entries to the format expected by this provider (Anthropic, OpenAI, or OpenRouter).',
  },
];

const WEB_SEARCH_TARGETS = [
  { value: 'anthropic', label: 'Anthropic (web_search_20250305)' },
  { value: 'openai', label: 'OpenAI (web_search)' },
  { value: 'openrouter', label: 'OpenRouter (openrouter:web_search)' },
  { value: 'google', label: 'Google (googleSearch)' },
] as const;

// Mirrors the constant of the same name in useProviderForm — kept local here
// (same pattern as ProviderApiUrlsEditor) since only the API-type list is needed.
const KNOWN_APIS = [
  'chat',
  'messages',
  'gemini',
  'embeddings',
  'transcriptions',
  'speech',
  'images',
  'responses',
  'ollama',
];

const KV_REMOVE_BUTTON_CLASS =
  'inline-flex items-center justify-center h-8 w-8 flex-shrink-0 rounded-md text-foreground-muted hover:text-danger hover:bg-danger-subtle transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background self-end sm:self-auto';

interface Props {
  editingProvider: Provider;
  setEditingProvider: React.Dispatch<React.SetStateAction<Provider>>;
  addKV: (field: 'headers' | 'extraBody') => void;
  updateKV: (field: 'headers' | 'extraBody', oldKey: string, newKey: string, value: any) => void;
  removeKV: (field: 'headers' | 'extraBody', key: string) => void;
  isAdvancedOpen: boolean;
  setIsAdvancedOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isApiBaseUrlsOpen: boolean;
  setIsApiBaseUrlsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isOAuthMode: boolean;
  getApiBaseUrlMap: () => Record<string, string>;
  addAdditionalBaseUrlEntry: () => void;
  updateApiBaseUrlEntry: (oldType: string, newType: string, url: string) => void;
  removeApiBaseUrlEntry: (apiType: string) => void;
}

// Custom Headers / Extra Body Fields — same addKV/updateKV/removeKV semantics (including
// the '': '' insert on add), restyled to mirror ui/KeyValueEditor's visual only.
function KVSection({
  title,
  field,
  entries,
  isOpen,
  setIsOpen,
  addKV,
  updateKV,
  removeKV,
  emptyText,
  keyPlaceholder,
}: {
  title: string;
  field: 'headers' | 'extraBody';
  entries: Record<string, unknown> | undefined;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  addKV: (field: 'headers' | 'extraBody') => void;
  updateKV: (field: 'headers' | 'extraBody', oldKey: string, newKey: string, value: any) => void;
  removeKV: (field: 'headers' | 'extraBody', key: string) => void;
  emptyText: string;
  keyPlaceholder: string;
}) {
  const entryList = Object.entries(entries || {});
  return (
    <SectionCard
      size="sm"
      title={title}
      collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      extra={
        <>
          <Badge status="neutral" noDot>
            {entryList.length}
          </Badge>
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              addKV(field);
              setIsOpen(true);
            }}
          >
            <Plus size={14} />
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {entryList.length === 0 && (
          <div className="font-sans text-[11px] italic text-foreground-muted">{emptyText}</div>
        )}
        {entryList.map(([key, val], idx) => (
          <div key={idx} className="flex flex-col gap-1.5 sm:flex-row">
            <div className="min-w-0 flex-1">
              <DebouncedInput
                placeholder={keyPlaceholder}
                value={key}
                onChange={(newKey: string) => updateKV(field, key, newKey, val)}
              />
            </div>
            <div className="min-w-0 flex-1">
              <DebouncedInput
                placeholder="Value"
                value={typeof val === 'object' ? JSON.stringify(val) : (val as string)}
                onChange={(v: string) => {
                  try {
                    updateKV(field, key, key, JSON.parse(v));
                  } catch {
                    updateKV(field, key, key, v);
                  }
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => removeKV(field, key)}
              aria-label={`Remove ${key}`}
              className={KV_REMOVE_BUTTON_CLASS}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export function ProviderAdvancedEditor({
  editingProvider,
  setEditingProvider,
  addKV,
  updateKV,
  removeKV,
  isAdvancedOpen,
  setIsAdvancedOpen,
  isApiBaseUrlsOpen,
  setIsApiBaseUrlsOpen,
  isOAuthMode,
  getApiBaseUrlMap,
  addAdditionalBaseUrlEntry,
  updateApiBaseUrlEntry,
  removeApiBaseUrlEntry,
}: Props) {
  const [isAdaptersOpen, setIsAdaptersOpen] = useState(false);
  const [isHeadersOpen, setIsHeadersOpen] = useState(false);
  const [isExtraBodyOpen, setIsExtraBodyOpen] = useState(false);
  const [isStallOpen, setIsStallOpen] = useState(false);
  const [isCompactionOpen, setIsCompactionOpen] = useState(false);

  // pi-ai provider dropdown
  const [piProviders, setPiProviders] = useState<string[]>([]);
  const [piProviderCustom, setPiProviderCustom] = useState(false);

  useEffect(() => {
    api
      .getPiProviders()
      .then(setPiProviders)
      .catch(() => {
        /* non-fatal — falls back to custom text input */
      });
  }, []);

  // Determine if the current value is already a known provider or needs custom mode
  useEffect(() => {
    const val = editingProvider.pi_ai_provider;
    if (val && piProviders.length > 0 && !piProviders.includes(val)) {
      setPiProviderCustom(true);
    }
  }, [editingProvider.pi_ai_provider, piProviders]);

  const apiBaseUrlMap = getApiBaseUrlMap();
  const additionalBaseUrlEntries = Object.entries(apiBaseUrlMap).slice(1);
  const adapterEntriesForCount: any[] = editingProvider.adapter ?? [];
  const hasCustomStallOverride =
    editingProvider.stallTtfbMs != null ||
    editingProvider.stallTtfbBytes != null ||
    editingProvider.stallMinBps != null ||
    editingProvider.stallWindowMs != null ||
    editingProvider.stallGracePeriodMs != null;
  const hasCustomCompaction =
    editingProvider.compaction && Object.values(editingProvider.compaction).some((v) => v != null);

  // Cluster 2 (value rows) — extracted so the fields/handlers are defined once
  // and rendered in the two-column value-row grid below.
  const gpuProfileSelect = (
    <Select
      label="GPU Profile"
      value={editingProvider.gpu_profile || ''}
      onChange={(value) => {
        if (!value) {
          const resolved = resolveGpuParams('B200');
          setEditingProvider({
            ...editingProvider,
            gpu_profile: undefined,
            gpu_ram_gb: resolved.ram_gb,
            gpu_bandwidth_tb_s: resolved.bandwidth_tb_s,
            gpu_flops_tflop: resolved.flops_tflop,
            gpu_power_draw_watts: resolved.power_draw_watts,
          });
        } else if (value === 'custom') {
          const resolved = resolveGpuParams('custom', {
            ram_gb: editingProvider.gpu_ram_gb,
            bandwidth_tb_s: editingProvider.gpu_bandwidth_tb_s,
            flops_tflop: editingProvider.gpu_flops_tflop,
            power_draw_watts: editingProvider.gpu_power_draw_watts,
          });
          setEditingProvider({
            ...editingProvider,
            gpu_profile: 'custom',
            gpu_ram_gb: resolved.ram_gb,
            gpu_bandwidth_tb_s: resolved.bandwidth_tb_s,
            gpu_flops_tflop: resolved.flops_tflop,
            gpu_power_draw_watts: resolved.power_draw_watts,
          });
        } else {
          const resolved = resolveGpuParams(value);
          setEditingProvider({
            ...editingProvider,
            gpu_profile: value,
            gpu_ram_gb: resolved.ram_gb,
            gpu_bandwidth_tb_s: resolved.bandwidth_tb_s,
            gpu_flops_tflop: resolved.flops_tflop,
            gpu_power_draw_watts: resolved.power_draw_watts,
          });
        }
      }}
      options={[{ value: '', label: 'Default (B200)' }, ...GPU_PROFILE_OPTIONS]}
    />
  );

  const gpuCustomFields = editingProvider.gpu_profile === 'custom' && (
    <div className="grid grid-cols-1 gap-2 rounded-md border border-border bg-surface-sunken p-2 sm:grid-cols-2 sm:col-span-2">
      <Input
        label="RAM (GB)"
        type="number"
        step="1"
        min="1"
        placeholder="e.g. 80"
        value={editingProvider.gpu_ram_gb || ''}
        onChange={(e) =>
          setEditingProvider({
            ...editingProvider,
            gpu_ram_gb: parseFloat(e.target.value) || undefined,
          })
        }
      />
      <Input
        label="Bandwidth (TB/s)"
        type="number"
        step="0.1"
        min="0.1"
        placeholder="e.g. 3.35"
        value={editingProvider.gpu_bandwidth_tb_s || ''}
        onChange={(e) =>
          setEditingProvider({
            ...editingProvider,
            gpu_bandwidth_tb_s: parseFloat(e.target.value) || undefined,
          })
        }
      />
      <Input
        label="FLOPS (TFLOPs)"
        type="number"
        step="100"
        min="1"
        placeholder="e.g. 4000"
        value={editingProvider.gpu_flops_tflop || ''}
        onChange={(e) =>
          setEditingProvider({
            ...editingProvider,
            gpu_flops_tflop: parseFloat(e.target.value) || undefined,
          })
        }
      />
      <Input
        label="Power (Watts)"
        type="number"
        step="10"
        min="1"
        placeholder="e.g. 700"
        value={editingProvider.gpu_power_draw_watts || ''}
        onChange={(e) =>
          setEditingProvider({
            ...editingProvider,
            gpu_power_draw_watts: parseInt(e.target.value, 10) || undefined,
          })
        }
      />
    </div>
  );

  const discountInput = (
    <Input
      label="Discount"
      hint="e.g. 10 → pays 90%"
      type="number"
      step="1"
      min="0"
      max="100"
      value={Math.round((editingProvider.discount ?? 0) * 100)}
      onChange={(e) => {
        const clamped = Math.min(100, Math.max(0, Number(e.target.value || '0')));
        setEditingProvider({ ...editingProvider, discount: clamped / 100 });
      }}
      trailingAction={
        <span className="pointer-events-none text-[11px] text-foreground-subtle">%</span>
      }
    />
  );

  const timeoutInput = (
    <Input
      label="Timeout"
      hint="1–3600s"
      type="number"
      step="1"
      min="1"
      max="3600"
      placeholder="Global default"
      value={editingProvider.timeoutMs != null ? Math.round(editingProvider.timeoutMs / 1000) : ''}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') {
          setEditingProvider({ ...editingProvider, timeoutMs: undefined });
        } else {
          const seconds = Number(raw);
          if (Number.isFinite(seconds) && seconds >= 1 && seconds <= 3600) {
            setEditingProvider({ ...editingProvider, timeoutMs: seconds * 1000 });
          }
        }
      }}
    />
  );

  const ttfbInput = (
    // TTFB Timeout — moved up from Stall Detection Overrides; same field & handler
    <DebouncedInput
      label="TTFB Timeout (s)"
      hint="5–120"
      type="number"
      placeholder="Global default"
      value={
        editingProvider.stallTtfbMs != null
          ? String(Math.round(editingProvider.stallTtfbMs / 1000))
          : ''
      }
      onChange={(val: string) => {
        const num = Number(val);
        if (val === '') {
          setEditingProvider({ ...editingProvider, stallTtfbMs: undefined });
        } else if (Number.isFinite(num) && num >= 5 && num <= 120) {
          setEditingProvider({ ...editingProvider, stallTtfbMs: num * 1000 });
        }
      }}
    />
  );

  const maxConcurrencyInput = (
    <Input
      label="Max Concurrency"
      hint="across all models"
      type="number"
      step="1"
      min="1"
      placeholder="No limit"
      value={editingProvider.maxConcurrency != null ? editingProvider.maxConcurrency : ''}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') {
          setEditingProvider({ ...editingProvider, maxConcurrency: undefined });
        } else {
          const val = Number(raw);
          if (Number.isFinite(val) && val >= 1) {
            setEditingProvider({ ...editingProvider, maxConcurrency: val });
          }
        }
      }}
    />
  );

  const piAiProviderField = !piProviderCustom ? (
    <Select
      label="pi-ai Provider"
      value={editingProvider.pi_ai_provider ?? ''}
      onChange={(raw) => {
        if (raw === '__custom__') {
          setPiProviderCustom(true);
          return;
        }
        setEditingProvider({
          ...editingProvider,
          pi_ai_provider: raw || undefined,
        });
      }}
      options={[
        { value: '', label: '— none —' },
        ...piProviders.map((p) => ({ value: p, label: p })),
        { value: '__custom__', label: 'custom...' },
      ]}
    />
  ) : (
    <Input
      label="pi-ai Provider"
      type="text"
      placeholder="e.g. anthropic, openai"
      value={editingProvider.pi_ai_provider ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        setEditingProvider({
          ...editingProvider,
          pi_ai_provider: raw || undefined,
        });
      }}
      autoFocus
      trailingAction={
        <button
          type="button"
          className="px-1 font-sans text-[11px] text-foreground-subtle hover:text-foreground"
          title="Back to list"
          onClick={() => setPiProviderCustom(false)}
        >
          ↩
        </button>
      }
    />
  );

  return (
    <SectionCard
      title="Advanced"
      id="section-advanced"
      collapsible
      open={isAdvancedOpen}
      onOpenChange={setIsAdvancedOpen}
    >
      <div className="flex flex-col gap-4">
        {/* Cluster 1: count-disclosures */}
        <div className="flex flex-col gap-2">
          {!isOAuthMode && (
            <SectionCard
              size="sm"
              title="Additional Base URLs"
              collapsible
              open={isApiBaseUrlsOpen}
              onOpenChange={setIsApiBaseUrlsOpen}
              extra={
                <>
                  <Badge status="neutral" noDot>
                    {Math.max(0, additionalBaseUrlEntries.length)}
                  </Badge>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      addAdditionalBaseUrlEntry();
                    }}
                    disabled={Object.keys(getApiBaseUrlMap()).length >= KNOWN_APIS.length}
                  >
                    <Plus size={14} />
                  </Button>
                </>
              }
            >
              <div className="flex flex-col gap-2">
                {additionalBaseUrlEntries.length === 0 && (
                  <div className="font-sans text-[11px] italic text-foreground-muted">
                    No additional base URLs configured.
                  </div>
                )}
                {additionalBaseUrlEntries.map(([apiType, url]) => {
                  const urlLower = typeof url === 'string' ? url.toLowerCase() : '';
                  const hasNativeOllamaPath =
                    urlLower.includes('/api/chat') ||
                    urlLower.includes('/api/generate') ||
                    urlLower.includes('/api/embeddings') ||
                    urlLower.includes('/api/tags');
                  const hasV1Suffix = urlLower.includes('/v1');
                  const showOllamaV1Warning = apiType === 'ollama' && hasV1Suffix;
                  const showChatOllamaWarning =
                    apiType === 'chat' && hasNativeOllamaPath && !hasV1Suffix;
                  return (
                    <div key={apiType} className="flex flex-col gap-1.5">
                      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
                        <div className="w-full shrink-0 sm:w-36">
                          <Select
                            value={apiType}
                            onChange={(value) =>
                              updateApiBaseUrlEntry(
                                apiType,
                                value,
                                typeof url === 'string' ? url : ''
                              )
                            }
                            options={KNOWN_APIS.filter(
                              (t) => t === apiType || !(t in apiBaseUrlMap)
                            ).map((t) => ({ value: t, label: t }))}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <Input
                            placeholder={
                              apiType === 'ollama'
                                ? 'http://localhost:11434'
                                : 'https://api.example.com/v1/...'
                            }
                            value={typeof url === 'string' ? url : ''}
                            onChange={(e) =>
                              updateApiBaseUrlEntry(apiType, apiType, e.target.value)
                            }
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeApiBaseUrlEntry(apiType)}
                          aria-label={`Remove ${apiType}`}
                          className={KV_REMOVE_BUTTON_CLASS}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {showOllamaV1Warning && (
                        <div className="flex items-start gap-2 rounded-sm border border-warning/28 bg-warning-subtle px-2 py-1.5">
                          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                          <span className="text-[11px] text-warning">
                            <span className="font-semibold">native ollama</span> type expects root
                            URL. URLs with <code>/v1</code> are OpenAI-compatible — use{' '}
                            <span className="font-semibold">chat</span> type.
                          </span>
                        </div>
                      )}
                      {showChatOllamaWarning && (
                        <div className="flex items-start gap-2 rounded-sm border border-warning/28 bg-warning-subtle px-2 py-1.5">
                          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                          <span className="text-[11px] text-warning">
                            This URL contains <code>/api/</code> paths typical of native Ollama. Use{' '}
                            <span className="font-semibold">ollama</span> type if native.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          <KVSection
            title="Custom Headers"
            field="headers"
            entries={editingProvider.headers}
            isOpen={isHeadersOpen}
            setIsOpen={setIsHeadersOpen}
            addKV={addKV}
            updateKV={updateKV}
            removeKV={removeKV}
            emptyText="No custom headers configured."
            keyPlaceholder="Header Name"
          />

          <KVSection
            title="Extra Body Fields"
            field="extraBody"
            entries={editingProvider.extraBody}
            isOpen={isExtraBodyOpen}
            setIsOpen={setIsExtraBodyOpen}
            addKV={addKV}
            updateKV={updateKV}
            removeKV={removeKV}
            emptyText="No extra body fields configured."
            keyPlaceholder="Field Name"
          />
        </div>

        <div className="h-px bg-border" />

        {/* Cluster 2: value rows */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          {gpuProfileSelect}
          {gpuCustomFields}
          {discountInput}
          {timeoutInput}
          {ttfbInput}
          {maxConcurrencyInput}
          {piAiProviderField}
        </div>

        <div className="h-px bg-border" />

        {/* Cluster 3: toggle rows */}
        <div className="flex flex-col divide-y divide-border">
          {[
            {
              key: 'estimateTokens',
              label: 'Estimate Tokens',
              description: "Only when provider doesn't return usage data.",
              warning: 'Use sparingly—this is rarely needed.',
              checked: editingProvider.estimateTokens || false,
              onChange: (checked: boolean) =>
                setEditingProvider({ ...editingProvider, estimateTokens: checked }),
            },
            {
              key: 'disableCooldown',
              label: 'Disable Cooldowns',
              description: 'Provider will never be placed on cooldown.',
              warning: 'Use only for providers with reliable external rate-limit handling.',
              checked: editingProvider.disableCooldown || false,
              onChange: (checked: boolean) =>
                setEditingProvider({ ...editingProvider, disableCooldown: checked }),
            },
            {
              key: 'useClaudeMasking',
              label: 'Use Claude Masking',
              description: 'Mask requests as Claude Code CLI sessions. Anthropic only.',
              warning: 'Only effective for Anthropic providers.',
              checked: editingProvider.useClaudeMasking || false,
              onChange: (checked: boolean) =>
                setEditingProvider({ ...editingProvider, useClaudeMasking: checked }),
            },
            {
              key: 'auto_compat',
              label: 'Auto Compat',
              description: 'Use pi-ai registry reasoning and generation compatibility.',
              warning: '',
              checked: editingProvider.auto_compat || false,
              onChange: (checked: boolean) =>
                setEditingProvider({ ...editingProvider, auto_compat: checked }),
            },
          ].map((row) => (
            <div key={row.key} className="h-10 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-sans text-[12px] font-medium text-foreground truncate">
                  {row.label}
                </div>
                <div
                  className="font-sans text-[11px] text-foreground-subtle truncate"
                  title={row.warning ? `${row.description} ${row.warning}` : row.description}
                >
                  {row.description}
                  {row.warning && <span className="ml-1 text-warning">{row.warning}</span>}
                </div>
              </div>
              <Switch aria-label={row.label} checked={row.checked} onChange={row.onChange} />
            </div>
          ))}
        </div>

        <div className="h-px bg-border" />

        {/* Cluster 4: nested sub-disclosures */}
        <div className="flex flex-col gap-2">
          {/* Model Autosync */}
          <SectionCard size="sm" title="Model Autosync">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  aria-label="Enable Model Autosync"
                  checked={editingProvider.modelAutosync?.enabled === true}
                  onChange={(enabled) => {
                    setEditingProvider({
                      ...editingProvider,
                      modelAutosync: {
                        enabled,
                        intervalMinutes: Math.max(
                          1,
                          editingProvider.modelAutosync?.intervalMinutes || 60
                        ),
                      },
                    });
                  }}
                />
                <span className="font-sans text-[12px] font-medium text-foreground-muted">
                  Enable Model Autosync
                </span>
              </div>
              <div className="flex items-center gap-2">
                <DebouncedInput
                  type="number"
                  min={1}
                  step={1}
                  disabled={editingProvider.modelAutosync?.enabled !== true}
                  value={String(editingProvider.modelAutosync?.intervalMinutes || 60)}
                  onChange={(val: string) => {
                    const intervalMinutes = Math.max(1, parseInt(val, 10) || 60);
                    setEditingProvider({
                      ...editingProvider,
                      modelAutosync: {
                        enabled: editingProvider.modelAutosync?.enabled === true,
                        intervalMinutes,
                      },
                    });
                  }}
                  className="w-20"
                />
                <span className="font-sans text-[11px] whitespace-nowrap text-foreground-muted">
                  Sync Interval Minutes
                </span>
              </div>
            </div>
          </SectionCard>

          {/* Provider Adapters — includes Web Search Coercion options */}
          <SectionCard
            size="sm"
            title="Provider Adapters"
            collapsible
            open={isAdaptersOpen}
            onOpenChange={setIsAdaptersOpen}
            extra={
              adapterEntriesForCount.length > 0 && (
                <Badge status="neutral" noDot>
                  {adapterEntriesForCount.length}
                </Badge>
              )
            }
          >
            <div className="flex flex-col gap-2">
              <div className="font-sans text-[11px] leading-snug text-foreground-muted">
                Adapters rewrite requests and responses to fix provider-specific field-name
                incompatibilities. Applied to every model under this provider unless overridden
                per-model.
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {KNOWN_ADAPTERS.filter(
                  (a) =>
                    a.value !== 'model_override' &&
                    a.value !== 'reasoning_rewrite' &&
                    a.value !== 'web_search_coercion'
                ).map((a) => {
                  const adapterEntries: any[] = editingProvider.adapter ?? [];
                  const active = adapterEntries.some(
                    (e: any) => (typeof e === 'string' ? e : e.name) === a.value
                  );
                  return (
                    <label
                      key={a.value}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-sm border border-border px-2 py-1.5',
                        active ? 'bg-surface-elevated' : 'bg-surface'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        className="mt-0.5 shrink-0"
                        onChange={() => {
                          const current: any[] = editingProvider.adapter ?? [];
                          const next = active
                            ? current.filter(
                                (e: any) => (typeof e === 'string' ? e : e.name) !== a.value
                              )
                            : [...current, { name: a.value, options: {} }];
                          setEditingProvider({ ...editingProvider, adapter: next });
                        }}
                      />
                      <div>
                        <div className="font-sans text-[12px] font-medium text-foreground">
                          {a.label}
                        </div>
                        <div className="font-sans text-[11px] leading-snug text-foreground-muted">
                          {a.description}
                        </div>
                      </div>
                    </label>
                  );
                })}

                {/* Web Search Coercion — inline options editor */}
                {(() => {
                  const adapterEntries: any[] = editingProvider.adapter ?? [];
                  const entry = adapterEntries.find(
                    (e: any) => (typeof e === 'string' ? e : e.name) === 'web_search_coercion'
                  );
                  const active = !!entry;
                  const currentTarget: string = entry?.options?.target ?? '';
                  const currentMaxUses: string =
                    entry?.options?.max_uses != null ? String(entry.options.max_uses) : '';

                  const toggleActive = () => {
                    const current: any[] = editingProvider.adapter ?? [];
                    const next = active
                      ? current.filter(
                          (e: any) => (typeof e === 'string' ? e : e.name) !== 'web_search_coercion'
                        )
                      : [
                          ...current,
                          {
                            name: 'web_search_coercion',
                            options: { target: 'openai' },
                          },
                        ];
                    setEditingProvider({ ...editingProvider, adapter: next });
                  };

                  const updateOptions = (patch: Record<string, any>) => {
                    const current: any[] = editingProvider.adapter ?? [];
                    const next = current.map((e: any) => {
                      const name = typeof e === 'string' ? e : e.name;
                      if (name !== 'web_search_coercion') return e;
                      return { name: 'web_search_coercion', options: { ...e.options, ...patch } };
                    });
                    setEditingProvider({ ...editingProvider, adapter: next });
                  };

                  return (
                    <div
                      className={cn(
                        'flex flex-col gap-2 rounded-sm border border-border px-2 py-1.5 sm:col-span-2',
                        active ? 'bg-surface-elevated' : 'bg-surface'
                      )}
                    >
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={active}
                          className="mt-0.5 shrink-0"
                          onChange={toggleActive}
                        />
                        <div>
                          <div className="font-sans text-[12px] font-medium text-foreground">
                            Web Search Coercion
                          </div>
                          <div className="font-sans text-[11px] leading-snug text-foreground-muted">
                            Coerces server-side web search tool entries to the format expected by
                            this provider.
                          </div>
                        </div>
                      </label>

                      {active && (
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex-1 basis-40">
                            <Select
                              label="Target Format"
                              value={currentTarget}
                              onChange={(value) => updateOptions({ target: value })}
                              options={WEB_SEARCH_TARGETS.map((t) => ({
                                value: t.value,
                                label: t.label,
                              }))}
                              placeholder="— select —"
                            />
                          </div>

                          {currentTarget === 'anthropic' && (
                            <div className="flex-none basis-28">
                              <Input
                                label="Max Uses"
                                hint="optional"
                                type="number"
                                min="1"
                                step="1"
                                placeholder="No limit"
                                value={currentMaxUses}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === '') {
                                    // Remove max_uses from options
                                    const current: any[] = editingProvider.adapter ?? [];
                                    const next = current.map((e2: any) => {
                                      const name = typeof e2 === 'string' ? e2 : e2.name;
                                      if (name !== 'web_search_coercion') return e2;
                                      const { max_uses: _removed, ...rest } = e2.options ?? {};
                                      return { name: 'web_search_coercion', options: rest };
                                    });
                                    setEditingProvider({ ...editingProvider, adapter: next });
                                  } else {
                                    const num = parseInt(raw, 10);
                                    if (Number.isFinite(num) && num >= 1) {
                                      updateOptions({ max_uses: num });
                                    }
                                  }
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </SectionCard>

          {/* Stall Detection Overrides — Cooldown on Stall toggle lives in the header */}
          <SectionCard
            size="sm"
            title="Stall Detection Overrides"
            collapsible
            open={isStallOpen}
            onOpenChange={setIsStallOpen}
            extra={
              <>
                <div
                  className="flex items-center gap-1.5"
                  title="When enabled, stall detection cancellations will trigger cooldown for this provider."
                >
                  <Switch
                    aria-label="Cooldown on Stall"
                    checked={editingProvider.stallCooldown || false}
                    onChange={(checked) =>
                      setEditingProvider({ ...editingProvider, stallCooldown: checked })
                    }
                  />
                  <span className="font-sans text-[11px] whitespace-nowrap text-foreground-muted">
                    Cooldown on Stall
                  </span>
                </div>
                {hasCustomStallOverride && (
                  <Badge status="neutral" noDot>
                    Custom
                  </Badge>
                )}
              </>
            }
          >
            <div className="flex flex-col gap-2">
              <div className="font-sans text-[11px] leading-snug text-foreground-muted">
                Override the global stall detection settings for this provider. Leave empty to use
                the global setting for each field.
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <DebouncedInput
                  label="TTFB Byte Threshold"
                  hint="50–10k"
                  type="number"
                  placeholder="Global default"
                  value={
                    editingProvider.stallTtfbBytes != null
                      ? String(editingProvider.stallTtfbBytes)
                      : ''
                  }
                  onChange={(val: string) => {
                    const num = Number(val);
                    if (val === '') {
                      setEditingProvider({ ...editingProvider, stallTtfbBytes: undefined });
                    } else if (Number.isFinite(num) && num >= 50 && num <= 10000) {
                      setEditingProvider({ ...editingProvider, stallTtfbBytes: num });
                    }
                  }}
                />
                <DebouncedInput
                  label="Min Bytes/Sec"
                  hint="50–5k"
                  type="number"
                  placeholder="Global default"
                  value={
                    editingProvider.stallMinBps != null ? String(editingProvider.stallMinBps) : ''
                  }
                  onChange={(val: string) => {
                    const num = Number(val);
                    if (val === '') {
                      setEditingProvider({ ...editingProvider, stallMinBps: undefined });
                    } else if (Number.isFinite(num) && num >= 50 && num <= 5000) {
                      setEditingProvider({ ...editingProvider, stallMinBps: num });
                    }
                  }}
                />
                <DebouncedInput
                  label="Stall Window (s)"
                  hint="3–30"
                  type="number"
                  placeholder="Global default"
                  value={
                    editingProvider.stallWindowMs != null
                      ? String(Math.round(editingProvider.stallWindowMs / 1000))
                      : ''
                  }
                  onChange={(val: string) => {
                    const num = Number(val);
                    if (val === '') {
                      setEditingProvider({ ...editingProvider, stallWindowMs: undefined });
                    } else if (Number.isFinite(num) && num >= 3 && num <= 30) {
                      setEditingProvider({ ...editingProvider, stallWindowMs: num * 1000 });
                    }
                  }}
                />
                <DebouncedInput
                  label="Grace Period (s)"
                  hint="0–120"
                  type="number"
                  placeholder="Global default"
                  value={
                    editingProvider.stallGracePeriodMs != null
                      ? String(Math.round(editingProvider.stallGracePeriodMs / 1000))
                      : ''
                  }
                  onChange={(val: string) => {
                    const num = Number(val);
                    if (val === '') {
                      setEditingProvider({
                        ...editingProvider,
                        stallGracePeriodMs: undefined,
                      });
                    } else if (Number.isFinite(num) && num >= 0 && num <= 120) {
                      setEditingProvider({
                        ...editingProvider,
                        stallGracePeriodMs: num * 1000,
                      });
                    }
                  }}
                />
              </div>
            </div>
          </SectionCard>

          {/* Compaction Override */}
          <SectionCard
            size="sm"
            title="Compaction Override"
            collapsible
            open={isCompactionOpen}
            onOpenChange={setIsCompactionOpen}
            extra={
              hasCustomCompaction && (
                <Badge status="neutral" noDot>
                  Custom
                </Badge>
              )
            }
          >
            <div className="flex flex-col gap-2">
              <div className="font-sans text-[11px] leading-snug text-foreground-muted">
                Override global context-compaction for this provider. Empty = inherit. Nested
                native/headroom settings are configurable on the global Config page only (v1).
              </div>
              <div className="flex flex-col gap-1">
                <Select
                  label="Enabled"
                  value={
                    editingProvider.compaction?.enabled == null
                      ? ''
                      : editingProvider.compaction.enabled
                        ? 'true'
                        : 'false'
                  }
                  onChange={(value) => {
                    const enabled: boolean | undefined =
                      value === '' ? undefined : value === 'true';
                    setEditingProvider({
                      ...editingProvider,
                      compaction: {
                        ...editingProvider.compaction,
                        enabled,
                      } as CompactionSettings,
                    });
                  }}
                  options={[
                    { value: '', label: 'Inherit' },
                    { value: 'true', label: 'On' },
                    { value: 'false', label: 'Off' },
                  ]}
                />
                <span className="text-xs text-foreground-subtle">Inherit / On / Off</span>
              </div>
              <div className="flex flex-col gap-1">
                <Select
                  label="Strategy"
                  value={editingProvider.compaction?.strategy ?? ''}
                  onChange={(value) => {
                    const strategy = (value || undefined) as CompactionSettings['strategy'];
                    setEditingProvider({
                      ...editingProvider,
                      compaction: {
                        ...editingProvider.compaction,
                        strategy,
                      } as CompactionSettings,
                    });
                  }}
                  options={[
                    { value: '', label: 'Inherit' },
                    { value: 'native', label: 'native' },
                    { value: 'headroom', label: 'headroom' },
                  ]}
                />
                <span className="text-xs text-foreground-subtle">native | headroom</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <DebouncedInput
                  label="Trigger Ratio"
                  hint="0–1"
                  type="number"
                  placeholder="Inherit"
                  min={0}
                  max={1}
                  step={0.01}
                  value={
                    editingProvider.compaction?.triggerRatio != null
                      ? String(editingProvider.compaction.triggerRatio)
                      : ''
                  }
                  onChange={(val: string) => {
                    const num = Number(val);
                    const triggerRatio = val === '' || !Number.isFinite(num) ? undefined : num;
                    setEditingProvider({
                      ...editingProvider,
                      compaction: {
                        ...editingProvider.compaction,
                        triggerRatio,
                      } as CompactionSettings,
                    });
                  }}
                />
                <DebouncedInput
                  label="Abs. Trigger Tokens"
                  hint="optional"
                  type="number"
                  placeholder="Inherit"
                  min={0}
                  step={1}
                  value={
                    editingProvider.compaction?.absoluteTriggerTokens != null
                      ? String(editingProvider.compaction.absoluteTriggerTokens)
                      : ''
                  }
                  onChange={(val: string) => {
                    const num = Number(val);
                    const absoluteTriggerTokens =
                      val === '' || !Number.isFinite(num) ? undefined : num;
                    setEditingProvider({
                      ...editingProvider,
                      compaction: {
                        ...editingProvider.compaction,
                        absoluteTriggerTokens,
                      } as CompactionSettings,
                    });
                  }}
                />
                <DebouncedInput
                  label="Min Tokens"
                  type="number"
                  placeholder="Inherit"
                  min={0}
                  step={1}
                  value={
                    editingProvider.compaction?.minTokens != null
                      ? String(editingProvider.compaction.minTokens)
                      : ''
                  }
                  onChange={(val: string) => {
                    const num = Number(val);
                    const minTokens = val === '' || !Number.isFinite(num) ? undefined : num;
                    setEditingProvider({
                      ...editingProvider,
                      compaction: {
                        ...editingProvider.compaction,
                        minTokens,
                      } as CompactionSettings,
                    });
                  }}
                />
                <DebouncedInput
                  label="Protect Recent"
                  type="number"
                  placeholder="Inherit"
                  min={0}
                  step={1}
                  value={
                    editingProvider.compaction?.protectRecent != null
                      ? String(editingProvider.compaction.protectRecent)
                      : ''
                  }
                  onChange={(val: string) => {
                    const num = Number(val);
                    const protectRecent = val === '' || !Number.isFinite(num) ? undefined : num;
                    setEditingProvider({
                      ...editingProvider,
                      compaction: {
                        ...editingProvider.compaction,
                        protectRecent,
                      } as CompactionSettings,
                    });
                  }}
                />
              </div>
            </div>
          </SectionCard>

          {/* Raw Passthrough */}
          <SectionCard
            size="sm"
            title="Raw Passthrough"
            extra={
              <Switch
                aria-label="Enable Raw Passthrough"
                checked={editingProvider.rawPassthrough?.enabled === true}
                onChange={(enabled) =>
                  setEditingProvider({
                    ...editingProvider,
                    rawPassthrough: {
                      enabled,
                      baseUrl: editingProvider.rawPassthrough?.baseUrl || '',
                      auth: editingProvider.rawPassthrough?.auth || 'bearer',
                    },
                  })
                }
              />
            }
          >
            <div className="flex flex-col gap-3">
              <div className="font-sans text-[11px] leading-snug text-foreground-subtle">
                Exposes this provider at{' '}
                <code className="font-mono">/raw/{editingProvider.id || 'provider'}/*</code> to
                explicitly authorized keys. Requests bypass routing and all transformations.
              </div>
              {editingProvider.rawPassthrough?.enabled && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
                  <DebouncedInput
                    label="Raw Upstream Base URL"
                    value={editingProvider.rawPassthrough.baseUrl}
                    placeholder="https://openrouter.ai/api"
                    onChange={(baseUrl) =>
                      setEditingProvider({
                        ...editingProvider,
                        rawPassthrough: { ...editingProvider.rawPassthrough!, baseUrl },
                      })
                    }
                  />
                  <Select
                    label="Provider Authentication"
                    value={editingProvider.rawPassthrough.auth}
                    onChange={(value) =>
                      setEditingProvider({
                        ...editingProvider,
                        rawPassthrough: {
                          ...editingProvider.rawPassthrough!,
                          auth: value as 'bearer' | 'x-api-key' | 'x-goog-api-key',
                        },
                      })
                    }
                    options={[
                      { value: 'bearer', label: 'Authorization: Bearer' },
                      { value: 'x-api-key', label: 'x-api-key' },
                      { value: 'x-goog-api-key', label: 'x-goog-api-key' },
                    ]}
                  />
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </SectionCard>
  );
}

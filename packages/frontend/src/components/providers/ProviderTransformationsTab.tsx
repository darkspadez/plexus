import { useState } from 'react';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { DebouncedInput } from '../ui/DebouncedInput';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { SectionCard } from '../ui/SectionCard';
import { cn } from '../../lib/cn';
import { GPU_PROFILE_OPTIONS, resolveGpuParams } from '@plexus/shared';
import type { CompactionSettings } from '../../lib/api';
import { ToggleRow } from './ToggleRow';
import { KVSection, NotConfigured } from './KVSection';
import type { ProviderFormApi } from '../../hooks/useProviderForm';

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

export function ProviderTransformationsTab({ f }: { f: ProviderFormApi }) {
  const [isAdaptersOpen, setIsAdaptersOpen] = useState(false);
  const [isHeadersOpen, setIsHeadersOpen] = useState(false);
  const [isExtraBodyOpen, setIsExtraBodyOpen] = useState(false);
  const [isCompactionOpen, setIsCompactionOpen] = useState(false);
  const { editingProvider, setEditingProvider } = f;

  const adapterEntriesForCount: any[] = editingProvider.adapter ?? [];
  const hasCustomCompaction =
    editingProvider.compaction && Object.values(editingProvider.compaction).some((v) => v != null);

  return (
    <div className="flex flex-col gap-3">
      <SectionCard title="Compatibility">
        <div className="flex flex-col divide-y divide-border">
          <ToggleRow
            label="Auto Compat"
            description="Use pi-ai registry reasoning and generation compatibility."
            checked={editingProvider.auto_compat || false}
            onChange={(checked) => setEditingProvider({ ...editingProvider, auto_compat: checked })}
          />
          <ToggleRow
            label="Estimate Tokens"
            description="Only when provider doesn't return usage data."
            warning="Use sparingly—this is rarely needed."
            checked={editingProvider.estimateTokens || false}
            onChange={(checked) =>
              setEditingProvider({ ...editingProvider, estimateTokens: checked })
            }
          />
          <ToggleRow
            label="Use Claude Masking"
            description="Mask requests as Claude Code CLI sessions. Anthropic only."
            warning="Only effective for Anthropic providers."
            checked={editingProvider.useClaudeMasking || false}
            onChange={(checked) =>
              setEditingProvider({ ...editingProvider, useClaudeMasking: checked })
            }
          />
          <ToggleRow
            label="Gemini Thinking"
            description="Enable thinking support when routing to this provider's Gemini API."
            warning="Gemini API types only."
            checked={editingProvider.geminiThinkingEnabled || false}
            onChange={(checked) =>
              setEditingProvider({ ...editingProvider, geminiThinkingEnabled: checked })
            }
          />
        </div>
      </SectionCard>

      <SectionCard title="GPU & Cost">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
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
          {editingProvider.gpu_profile === 'custom' && (
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
          )}
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
          adapterEntriesForCount.length > 0 ? (
            <Badge status="neutral" noDot>
              {adapterEntriesForCount.length}
            </Badge>
          ) : (
            <NotConfigured />
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
                        Coerces server-side web search tool entries to the format expected by this
                        provider.
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

      <KVSection
        title="Custom Headers"
        field="headers"
        entries={editingProvider.headers}
        isOpen={isHeadersOpen}
        setIsOpen={setIsHeadersOpen}
        addKV={f.addKV}
        updateKV={f.updateKV}
        removeKV={f.removeKV}
        emptyText="No custom headers configured."
        keyPlaceholder="Header Name"
      />

      <KVSection
        title="Extra Body Fields"
        field="extraBody"
        entries={editingProvider.extraBody}
        isOpen={isExtraBodyOpen}
        setIsOpen={setIsExtraBodyOpen}
        addKV={f.addKV}
        updateKV={f.updateKV}
        removeKV={f.removeKV}
        emptyText="No extra body fields configured."
        keyPlaceholder="Field Name"
      />

      {/* Compaction Override */}
      <SectionCard
        size="sm"
        title="Compaction Override"
        collapsible
        open={isCompactionOpen}
        onOpenChange={setIsCompactionOpen}
        extra={
          hasCustomCompaction ? (
            <Badge status="neutral" noDot>
              Custom
            </Badge>
          ) : (
            <NotConfigured />
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
                const enabled: boolean | undefined = value === '' ? undefined : value === 'true';
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
                const absoluteTriggerTokens = val === '' || !Number.isFinite(num) ? undefined : num;
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
  );
}

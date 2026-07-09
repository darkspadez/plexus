import { useState, useEffect } from 'react';
import { Plus, Play, Loader2, CheckCircle, XCircle, Trash2, X, Download, Info } from 'lucide-react';
import { CopyButton } from '../ui/CopyButton';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { SectionCard } from '../ui/SectionCard';
import { OpenRouterSlugInput } from '../ui/OpenRouterSlugInput';
import { DebouncedInput } from '../ui/DebouncedInput';
import { Tooltip } from '../ui/Tooltip';
import { cn } from '../../lib/cn';
import type { Provider } from '../../lib/api';
import { api } from '../../lib/api';
import { KNOWN_ADAPTERS } from './ProviderAdvancedEditor';
import { apiAccessToKey, hasApiAccess, toggleApiAccess } from '../../lib/apiFormats';

const API_ACCESS_OPTIONS = [
  { type: 'chat', label: 'chat' },
  { type: 'messages', label: 'messages' },
  { type: 'gemini', label: 'gemini' },
  { type: 'responses', label: 'responses' },
  { type: 'ollama', label: 'ollama' },
] as const;

const GPT5_SUPPRESSION_ADAPTER = 'suppress_unsupported_gpt5_options';

function isGpt5Model(modelId: string): boolean {
  return /^gpt-5(?:[.-]|$)/i.test(modelId);
}

// Bespoke per-API brand colors — not part of the design-token palette, so these
// stay as arbitrary-value Tailwind classes rather than semantic tokens.
const getApiBadgeClass = (apiType: string): string => {
  switch (apiType.toLowerCase()) {
    case 'messages':
      return 'bg-[#D97757] text-white border-none';
    case 'chat':
      return 'bg-[#ebebeb] text-[#333] border-none';
    case 'gemini':
      return 'bg-[#5084ff] text-white border-none';
    case 'embeddings':
      return 'bg-[#10b981] text-white border-none';
    case 'transcriptions':
      return 'bg-[#a855f7] text-white border-none';
    case 'speech':
      return 'bg-[#f97316] text-white border-none';
    case 'images':
      return 'bg-[#d946ef] text-white border-none';
    case 'responses':
      return 'bg-[#06b6d4] text-white border-none';
    case 'ollama':
      return 'bg-[#1a5f7a] text-white border-none';
    default:
      return '';
  }
};

// Consistent compact field class used everywhere in the model editor
const FIELD_CLS =
  'w-full h-[27px] py-0 px-2 font-sans text-[12px] leading-none text-foreground bg-surface border border-border rounded-sm outline-none focus:border-accent';

// ── ModelIdInputCompact ──
function ModelIdInputCompact({
  modelId,
  onCommit,
}: {
  modelId: string;
  onCommit: (oldId: string, newId: string) => void;
}) {
  const [draftId, setDraftId] = useState(modelId);
  useEffect(() => {
    setDraftId(modelId);
  }, [modelId]);
  const commit = () => {
    if (!draftId || draftId === modelId) return;
    onCommit(modelId, draftId);
  };
  return (
    <input
      className={FIELD_CLS}
      value={draftId}
      onChange={(e) => setDraftId(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

interface Props {
  editingProvider: Provider;
  setEditingProvider: React.Dispatch<React.SetStateAction<Provider>>;
  isModelsOpen: boolean;
  setIsModelsOpen: (v: boolean) => void;
  openModelIdx: string | null;
  setOpenModelIdx: (v: string | null) => void;
  isModelExtraBodyOpen: Record<string, boolean>;
  setIsModelExtraBodyOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  testStates: Record<
    string,
    {
      loading: boolean;
      result?: 'success' | 'error';
      message?: string;
      showResult: boolean;
      showMessage?: boolean;
    }
  >;
  onDismissTestMessage: (testKey: string) => void;
  addModel: () => void;
  updateModelId: (oldId: string, newId: string) => void;
  updateModelConfig: (modelId: string, updates: any) => void;
  removeModel: (modelId: string) => void;
  addModelKV: (modelId: string) => void;
  updateModelKV: (modelId: string, oldKey: string, newKey: string, value: any) => void;
  removeModelKV: (modelId: string, key: string) => void;
  onOpenFetchModels: () => void;
  onTestModel: (providerId: string, modelId: string, modelType?: string) => void;
  getApiBaseUrlMap: () => Record<string, string>;
  isNewProvider: boolean;
}

export function ProviderModelsEditor({
  editingProvider,
  setEditingProvider: _setEditingProvider,
  isModelsOpen,
  setIsModelsOpen,
  openModelIdx,
  setOpenModelIdx,
  isModelExtraBodyOpen,
  setIsModelExtraBodyOpen,
  testStates,
  addModel,
  updateModelId,
  updateModelConfig,
  removeModel,
  addModelKV,
  updateModelKV,
  removeModelKV,
  onOpenFetchModels,
  onTestModel,
  onDismissTestMessage,
  getApiBaseUrlMap,
  isNewProvider,
}: Props) {
  const [modelAdaptersOpen, setModelAdaptersOpen] = useState<Record<string, boolean>>({});
  const [modelAdvancedOpen, setModelAdvancedOpen] = useState<Record<string, boolean>>({});

  // pi-ai model dropdown state — shared across all models (same provider)
  const [piModels, setPiModels] = useState<
    Array<{ id: string; name: string; api: string; custom: boolean }>
  >([]);
  const [piModelCustom, setPiModelCustom] = useState<Record<string, boolean>>({});

  const piAiProvider = editingProvider.pi_ai_provider;

  useEffect(() => {
    if (!piAiProvider) {
      setPiModels([]);
      return;
    }
    api
      .getPiModels(piAiProvider)
      .then(setPiModels)
      .catch(() => setPiModels([]));
  }, [piAiProvider]);

  // When models load, mark any existing model IDs that aren't in the registry as custom
  useEffect(() => {
    if (piModels.length === 0) return;
    const modelIds = new Set(piModels.map((m) => m.id));
    const models = editingProvider.models as Record<string, any> | undefined;
    if (!models) return;
    const updates: Record<string, boolean> = {};
    for (const [mId, mCfg] of Object.entries(models)) {
      const piId = (mCfg as any).pi_ai_model_id;
      if (piId && !modelIds.has(piId)) {
        updates[mId] = true;
      }
    }
    if (Object.keys(updates).length > 0) {
      setPiModelCustom((prev) => ({ ...prev, ...updates }));
    }
  }, [piModels, editingProvider.models]);

  const modelCount = Object.keys(editingProvider.models || {}).length;

  return (
    <SectionCard
      title="Provider Models"
      id="section-models"
      collapsible
      open={isModelsOpen}
      onOpenChange={setIsModelsOpen}
      bodyClassName="bg-surface-sunken"
      extra={
        <>
          <Badge status="success">{modelCount} Models</Badge>
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFetchModels();
            }}
            leftIcon={<Download size={14} />}
          >
            Fetch Models
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <Button variant="secondary" size="sm" leftIcon={<Plus size={14} />} onClick={addModel}>
          Add Model
        </Button>
        {Object.entries(editingProvider.models || {}).map(([mId, mCfg]: [string, any]) => {
          const testKey = `${editingProvider.id}-${mId}`;
          const testState = testStates[testKey];

          return (
            <SectionCard
              key={mId}
              size="sm"
              collapsible
              open={openModelIdx === mId}
              onOpenChange={(open) => setOpenModelIdx(open ? mId : null)}
              title={mId}
              bodyClassName="flex flex-col gap-1.5"
              extra={
                <>
                  {openModelIdx !== mId &&
                    testState?.showMessage &&
                    testState.result === 'error' &&
                    testState.message && (
                      <Badge status="danger" title={testState.message}>
                        Error
                      </Badge>
                    )}
                  <div
                    onClick={(e) => {
                      if (isNewProvider) return;
                      e.stopPropagation();
                      onTestModel(editingProvider.id, mId, mCfg.type);
                    }}
                    className={
                      isNewProvider
                        ? 'flex items-center cursor-not-allowed opacity-40'
                        : 'flex items-center cursor-pointer'
                    }
                    title={
                      isNewProvider ? 'Save the provider first to probe models' : 'Test this model'
                    }
                  >
                    {testState?.loading ? (
                      <Loader2 size={14} className="animate-spin text-foreground-muted" />
                    ) : testState?.showResult && testState.result === 'success' ? (
                      <CheckCircle size={14} className="text-success" />
                    ) : testState?.showResult && testState.result === 'error' ? (
                      <XCircle size={14} className="text-danger" />
                    ) : (
                      <Play size={14} className="text-accent opacity-60" />
                    )}
                  </div>
                  <CopyButton value={`direct/${editingProvider.id}/${mId}`} size="sm" />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeModel(mId);
                    }}
                    aria-label={`Remove model ${mId}`}
                    className="text-danger p-0.5"
                  >
                    <X size={12} />
                  </Button>
                </>
              }
            >
              {testState?.showMessage && testState.result === 'error' && testState.message && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismissTestMessage(testKey);
                  }}
                  className="cursor-pointer rounded border border-danger/30 bg-danger/10 px-2 py-1"
                  title="Click to dismiss"
                >
                  <span className="text-[11px] italic text-danger">{testState.message} [×]</span>
                </div>
              )}

              {/* 2-column primary layout: left = meta, right = pricing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start">
                {/* Left: Model ID + Type + Access Via + pi-ai Model ID */}
                <div className="flex flex-col gap-1.5">
                  {/* Compact Model ID — bypasses Input component's py-2 */}
                  <div className="flex flex-col gap-1">
                    <label className="font-sans text-[11px] font-medium text-foreground-muted">
                      Model ID
                    </label>
                    <ModelIdInputCompact modelId={mId} onCommit={updateModelId} />
                  </div>
                  <Select
                    label="Model Type"
                    value={mCfg.type || 'text'}
                    onChange={(value) => {
                      const newType = value as
                        | 'text'
                        | 'embeddings'
                        | 'transcriptions'
                        | 'speech'
                        | 'image';
                      if (newType === 'embeddings')
                        updateModelConfig(mId, {
                          type: newType,
                          access_via: ['embeddings'],
                        });
                      else if (newType === 'transcriptions')
                        updateModelConfig(mId, {
                          type: newType,
                          access_via: ['transcriptions'],
                        });
                      else if (newType === 'speech')
                        updateModelConfig(mId, { type: newType, access_via: ['speech'] });
                      else if (newType === 'image')
                        updateModelConfig(mId, { type: newType, access_via: ['images'] });
                      else updateModelConfig(mId, { type: newType });
                    }}
                    options={[
                      { value: 'text', label: 'Text' },
                      { value: 'embeddings', label: 'Embeddings' },
                      { value: 'transcriptions', label: 'Transcriptions' },
                      { value: 'speech', label: 'Speech' },
                      { value: 'image', label: 'Image' },
                    ]}
                  />

                  {(!mCfg.type || mCfg.type === 'text') && (
                    <div className="flex flex-col gap-1">
                      <label className="font-sans text-[11px] font-medium text-foreground-muted">
                        Access Via
                      </label>
                      <div className="flex flex-wrap gap-1 justify-start">
                        {API_ACCESS_OPTIONS.map((option) => {
                          const key = apiAccessToKey(option);
                          const selected = hasApiAccess(mCfg.access_via, key);
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <label className="flex cursor-pointer items-center gap-[3px]">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => {
                                    let next = toggleApiAccess(mCfg.access_via, option);
                                    if (key === 'responses' && selected) {
                                      next = next.filter(
                                        (entry) => apiAccessToKey(entry) !== 'responses:lite'
                                      );
                                    }
                                    updateModelConfig(mId, { access_via: next });
                                  }}
                                />
                                <span
                                  className={cn(
                                    'inline-flex items-center rounded-xl px-1.5 py-0.5 text-[10px] font-medium',
                                    getApiBadgeClass(option.type),
                                    selected ? 'opacity-100' : 'opacity-50'
                                  )}
                                >
                                  {option.label}
                                </span>
                              </label>
                              {key === 'responses' && selected && (
                                <div className="flex items-center gap-1">
                                  <label className="flex cursor-pointer items-center gap-1.5 font-sans text-[11px] text-foreground-muted">
                                    <input
                                      type="checkbox"
                                      checked={hasApiAccess(mCfg.access_via, 'responses:lite')}
                                      onChange={() => {
                                        const next = toggleApiAccess(mCfg.access_via, {
                                          type: 'responses',
                                          subtype: 'lite',
                                        });
                                        updateModelConfig(mId, { access_via: next });
                                      }}
                                    />
                                    <span>Lite</span>
                                  </label>
                                  <Tooltip
                                    position="top"
                                    content={
                                      <div className="w-64 whitespace-normal font-sans leading-relaxed">
                                        Passes Codex-specific Responses input through unchanged,
                                        including additional tools. Enable only for targets known
                                        to support Responses Lite—usually direct OpenAI or Codex
                                        endpoints. Most OpenAI-compatible proxies do not support
                                        it.
                                      </div>
                                    }
                                  >
                                    <button
                                      type="button"
                                      aria-label="About Responses Lite"
                                      className="flex h-4 w-4 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                                    >
                                      <Info size={12} />
                                    </button>
                                  </Tooltip>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {(!mCfg.access_via || mCfg.access_via.length === 0) && (
                        <span className="font-sans text-[11px] text-foreground-subtle italic">
                          empty = use any provider API
                        </span>
                      )}
                      {(() => {
                        const providerBaseUrlMap = getApiBaseUrlMap();
                        const hasOllamaBaseUrl = Object.entries(providerBaseUrlMap).some(
                          ([type, url]) => type === 'ollama' && url && url.trim() !== ''
                        );
                        if (hasOllamaBaseUrl && !hasApiAccess(mCfg.access_via, 'ollama')) {
                          return (
                            <div className="flex items-start gap-2 py-1.5 px-2 bg-info/10 border border-info/30 rounded-sm">
                              <Info size={14} className="text-info shrink-0 mt-0.5" />
                              <span className="text-[11px] text-info">
                                Provider has a native Ollama URL — select{' '}
                                <span className="font-semibold">ollama</span> above to use it.
                              </span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}

                  {/* pi-ai Model ID */}
                  {piAiProvider && piModels.length > 0 && !piModelCustom[mId] ? (
                    <Select
                      label="pi-ai Model ID"
                      value={mCfg.pi_ai_model_id ?? ''}
                      onChange={(raw) => {
                        if (raw === '__custom__') {
                          setPiModelCustom((prev) => ({ ...prev, [mId]: true }));
                          return;
                        }
                        updateModelConfig(mId, {
                          pi_ai_model_id: raw || undefined,
                        });
                      }}
                      options={[
                        { value: '', label: '— none —' },
                        ...piModels.map((m) => ({
                          value: m.id,
                          label: `${m.id}${m.custom ? ' (custom)' : ''}`,
                        })),
                        { value: '__custom__', label: 'custom...' },
                      ]}
                    />
                  ) : (
                    <Input
                      label="pi-ai Model ID"
                      type="text"
                      placeholder="e.g. gpt-4.1, claude-opus-4-6"
                      value={mCfg.pi_ai_model_id ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        updateModelConfig(mId, {
                          pi_ai_model_id: raw || undefined,
                        });
                      }}
                      autoFocus={!!piModelCustom[mId]}
                      trailingAction={
                        piAiProvider && piModels.length > 0 && piModelCustom[mId] ? (
                          <button
                            type="button"
                            className="font-sans text-[11px] text-foreground-subtle hover:text-foreground px-1 flex-shrink-0"
                            title="Back to list"
                            onClick={() => setPiModelCustom((prev) => ({ ...prev, [mId]: false }))}
                          >
                            ↩
                          </button>
                        ) : undefined
                      }
                    />
                  )}
                </div>

                {/* Right: Pricing Source + Pricing Inputs */}
                <div className="flex flex-col gap-1.5">
                  <Select
                    label="Pricing Source"
                    value={mCfg.pricing?.source || 'simple'}
                    onChange={(value) => {
                      const newSource = value;
                      let newPricing: any;
                      if (newSource === 'simple')
                        newPricing = {
                          source: 'simple',
                          input: mCfg.pricing?.input || 0,
                          output: mCfg.pricing?.output || 0,
                          cached: mCfg.pricing?.cached || 0,
                          cache_write: mCfg.pricing?.cache_write || 0,
                        };
                      else if (newSource === 'openrouter')
                        newPricing = {
                          source: 'openrouter',
                          slug: mCfg.pricing?.slug || '',
                          ...(mCfg.pricing?.discount !== undefined && {
                            discount: mCfg.pricing.discount,
                          }),
                        };
                      else if (newSource === 'defined')
                        newPricing = {
                          source: 'defined',
                          range: mCfg.pricing?.range || [],
                        };
                      else if (newSource === 'per_request')
                        newPricing = {
                          source: 'per_request',
                          amount: mCfg.pricing?.amount || 0,
                        };
                      updateModelConfig(mId, { pricing: newPricing });
                    }}
                    options={[
                      { value: 'simple', label: 'Simple' },
                      { value: 'openrouter', label: 'OpenRouter' },
                      { value: 'defined', label: 'Ranges (Complex)' },
                      { value: 'per_request', label: 'Per Request (Flat Fee)' },
                    ]}
                  />

                  {/* Simple pricing */}
                  {mCfg.pricing?.source === 'simple' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-surface-sunken p-2 rounded-sm">
                      {[
                        { label: 'Input $/M', key: 'input' },
                        { label: 'Output $/M', key: 'output' },
                        { label: 'Cached $/M', key: 'cached' },
                        { label: 'Cache Write $/M', key: 'cache_write' },
                      ].map(({ label, key }) => (
                        <Input
                          key={key}
                          label={label}
                          type="number"
                          step="0.000001"
                          value={(mCfg.pricing as any)[key] || 0}
                          onChange={(e) =>
                            updateModelConfig(mId, {
                              pricing: {
                                ...mCfg.pricing,
                                [key]: parseFloat(e.target.value),
                              },
                            })
                          }
                        />
                      ))}
                    </div>
                  )}

                  {/* OpenRouter pricing */}
                  {mCfg.pricing?.source === 'openrouter' && (
                    <div className="flex flex-col gap-1.5 bg-surface-sunken p-2 rounded-sm">
                      <OpenRouterSlugInput
                        label="OpenRouter Model Slug"
                        placeholder="e.g. anthropic/claude-3.5-sonnet"
                        value={mCfg.pricing.slug || ''}
                        onChange={(value) =>
                          updateModelConfig(mId, {
                            pricing: { ...mCfg.pricing, slug: value },
                          })
                        }
                      />
                      <Input
                        label="Discount (0.1 = 10% off)"
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={mCfg.pricing.discount ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            const { discount, ...rest } = mCfg.pricing;
                            updateModelConfig(mId, { pricing: rest });
                          } else
                            updateModelConfig(mId, {
                              pricing: { ...mCfg.pricing, discount: parseFloat(val) },
                            });
                        }}
                      />
                    </div>
                  )}

                  {/* Defined/ranges pricing */}
                  {mCfg.pricing?.source === 'defined' && (
                    <div className="flex flex-col gap-2 bg-surface-sunken p-2 rounded-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-sans text-[11px] font-medium text-foreground-muted">
                          Pricing Ranges
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const currentRanges = mCfg.pricing.range || [];
                            updateModelConfig(mId, {
                              pricing: {
                                ...mCfg.pricing,
                                range: [
                                  ...currentRanges,
                                  {
                                    lower_bound: 0,
                                    upper_bound: 0,
                                    input_per_m: 0,
                                    output_per_m: 0,
                                    cache_write_per_m: 0,
                                  },
                                ],
                              },
                            });
                          }}
                          leftIcon={<Plus size={14} />}
                        >
                          Add Range
                        </Button>
                      </div>
                      {(mCfg.pricing.range || []).map((range: any, idx: number) => (
                        <div
                          key={idx}
                          className="relative flex flex-col gap-1.5 rounded-sm border border-border p-2"
                        >
                          <Button
                            size="sm"
                            variant="ghost"
                            className="absolute right-1.5 top-1.5 text-danger p-1"
                            onClick={() => {
                              const r = [...mCfg.pricing.range];
                              r.splice(idx, 1);
                              updateModelConfig(mId, {
                                pricing: { ...mCfg.pricing, range: r },
                              });
                            }}
                          >
                            <X size={14} />
                          </Button>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {[
                              {
                                label: 'Lower Bound',
                                field: 'lower_bound',
                                val: range.lower_bound,
                              },
                              {
                                label: 'Upper Bound (0=∞)',
                                field: 'upper_bound',
                                val: range.upper_bound === Infinity ? 0 : range.upper_bound,
                              },
                              {
                                label: 'Input $/M',
                                field: 'input_per_m',
                                val: range.input_per_m,
                              },
                              {
                                label: 'Output $/M',
                                field: 'output_per_m',
                                val: range.output_per_m,
                              },
                              {
                                label: 'Cached $/M',
                                field: 'cached_per_m',
                                val: range.cached_per_m || 0,
                              },
                              {
                                label: 'Cache Write $/M',
                                field: 'cache_write_per_m',
                                val: range.cache_write_per_m || 0,
                              },
                            ].map(({ label, field, val }) => (
                              <Input
                                key={field}
                                label={label}
                                type="number"
                                step="0.000001"
                                value={val}
                                onChange={(e) => {
                                  const r = [...mCfg.pricing.range];
                                  const v =
                                    field === 'upper_bound'
                                      ? parseFloat(e.target.value) === 0
                                        ? Infinity
                                        : parseFloat(e.target.value)
                                      : parseFloat(e.target.value);
                                  r[idx] = {
                                    ...range,
                                    [field]: Number.isFinite(v)
                                      ? v
                                      : field === 'upper_bound'
                                        ? Infinity
                                        : 0,
                                  };
                                  updateModelConfig(mId, {
                                    pricing: { ...mCfg.pricing, range: r },
                                  });
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                      {(!mCfg.pricing.range || mCfg.pricing.range.length === 0) && (
                        <div className="text-foreground-subtle italic text-center text-[11px] py-2">
                          No ranges defined.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Per Request pricing */}
                  {mCfg.pricing?.source === 'per_request' && (
                    <div className="flex flex-col gap-1.5 bg-surface-sunken p-2 rounded-sm">
                      <Input
                        label="Cost Per Request ($)"
                        type="number"
                        step="0.000001"
                        min="0"
                        value={mCfg.pricing.amount || 0}
                        onChange={(e) =>
                          updateModelConfig(mId, {
                            pricing: {
                              ...mCfg.pricing,
                              amount: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                      />
                      <span className="font-sans text-[11px] text-foreground-subtle italic">
                        Flat fee per API call, regardless of token count.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Per-Model Adapters — disclosure */}
              <SectionCard
                size="sm"
                title="Model Adapters"
                collapsible
                open={modelAdaptersOpen[mId] || false}
                onOpenChange={(open) => setModelAdaptersOpen((prev) => ({ ...prev, [mId]: open }))}
                bodyClassName="bg-surface-sunken p-2"
                extra={(() => {
                  const modelAdapters: any[] = mCfg.adapter
                    ? Array.isArray(mCfg.adapter)
                      ? mCfg.adapter
                      : [mCfg.adapter]
                    : [];
                  return modelAdapters.length > 0 ? (
                    <Badge status="neutral" noDot>
                      {modelAdapters.length}
                    </Badge>
                  ) : null;
                })()}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {isGpt5Model(mId) &&
                    (() => {
                      const modelAdapters: any[] = mCfg.adapter
                        ? Array.isArray(mCfg.adapter)
                          ? mCfg.adapter
                          : [mCfg.adapter]
                        : [];
                      const suppressionDisabled = modelAdapters.some(
                        (entry: any) =>
                          typeof entry !== 'string' &&
                          entry.name === GPT5_SUPPRESSION_ADAPTER &&
                          entry.enabled === false
                      );
                      return (
                        <label
                          className={cn(
                            'flex cursor-pointer items-start gap-2 rounded-sm border border-border px-2 py-1 sm:col-span-2',
                            suppressionDisabled ? 'bg-surface' : 'bg-surface-elevated'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={!suppressionDisabled}
                            className="mt-0.5 shrink-0"
                            onChange={() => {
                              const withoutSuppression = modelAdapters.filter(
                                (entry: any) =>
                                  (typeof entry === 'string' ? entry : entry.name) !==
                                  GPT5_SUPPRESSION_ADAPTER
                              );
                              const next = suppressionDisabled
                                ? withoutSuppression
                                : [
                                    ...withoutSuppression,
                                    {
                                      name: GPT5_SUPPRESSION_ADAPTER,
                                      options: {},
                                      enabled: false,
                                    },
                                  ];
                              updateModelConfig(mId, {
                                adapter: next.length > 0 ? next : undefined,
                              });
                            }}
                          />
                          <div>
                            <div className="font-sans text-[12px] font-medium text-foreground">
                              Suppress Unsupported GPT-5 Options
                            </div>
                            <div className="font-sans text-[11px] leading-snug text-foreground-muted">
                              Enabled by default. Removes generation options GPT-5 does not accept.
                            </div>
                          </div>
                        </label>
                      );
                    })()}
                  {KNOWN_ADAPTERS.map((a) => {
                    const modelAdapters: any[] = mCfg.adapter
                      ? Array.isArray(mCfg.adapter)
                        ? mCfg.adapter
                        : [mCfg.adapter]
                      : [];
                    const active = modelAdapters.some(
                      (e: any) => (typeof e === 'string' ? e : e.name) === a.value
                    );
                    return (
                      <label
                        key={a.value}
                        className={cn(
                          'flex cursor-pointer items-start gap-2 rounded-sm border border-border px-2 py-1',
                          active ? 'bg-surface-elevated' : 'bg-surface'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          className="mt-0.5 shrink-0"
                          onChange={() => {
                            const modelAdapters: any[] = mCfg.adapter
                              ? Array.isArray(mCfg.adapter)
                                ? mCfg.adapter
                                : [mCfg.adapter]
                              : [];
                            const next = active
                              ? modelAdapters.filter(
                                  (e: any) => (typeof e === 'string' ? e : e.name) !== a.value
                                )
                              : [
                                  ...modelAdapters,
                                  {
                                    name: a.value,
                                    options:
                                      a.value === 'model_override'
                                        ? { rules: [] }
                                        : a.value === 'reasoning_rewrite'
                                          ? { rules: [] }
                                          : {},
                                  },
                                ];
                            updateModelConfig(mId, {
                              adapter: next.length > 0 ? next : undefined,
                            });
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
                  {/* model_override rules editor */}
                  {(() => {
                    const modelAdapters: any[] = mCfg.adapter
                      ? Array.isArray(mCfg.adapter)
                        ? mCfg.adapter
                        : [mCfg.adapter]
                      : [];
                    const overrideEntry = modelAdapters.find(
                      (e: any) => (typeof e === 'string' ? e : e.name) === 'model_override'
                    );
                    if (!overrideEntry || typeof overrideEntry === 'string') return null;
                    const rules: any[] = overrideEntry.options?.rules ?? [];
                    return (
                      <div className="mt-1 border-t border-border pt-1.5 sm:col-span-2">
                        <div className="font-sans text-[11px] font-medium text-foreground-muted mb-1">
                          Model Override Rules
                        </div>
                        <div className="font-sans text-[10px] leading-snug text-foreground-subtle mb-2">
                          When ANY condition matches, rewrite the model name. Use dotted paths like
                          reasoning.enabled.
                        </div>
                        {rules.map((rule: any, rIdx: number) => (
                          <div
                            key={rIdx}
                            className="mb-1 rounded-sm border border-border bg-surface-sunken p-1.5"
                          >
                            {/* Rewrite rule */}
                            <div className="font-sans text-[10px] font-medium text-foreground-subtle mb-1">
                              Rewrite
                            </div>
                            <div className="flex items-center gap-1">
                              <div
                                className="flex-[2] truncate rounded-sm border border-border bg-surface px-2 py-[5px] font-sans text-[12px] text-foreground-subtle"
                                title={mId}
                              >
                                {mId}
                              </div>
                              <span className="font-sans text-[11px] text-foreground-subtle">
                                →
                              </span>
                              <div className="flex-1">
                                <DebouncedInput
                                  placeholder="Rewrite to (e.g. deepseek-r1-fast)"
                                  value={rule.rewriteTo ?? ''}
                                  onChange={(val: string) => {
                                    const updated = [...rules];
                                    updated[rIdx] = {
                                      ...updated[rIdx],
                                      rewriteTo: val,
                                    };
                                    const newAdapters = modelAdapters.map((entry: any) =>
                                      typeof entry !== 'string' && entry.name === 'model_override'
                                        ? {
                                            ...entry,
                                            options: { ...entry.options, rules: updated },
                                          }
                                        : entry
                                    );
                                    updateModelConfig(mId, { adapter: newAdapters });
                                  }}
                                />
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const updated = rules.filter((_: any, i: number) => i !== rIdx);
                                  const newAdapters = modelAdapters.map((entry: any) =>
                                    typeof entry !== 'string' && entry.name === 'model_override'
                                      ? {
                                          ...entry,
                                          options: { ...entry.options, rules: updated },
                                        }
                                      : entry
                                  );
                                  updateModelConfig(mId, { adapter: newAdapters });
                                }}
                                aria-label="Remove rule"
                                className="p-1"
                              >
                                <Trash2 size={14} className="text-danger" />
                              </Button>
                            </div>
                            {/* Conditions separator */}
                            <div className="mt-1.5 mb-1 border-t border-border" />
                            <div className="font-sans text-[10px] font-medium text-foreground-subtle mb-1">
                              Conditions (any match triggers rewrite)
                            </div>
                            {/* Condition column headers */}
                            <div className="ml-2 mb-0.5 flex gap-1">
                              <span className="flex-1 pl-2 font-sans text-[9px] font-medium text-foreground-subtle">
                                Field path (dotted)
                              </span>
                              <span className="flex-1 pl-2 font-sans text-[9px] font-medium text-foreground-subtle">
                                Value (blank = presence check)
                              </span>
                              {/* spacer for delete button column */}
                              <span className="w-7" />
                            </div>
                            {/* Conditions */}
                            {(rule.conditions ?? []).map((cond: any, cIdx: number) => (
                              <div key={cIdx} className="ml-2 mb-0.5 flex gap-1">
                                <div className="flex-[2]">
                                  <DebouncedInput
                                    placeholder="e.g. reasoning.enabled"
                                    value={cond.field ?? ''}
                                    onChange={(val: string) => {
                                      const updated = [...rules];
                                      const newConditions = [...updated[rIdx].conditions];
                                      newConditions[cIdx] = {
                                        ...newConditions[cIdx],
                                        field: val,
                                      };
                                      updated[rIdx] = {
                                        ...updated[rIdx],
                                        conditions: newConditions,
                                      };
                                      const newAdapters = modelAdapters.map((entry: any) =>
                                        typeof entry !== 'string' && entry.name === 'model_override'
                                          ? {
                                              ...entry,
                                              options: {
                                                ...entry.options,
                                                rules: updated,
                                              },
                                            }
                                          : entry
                                      );
                                      updateModelConfig(mId, { adapter: newAdapters });
                                    }}
                                  />
                                </div>
                                <div className="flex-1">
                                  <DebouncedInput
                                    placeholder="e.g. false, 0, none"
                                    value={cond.value !== undefined ? String(cond.value) : ''}
                                    onChange={(val: string) => {
                                      const parsed =
                                        val === ''
                                          ? undefined
                                          : val === 'true'
                                            ? true
                                            : val === 'false'
                                              ? false
                                              : isNaN(Number(val))
                                                ? val
                                                : Number(val);
                                      const updated = [...rules];
                                      const newConditions = [...updated[rIdx].conditions];
                                      newConditions[cIdx] = {
                                        field: newConditions[cIdx].field,
                                        value: parsed,
                                      };
                                      updated[rIdx] = {
                                        ...updated[rIdx],
                                        conditions: newConditions,
                                      };
                                      const newAdapters = modelAdapters.map((entry: any) =>
                                        typeof entry !== 'string' && entry.name === 'model_override'
                                          ? {
                                              ...entry,
                                              options: {
                                                ...entry.options,
                                                rules: updated,
                                              },
                                            }
                                          : entry
                                      );
                                      updateModelConfig(mId, { adapter: newAdapters });
                                    }}
                                  />
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const updated = [...rules];
                                    const newConditions = updated[rIdx].conditions.filter(
                                      (_: any, i: number) => i !== cIdx
                                    );
                                    updated[rIdx] = {
                                      ...updated[rIdx],
                                      conditions: newConditions,
                                    };
                                    const newAdapters = modelAdapters.map((entry: any) =>
                                      typeof entry !== 'string' && entry.name === 'model_override'
                                        ? {
                                            ...entry,
                                            options: { ...entry.options, rules: updated },
                                          }
                                        : entry
                                    );
                                    updateModelConfig(mId, { adapter: newAdapters });
                                  }}
                                  aria-label="Remove condition"
                                  className="p-1"
                                >
                                  <Trash2 size={12} className="text-danger" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const updated = [...rules];
                                updated[rIdx] = {
                                  ...updated[rIdx],
                                  conditions: [...(updated[rIdx].conditions ?? []), { field: '' }],
                                };
                                const newAdapters = modelAdapters.map((entry: any) =>
                                  typeof entry !== 'string' && entry.name === 'model_override'
                                    ? {
                                        ...entry,
                                        options: { ...entry.options, rules: updated },
                                      }
                                    : entry
                                );
                                updateModelConfig(mId, { adapter: newAdapters });
                              }}
                              className="ml-2 px-1.5 py-0.5"
                            >
                              <Plus size={12} />{' '}
                              <span className="font-sans text-[10px]">Condition</span>
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const newRule = {
                              model: mId,
                              rewriteTo: '',
                              conditions: [{ field: '' }],
                            };
                            const updated = [...rules, newRule];
                            const newAdapters = modelAdapters.map((entry: any) =>
                              typeof entry !== 'string' && entry.name === 'model_override'
                                ? {
                                    ...entry,
                                    options: { ...entry.options, rules: updated },
                                  }
                                : entry
                            );
                            updateModelConfig(mId, { adapter: newAdapters });
                          }}
                          className="mt-0.5"
                        >
                          <Plus size={12} /> <span className="font-sans text-[10px]">Rule</span>
                        </Button>
                      </div>
                    );
                  })()}
                  {/* reasoning_rewrite rules editor */}
                  {(() => {
                    const modelAdapters: any[] = mCfg.adapter
                      ? Array.isArray(mCfg.adapter)
                        ? mCfg.adapter
                        : [mCfg.adapter]
                      : [];
                    const rewriteEntry = modelAdapters.find(
                      (e: any) => (typeof e === 'string' ? e : e.name) === 'reasoning_rewrite'
                    );
                    if (!rewriteEntry || typeof rewriteEntry === 'string') return null;
                    const rules: any[] = rewriteEntry.options?.rules ?? [];
                    return (
                      <div className="mt-1 border-t border-border pt-1.5 sm:col-span-2">
                        <div className="font-sans text-[11px] font-medium text-foreground-muted mb-1">
                          Reasoning Rewrite Rules
                        </div>
                        <div className="font-sans text-[10px] leading-snug text-foreground-subtle mb-2">
                          Map unified reasoning fields to provider-specific formats. Each rule reads
                          a source field and writes one or more targets.
                        </div>
                        {rules.map((rule: any, rIdx: number) => (
                          <div
                            key={rIdx}
                            className="mb-1 rounded-sm border border-border bg-surface-sunken p-1.5"
                          >
                            {/* Source + When condition */}
                            <div className="mb-1 flex items-center gap-1">
                              <div className="flex-[2]">
                                <DebouncedInput
                                  placeholder="Source (e.g. reasoning.enabled)"
                                  value={rule.source ?? ''}
                                  onChange={(val: string) => {
                                    const updated = [...rules];
                                    updated[rIdx] = {
                                      ...updated[rIdx],
                                      source: val,
                                    };
                                    const newAdapters = modelAdapters.map((entry: any) =>
                                      typeof entry !== 'string' &&
                                      entry.name === 'reasoning_rewrite'
                                        ? {
                                            ...entry,
                                            options: { ...entry.options, rules: updated },
                                          }
                                        : entry
                                    );
                                    updateModelConfig(mId, { adapter: newAdapters });
                                  }}
                                />
                              </div>
                              {/* When operator */}
                              <div className="flex-[0.7]">
                                <select
                                  className="w-full py-1 pl-2 pr-2 font-sans text-[11px] text-foreground bg-surface border border-border rounded-sm outline-none focus:border-accent"
                                  value={rule.when?.op ?? ''}
                                  onChange={(e) => {
                                    const op = e.target.value;
                                    const updated = [...rules];
                                    updated[rIdx] = {
                                      ...updated[rIdx],
                                      when: op ? { op } : undefined,
                                    };
                                    const newAdapters = modelAdapters.map((entry: any) =>
                                      typeof entry !== 'string' &&
                                      entry.name === 'reasoning_rewrite'
                                        ? {
                                            ...entry,
                                            options: { ...entry.options, rules: updated },
                                          }
                                        : entry
                                    );
                                    updateModelConfig(mId, { adapter: newAdapters });
                                  }}
                                >
                                  <option value="">Any (present)</option>
                                  <option value="eq">Equals</option>
                                  <option value="neq">Not equals</option>
                                  <option value="gt">Greater than</option>
                                  <option value="gte">≥</option>
                                  <option value="lt">Less than</option>
                                  <option value="lte">≤</option>
                                  <option value="in">In list</option>
                                  <option value="present">Present</option>
                                  <option value="absent">Absent</option>
                                </select>
                              </div>
                              {/* When value */}
                              <div className="flex-1">
                                <DebouncedInput
                                  placeholder="Value"
                                  value={
                                    rule.when?.value != null
                                      ? String(rule.when.value)
                                      : rule.when?.values
                                        ? rule.when.values.join(',')
                                        : ''
                                  }
                                  onChange={(val: string) => {
                                    const updated = [...rules];
                                    const currentWhen = updated[rIdx].when || {};
                                    if (currentWhen.op === 'in') {
                                      updated[rIdx] = {
                                        ...updated[rIdx],
                                        when: {
                                          ...currentWhen,
                                          values: val
                                            .split(',')
                                            .map((s: string) => s.trim())
                                            .filter(Boolean),
                                        },
                                      };
                                    } else {
                                      const parsed =
                                        val === ''
                                          ? undefined
                                          : val === 'true'
                                            ? true
                                            : val === 'false'
                                              ? false
                                              : isNaN(Number(val))
                                                ? val
                                                : Number(val);
                                      updated[rIdx] = {
                                        ...updated[rIdx],
                                        when: { ...currentWhen, value: parsed },
                                      };
                                    }
                                    const newAdapters = modelAdapters.map((entry: any) =>
                                      typeof entry !== 'string' &&
                                      entry.name === 'reasoning_rewrite'
                                        ? {
                                            ...entry,
                                            options: { ...entry.options, rules: updated },
                                          }
                                        : entry
                                    );
                                    updateModelConfig(mId, { adapter: newAdapters });
                                  }}
                                />
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const updated = rules.filter((_: any, i: number) => i !== rIdx);
                                  const newAdapters = modelAdapters.map((entry: any) =>
                                    typeof entry !== 'string' && entry.name === 'reasoning_rewrite'
                                      ? {
                                          ...entry,
                                          options: { ...entry.options, rules: updated },
                                        }
                                      : entry
                                  );
                                  updateModelConfig(mId, { adapter: newAdapters });
                                }}
                                aria-label="Remove rule"
                                className="p-1"
                              >
                                <Trash2 size={14} className="text-danger" />
                              </Button>
                            </div>
                            {/* Rewrites */}
                            <div className="font-sans text-[10px] font-medium text-foreground-subtle mb-1">
                              Rewrites
                            </div>
                            {(rule.rewrites ?? []).map((rw: any, rwIdx: number) => (
                              <div key={rwIdx} className="ml-2 mb-0.5 flex items-center gap-1">
                                <div className="flex-[2]">
                                  <DebouncedInput
                                    placeholder="Target path (e.g. enable_thinking)"
                                    value={rw.target ?? ''}
                                    onChange={(val: string) => {
                                      const updated = [...rules];
                                      const newRewrites = [...updated[rIdx].rewrites];
                                      newRewrites[rwIdx] = {
                                        ...newRewrites[rwIdx],
                                        target: val,
                                      };
                                      updated[rIdx] = {
                                        ...updated[rIdx],
                                        rewrites: newRewrites,
                                      };
                                      const newAdapters = modelAdapters.map((entry: any) =>
                                        typeof entry !== 'string' &&
                                        entry.name === 'reasoning_rewrite'
                                          ? {
                                              ...entry,
                                              options: {
                                                ...entry.options,
                                                rules: updated,
                                              },
                                            }
                                          : entry
                                      );
                                      updateModelConfig(mId, { adapter: newAdapters });
                                    }}
                                  />
                                </div>
                                {/* Value type selector */}
                                <div className="flex-[0.7]">
                                  <select
                                    className="w-full py-1 pl-2 pr-2 font-sans text-[11px] text-foreground bg-surface border border-border rounded-sm outline-none focus:border-accent"
                                    value={
                                      rw.value === null
                                        ? 'null'
                                        : rw.value === undefined
                                          ? ''
                                          : typeof rw.value !== 'object'
                                            ? 'literal'
                                            : rw.value.from === 'source'
                                              ? 'source'
                                              : rw.value.from === 'map'
                                                ? 'map'
                                                : rw.value.from === 'boolean'
                                                  ? 'boolean'
                                                  : 'literal'
                                    }
                                    onChange={(e) => {
                                      const valType = e.target.value;
                                      let newValue: any;
                                      switch (valType) {
                                        case 'source':
                                          newValue = { from: 'source' };
                                          break;
                                        case 'map':
                                          newValue = { from: 'map', values: {} };
                                          break;
                                        case 'boolean':
                                          newValue = {
                                            from: 'boolean',
                                            truthy: 'enabled',
                                            falsy: 'disabled',
                                          };
                                          break;
                                        case 'null':
                                          newValue = null;
                                          break;
                                        default:
                                          newValue = '';
                                          break;
                                      }
                                      const updated = [...rules];
                                      const newRewrites = [...updated[rIdx].rewrites];
                                      newRewrites[rwIdx] = {
                                        ...newRewrites[rwIdx],
                                        value: newValue,
                                      };
                                      updated[rIdx] = {
                                        ...updated[rIdx],
                                        rewrites: newRewrites,
                                      };
                                      const newAdapters = modelAdapters.map((entry: any) =>
                                        typeof entry !== 'string' &&
                                        entry.name === 'reasoning_rewrite'
                                          ? {
                                              ...entry,
                                              options: {
                                                ...entry.options,
                                                rules: updated,
                                              },
                                            }
                                          : entry
                                      );
                                      updateModelConfig(mId, { adapter: newAdapters });
                                    }}
                                  >
                                    <option value="literal">Literal</option>
                                    <option value="source">From source</option>
                                    <option value="map">Value map</option>
                                    <option value="boolean">Bool map</option>
                                    <option value="null">null</option>
                                  </select>
                                </div>
                                {/* Value input — changes meaning based on type */}
                                <div className="flex-1">
                                  {(() => {
                                    if (rw.value === null)
                                      return (
                                        <span className="font-sans text-[11px] text-foreground-subtle italic">
                                          null
                                        </span>
                                      );
                                    if (rw.value?.from === 'source')
                                      return (
                                        <span className="font-sans text-[11px] text-foreground-subtle italic">
                                          passthrough
                                        </span>
                                      );
                                    if (rw.value?.from === 'map') {
                                      const mapStr = Object.entries(rw.value.values || {})
                                        .map(([k, v]) => `${k}:${v}`)
                                        .join(', ');
                                      return (
                                        <DebouncedInput
                                          placeholder="key:value, key:value"
                                          value={mapStr}
                                          onChange={(val: string) => {
                                            const values: Record<string, any> = {};
                                            val.split(',').forEach((pair: string) => {
                                              const [k, ...rest] = pair.split(':');
                                              const v = rest.join(':').trim();
                                              if (k?.trim()) {
                                                const numV = Number(v);
                                                values[k.trim()] =
                                                  v === '' ? '' : isNaN(Number(v)) ? v : numV;
                                              }
                                            });
                                            const updated = [...rules];
                                            const newRewrites = [...updated[rIdx].rewrites];
                                            newRewrites[rwIdx] = {
                                              ...newRewrites[rwIdx],
                                              value: { from: 'map', values },
                                            };
                                            updated[rIdx] = {
                                              ...updated[rIdx],
                                              rewrites: newRewrites,
                                            };
                                            const newAdapters = modelAdapters.map((entry: any) =>
                                              typeof entry !== 'string' &&
                                              entry.name === 'reasoning_rewrite'
                                                ? {
                                                    ...entry,
                                                    options: {
                                                      ...entry.options,
                                                      rules: updated,
                                                    },
                                                  }
                                                : entry
                                            );
                                            updateModelConfig(mId, {
                                              adapter: newAdapters,
                                            });
                                          }}
                                        />
                                      );
                                    }
                                    if (rw.value?.from === 'boolean') {
                                      return (
                                        <div className="flex gap-1">
                                          <DebouncedInput
                                            placeholder="If true"
                                            value={String(rw.value.truthy ?? '')}
                                            onChange={(val: string) => {
                                              const updated = [...rules];
                                              const newRewrites = [...updated[rIdx].rewrites];
                                              newRewrites[rwIdx] = {
                                                ...newRewrites[rwIdx],
                                                value: {
                                                  ...newRewrites[rwIdx].value,
                                                  truthy: val,
                                                },
                                              };
                                              updated[rIdx] = {
                                                ...updated[rIdx],
                                                rewrites: newRewrites,
                                              };
                                              const newAdapters = modelAdapters.map((entry: any) =>
                                                typeof entry !== 'string' &&
                                                entry.name === 'reasoning_rewrite'
                                                  ? {
                                                      ...entry,
                                                      options: {
                                                        ...entry.options,
                                                        rules: updated,
                                                      },
                                                    }
                                                  : entry
                                              );
                                              updateModelConfig(mId, {
                                                adapter: newAdapters,
                                              });
                                            }}
                                          />
                                          <DebouncedInput
                                            placeholder="If false"
                                            value={String(rw.value.falsy ?? '')}
                                            onChange={(val: string) => {
                                              const updated = [...rules];
                                              const newRewrites = [...updated[rIdx].rewrites];
                                              newRewrites[rwIdx] = {
                                                ...newRewrites[rwIdx],
                                                value: {
                                                  ...newRewrites[rwIdx].value,
                                                  falsy: val,
                                                },
                                              };
                                              updated[rIdx] = {
                                                ...updated[rIdx],
                                                rewrites: newRewrites,
                                              };
                                              const newAdapters = modelAdapters.map((entry: any) =>
                                                typeof entry !== 'string' &&
                                                entry.name === 'reasoning_rewrite'
                                                  ? {
                                                      ...entry,
                                                      options: {
                                                        ...entry.options,
                                                        rules: updated,
                                                      },
                                                    }
                                                  : entry
                                              );
                                              updateModelConfig(mId, {
                                                adapter: newAdapters,
                                              });
                                            }}
                                          />
                                        </div>
                                      );
                                    }
                                    // Literal value
                                    return (
                                      <DebouncedInput
                                        placeholder="Literal value"
                                        value={String(rw.value ?? '')}
                                        onChange={(val: string) => {
                                          const parsed =
                                            val === 'true'
                                              ? true
                                              : val === 'false'
                                                ? false
                                                : isNaN(Number(val))
                                                  ? val
                                                  : Number(val);
                                          const updated = [...rules];
                                          const newRewrites = [...updated[rIdx].rewrites];
                                          newRewrites[rwIdx] = {
                                            ...newRewrites[rwIdx],
                                            value: parsed,
                                          };
                                          updated[rIdx] = {
                                            ...updated[rIdx],
                                            rewrites: newRewrites,
                                          };
                                          const newAdapters = modelAdapters.map((entry: any) =>
                                            typeof entry !== 'string' &&
                                            entry.name === 'reasoning_rewrite'
                                              ? {
                                                  ...entry,
                                                  options: {
                                                    ...entry.options,
                                                    rules: updated,
                                                  },
                                                }
                                              : entry
                                          );
                                          updateModelConfig(mId, {
                                            adapter: newAdapters,
                                          });
                                        }}
                                      />
                                    );
                                  })()}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const updated = [...rules];
                                    const newRewrites = updated[rIdx].rewrites.filter(
                                      (_: any, i: number) => i !== rwIdx
                                    );
                                    updated[rIdx] = {
                                      ...updated[rIdx],
                                      rewrites: newRewrites,
                                    };
                                    const newAdapters = modelAdapters.map((entry: any) =>
                                      typeof entry !== 'string' &&
                                      entry.name === 'reasoning_rewrite'
                                        ? {
                                            ...entry,
                                            options: { ...entry.options, rules: updated },
                                          }
                                        : entry
                                    );
                                    updateModelConfig(mId, { adapter: newAdapters });
                                  }}
                                  aria-label="Remove rewrite"
                                  className="p-1"
                                >
                                  <Trash2 size={12} className="text-danger" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const updated = [...rules];
                                updated[rIdx] = {
                                  ...updated[rIdx],
                                  rewrites: [
                                    ...(updated[rIdx].rewrites ?? []),
                                    { target: '', value: '' },
                                  ],
                                };
                                const newAdapters = modelAdapters.map((entry: any) =>
                                  typeof entry !== 'string' && entry.name === 'reasoning_rewrite'
                                    ? {
                                        ...entry,
                                        options: { ...entry.options, rules: updated },
                                      }
                                    : entry
                                );
                                updateModelConfig(mId, { adapter: newAdapters });
                              }}
                              className="ml-2 px-1.5 py-0.5"
                            >
                              <Plus size={12} />{' '}
                              <span className="font-sans text-[10px]">Rewrite</span>
                            </Button>
                            {/* Strip paths */}
                            <div className="mt-1.5 mb-1 border-t border-border" />
                            <div className="font-sans text-[10px] font-medium text-foreground-subtle mb-1">
                              Strip paths (remove from payload after rewrite)
                            </div>
                            <div className="ml-2 flex flex-wrap gap-1">
                              {(rule.strip ?? []).map((stripPath: string, sIdx: number) => (
                                <div key={sIdx} className="flex items-center gap-0.5">
                                  <div className="rounded-sm border border-border bg-surface px-2 py-0.5 font-sans text-[11px] text-foreground">
                                    {stripPath}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const updated = [...rules];
                                      const newStrip = updated[rIdx].strip.filter(
                                        (_: any, i: number) => i !== sIdx
                                      );
                                      updated[rIdx] = {
                                        ...updated[rIdx],
                                        strip: newStrip.length > 0 ? newStrip : undefined,
                                      };
                                      const newAdapters = modelAdapters.map((entry: any) =>
                                        typeof entry !== 'string' &&
                                        entry.name === 'reasoning_rewrite'
                                          ? {
                                              ...entry,
                                              options: {
                                                ...entry.options,
                                                rules: updated,
                                              },
                                            }
                                          : entry
                                      );
                                      updateModelConfig(mId, { adapter: newAdapters });
                                    }}
                                    aria-label="Remove strip path"
                                    className="p-0.5"
                                  >
                                    <Trash2 size={10} className="text-danger" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                            <div className="ml-2 mt-0.5 flex gap-1">
                              <Input
                                placeholder="Path to strip (e.g. reasoning) — press Enter"
                                onKeyDown={(e: any) => {
                                  if (e.key === 'Enter') {
                                    const draft = (e.target as HTMLInputElement).value.trim();
                                    if (draft) {
                                      const updated = [...rules];
                                      updated[rIdx] = {
                                        ...updated[rIdx],
                                        strip: [...(updated[rIdx].strip ?? []), draft],
                                      };
                                      const newAdapters = modelAdapters.map((entry: any) =>
                                        typeof entry !== 'string' &&
                                        entry.name === 'reasoning_rewrite'
                                          ? {
                                              ...entry,
                                              options: {
                                                ...entry.options,
                                                rules: updated,
                                              },
                                            }
                                          : entry
                                      );
                                      updateModelConfig(mId, { adapter: newAdapters });
                                      (e.target as HTMLInputElement).value = '';
                                    }
                                  }
                                }}
                                className="flex-1 text-[11px]"
                              />
                            </div>
                          </div>
                        ))}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const newRule = {
                              source: '',
                              rewrites: [{ target: '', value: '' }],
                            };
                            const updated = [...rules, newRule];
                            const newAdapters = modelAdapters.map((entry: any) =>
                              typeof entry !== 'string' && entry.name === 'reasoning_rewrite'
                                ? {
                                    ...entry,
                                    options: { ...entry.options, rules: updated },
                                  }
                                : entry
                            );
                            updateModelConfig(mId, { adapter: newAdapters });
                          }}
                          className="mt-0.5"
                        >
                          <Plus size={12} /> <span className="font-sans text-[10px]">Rule</span>
                        </Button>
                      </div>
                    );
                  })()}
                </div>
              </SectionCard>

              {/* Per-Model Extra Body Fields */}
              <SectionCard
                size="sm"
                title="Extra Body Fields"
                collapsible
                open={isModelExtraBodyOpen[mId] || false}
                onOpenChange={(open) =>
                  setIsModelExtraBodyOpen({ ...isModelExtraBodyOpen, [mId]: open })
                }
                bodyClassName="bg-surface-sunken p-2"
                extra={
                  <>
                    <Badge status="neutral" noDot>
                      {Object.keys(mCfg.extraBody || {}).length}
                    </Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="px-1.5 py-0.5 leading-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        addModelKV(mId);
                        setIsModelExtraBodyOpen({ ...isModelExtraBodyOpen, [mId]: true });
                      }}
                    >
                      <Plus size={14} />
                    </Button>
                  </>
                }
              >
                <div className="flex flex-col gap-1">
                  {Object.entries(mCfg.extraBody || {}).length === 0 && (
                    <div className="font-sans text-[11px] text-foreground-muted italic">
                      No extra body fields configured.
                    </div>
                  )}
                  {Object.entries(mCfg.extraBody || {}).map(
                    ([key, val]: [string, any], idx: number) => (
                      <div key={idx} className="flex gap-1.5">
                        <DebouncedInput
                          placeholder="Field Name"
                          value={key}
                          onChange={(newKey: string) => updateModelKV(mId, key, newKey, val)}
                          className="flex-1"
                        />
                        <DebouncedInput
                          placeholder="Value"
                          value={typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          onChange={(val: string) => {
                            try {
                              updateModelKV(mId, key, key, JSON.parse(val));
                            } catch {
                              updateModelKV(mId, key, key, val);
                            }
                          }}
                          className="flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeModelKV(mId, key)}
                          aria-label={`Remove ${key}`}
                          className="p-1"
                        >
                          <Trash2 size={14} className="text-danger" />
                        </Button>
                      </div>
                    )
                  )}
                </div>
              </SectionCard>

              {/* Per-Model Advanced */}
              <SectionCard
                size="sm"
                title="Advanced"
                collapsible
                open={modelAdvancedOpen[mId] || false}
                onOpenChange={(open) => setModelAdvancedOpen((prev) => ({ ...prev, [mId]: open }))}
                bodyClassName="bg-surface-sunken p-2"
                extra={
                  <>
                    {mCfg.maxConcurrency != null && (
                      <Badge status="neutral" noDot>
                        Concurrency: {mCfg.maxConcurrency}
                      </Badge>
                    )}
                    {mCfg.auto_compat === true && (
                      <Badge status="neutral" noDot>
                        Auto Compat
                      </Badge>
                    )}
                  </>
                }
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-col gap-0.5">
                    <label className="flex items-start gap-2 py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mCfg.auto_compat === true}
                        onChange={(e) =>
                          updateModelConfig(mId, {
                            auto_compat: e.target.checked ? true : undefined,
                          })
                        }
                      />
                      <div>
                        <div className="font-sans text-[12px] text-foreground">Auto Compat</div>
                        <div className="font-sans text-[11px] leading-snug text-foreground-muted">
                          Use pi-ai registry hints for this model.
                        </div>
                      </div>
                    </label>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="font-sans text-[11px] font-medium text-foreground-muted">
                      Max Concurrency
                      <span className="font-normal text-[10px] text-foreground-subtle ml-1">
                        this model only
                      </span>
                    </label>
                    <input
                      className={FIELD_CLS}
                      type="number"
                      step="1"
                      min="1"
                      placeholder="No limit"
                      value={mCfg.maxConcurrency != null ? mCfg.maxConcurrency : ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          updateModelConfig(mId, { maxConcurrency: undefined });
                        } else {
                          const val = Number(raw);
                          if (Number.isFinite(val) && val >= 1) {
                            updateModelConfig(mId, { maxConcurrency: val });
                          }
                        }
                      }}
                    />
                    <span className="font-sans text-[11px] text-foreground-subtle italic">
                      Limit in-flight requests for this model. Leave empty to use the provider-wide
                      limit or no limit.
                    </span>
                  </div>
                </div>
              </SectionCard>
            </SectionCard>
          );
        })}
      </div>
    </SectionCard>
  );
}

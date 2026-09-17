import { Plus, X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { OpenRouterSlugInput } from '../../ui/OpenRouterSlugInput';
import type { ModelConfig } from './types';

interface Props {
  modelId: string;
  modelConfig: ModelConfig;
  updateModelConfig: (modelId: string, updates: any) => void;
}

export function ModelPricing({ modelId, modelConfig, updateModelConfig }: Props) {
  const mCfg = modelConfig;

  return (
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
          updateModelConfig(modelId, { pricing: newPricing });
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
                updateModelConfig(modelId, {
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
              updateModelConfig(modelId, {
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
                updateModelConfig(modelId, { pricing: rest });
              } else
                updateModelConfig(modelId, {
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
                updateModelConfig(modelId, {
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
                  updateModelConfig(modelId, {
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
                        [field]: Number.isFinite(v) ? v : field === 'upper_bound' ? Infinity : 0,
                      };
                      updateModelConfig(modelId, {
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
              updateModelConfig(modelId, {
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
  );
}

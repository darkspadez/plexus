import React from 'react';
import type { MetadataOverrides } from '../../lib/api';
import { Input } from '../ui/Input';

/** Common modalities users can pick from */
const MODALITY_OPTIONS = ['text', 'image', 'audio', 'video', 'file'] as const;

/** Common supported parameters */
const PARAMETER_OPTIONS = [
  'temperature',
  'top_p',
  'top_k',
  'max_tokens',
  'tools',
  'tool_choice',
  'stop',
  'frequency_penalty',
  'presence_penalty',
  'repetition_penalty',
  'seed',
  'logprobs',
  'top_logprobs',
  'logit_bias',
  'response_format',
  'reasoning',
] as const;

interface ChipSelectorProps {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (item: string) => void;
}

const ChipSelector: React.FC<ChipSelectorProps> = ({ label, options, selected, onToggle }) => (
  <div>
    <label
      className="font-body text-[11px] font-medium text-text-secondary"
      style={{ display: 'block', marginBottom: '4px' }}
    >
      {label}
    </label>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {options.map((opt) => {
        const isSelected = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors duration-150 cursor-pointer ${
              isSelected
                ? 'bg-primary/20 border-primary text-primary'
                : 'bg-bg-glass border-border-glass text-text-muted hover:border-text-muted'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  </div>
);

interface MetadataOverrideFormProps {
  overrides: MetadataOverrides;
  updateOverride: (updates: Partial<MetadataOverrides>) => void;
  toggleArrayItem: (
    field: 'input_modalities' | 'output_modalities' | 'supported_parameters',
    item: string
  ) => void;
  isCustom: boolean;
}

export const MetadataOverrideForm: React.FC<MetadataOverrideFormProps> = ({
  overrides,
  updateOverride,
  toggleArrayItem,
  isCustom,
}) => {
  const fieldLabel = (text: string) => (
    <label
      className="font-body text-[11px] font-medium text-text-secondary"
      style={{ display: 'block', marginBottom: '2px' }}
    >
      {text}
    </label>
  );

  return (
    <div
      className="rounded-sm border border-border-glass bg-bg-subtle px-3 py-3"
      style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
    >
      <span className="font-body text-[11px] font-semibold text-text-secondary">
        {isCustom ? 'Custom Metadata' : 'Metadata Overrides'}
      </span>

      {/* Name */}
      <div>
        {fieldLabel('Name *')}
        <Input
          value={overrides.name ?? ''}
          onChange={(e) => updateOverride({ name: e.target.value })}
          placeholder="e.g. GPT-4o"
          style={{ height: '28px', fontSize: '12px' }}
        />
      </div>

      {/* Description */}
      <div>
        {fieldLabel('Description *')}
        <textarea
          className="w-full font-body text-xs text-text bg-bg-glass border border-border-glass rounded-sm outline-none transition-all duration-200 backdrop-blur-md focus:border-primary resize-y"
          style={{ padding: '6px 8px', minHeight: '48px' }}
          value={overrides.description ?? ''}
          onChange={(e) => updateOverride({ description: e.target.value })}
          placeholder="Model description..."
        />
      </div>

      {/* Context Length */}
      <div>
        {fieldLabel('Context Length *')}
        <Input
          type="number"
          value={overrides.context_length ?? ''}
          onChange={(e) =>
            updateOverride({
              context_length: e.target.value ? parseInt(e.target.value, 10) : undefined,
            })
          }
          placeholder="e.g. 128000"
          style={{ height: '28px', fontSize: '12px' }}
        />
      </div>

      {/* Architecture — Modalities */}
      <ChipSelector
        label="Input Modalities *"
        options={MODALITY_OPTIONS}
        selected={overrides.architecture?.input_modalities ?? []}
        onToggle={(item) => toggleArrayItem('input_modalities', item)}
      />
      <ChipSelector
        label="Output Modalities *"
        options={MODALITY_OPTIONS}
        selected={overrides.architecture?.output_modalities ?? []}
        onToggle={(item) => toggleArrayItem('output_modalities', item)}
      />

      {/* Pricing — raw per-token values */}
      <div>
        <span className="font-body text-[11px] font-medium text-text-secondary">
          Pricing (per token) *
        </span>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            marginTop: '4px',
          }}
        >
          <div>
            {fieldLabel('Prompt')}
            <Input
              value={overrides.pricing?.prompt ?? ''}
              onChange={(e) =>
                updateOverride({
                  pricing: { ...overrides.pricing, prompt: e.target.value },
                })
              }
              placeholder="e.g. 0.0000025"
              style={{ height: '28px', fontSize: '11px' }}
            />
          </div>
          <div>
            {fieldLabel('Completion')}
            <Input
              value={overrides.pricing?.completion ?? ''}
              onChange={(e) =>
                updateOverride({
                  pricing: { ...overrides.pricing, completion: e.target.value },
                })
              }
              placeholder="e.g. 0.00001"
              style={{ height: '28px', fontSize: '11px' }}
            />
          </div>
          <div>
            {fieldLabel('Cache Read')}
            <Input
              value={overrides.pricing?.input_cache_read ?? ''}
              onChange={(e) =>
                updateOverride({
                  pricing: { ...overrides.pricing, input_cache_read: e.target.value },
                })
              }
              placeholder="e.g. 0.00000125"
              style={{ height: '28px', fontSize: '11px' }}
            />
          </div>
          <div>
            {fieldLabel('Cache Write')}
            <Input
              value={overrides.pricing?.input_cache_write ?? ''}
              onChange={(e) =>
                updateOverride({
                  pricing: { ...overrides.pricing, input_cache_write: e.target.value },
                })
              }
              placeholder="e.g. 0.00000375"
              style={{ height: '28px', fontSize: '11px' }}
            />
          </div>
        </div>
      </div>

      {/* Supported Parameters */}
      <ChipSelector
        label="Supported Parameters *"
        options={PARAMETER_OPTIONS}
        selected={overrides.supported_parameters ?? []}
        onToggle={(item) => toggleArrayItem('supported_parameters', item)}
      />

      {/* Top Provider */}
      <div>
        <span className="font-body text-[11px] font-medium text-text-secondary">Top Provider</span>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            marginTop: '4px',
          }}
        >
          <div>
            {fieldLabel('Max Context')}
            <Input
              type="number"
              value={overrides.top_provider?.context_length ?? ''}
              onChange={(e) =>
                updateOverride({
                  top_provider: {
                    ...overrides.top_provider,
                    context_length: e.target.value ? parseInt(e.target.value, 10) : undefined,
                  },
                })
              }
              placeholder="e.g. 128000"
              style={{ height: '28px', fontSize: '12px' }}
            />
          </div>
          <div>
            {fieldLabel('Max Completion Tokens')}
            <Input
              type="number"
              value={overrides.top_provider?.max_completion_tokens ?? ''}
              onChange={(e) =>
                updateOverride({
                  top_provider: {
                    ...overrides.top_provider,
                    max_completion_tokens: e.target.value
                      ? parseInt(e.target.value, 10)
                      : undefined,
                  },
                })
              }
              placeholder="e.g. 16384"
              style={{ height: '28px', fontSize: '12px' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

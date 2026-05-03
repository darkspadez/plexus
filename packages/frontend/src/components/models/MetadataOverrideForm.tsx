import type { MetadataOverrides } from '../../lib/api';
import { Input } from '../forms/Input';
import { TagSelect } from '../forms/TagSelect';
import { Section } from '../ui-v2/section';

// Suggested values shown in the TagSelect dropdowns. Users can still enter
// arbitrary strings via `allowCustom`; these are just hints for the common case.
const MODALITY_SUGGESTIONS = ['text', 'image', 'audio', 'video', 'file'];
const SUPPORTED_PARAM_SUGGESTIONS = [
  'temperature',
  'top_p',
  'top_k',
  'min_p',
  'top_a',
  'frequency_penalty',
  'presence_penalty',
  'repetition_penalty',
  'seed',
  'max_tokens',
  'logit_bias',
  'logprobs',
  'top_logprobs',
  'response_format',
  'structured_outputs',
  'stop',
  'tools',
  'tool_choice',
  'reasoning',
  'include_reasoning',
  'web_search_options',
];

interface Props {
  overrides: MetadataOverrides;
  isCustom: boolean;
  onSetField: <K extends keyof MetadataOverrides>(
    key: K,
    value: MetadataOverrides[K] | undefined
  ) => void;
  onSetPricing: (
    key: keyof NonNullable<MetadataOverrides['pricing']>,
    value: string | undefined
  ) => void;
  onSetArchitecture: (
    key: keyof NonNullable<MetadataOverrides['architecture']>,
    value: string | string[] | undefined
  ) => void;
  onSetTopProvider: (
    key: keyof NonNullable<MetadataOverrides['top_provider']>,
    value: number | undefined
  ) => void;
}

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label
    className="text-[11px] font-medium text-foreground-muted"
    style={{ display: 'block', marginBottom: '2px' }}
  >
    {children}
  </label>
);

const parseIntOrUndef = (s: string): number | undefined => {
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  const n = parseInt(trimmed, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export function MetadataOverrideForm({
  overrides,
  isCustom,
  onSetField,
  onSetPricing,
  onSetArchitecture,
  onSetTopProvider,
}: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {isCustom && (
        <p className="text-[11px] text-foreground-muted" style={{ marginBottom: 0 }}>
          All fields below come from your manual entry — no catalog is consulted.
        </p>
      )}

      {/* Basic */}
      <Section
        title="Basic"
        size="md"
        bodyStyle={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <FieldLabel>Name</FieldLabel>
            <Input
              value={overrides.name ?? ''}
              onChange={(e) =>
                onSetField('name', e.target.value === '' ? undefined : e.target.value)
              }
              placeholder="Display name"
            />
          </div>
          <div>
            <FieldLabel>Context length (tokens)</FieldLabel>
            <Input
              type="number"
              min={1}
              value={overrides.context_length ?? ''}
              onChange={(e) => onSetField('context_length', parseIntOrUndef(e.target.value))}
              placeholder="e.g. 128000"
            />
          </div>
        </div>
        <div>
          <FieldLabel>Description</FieldLabel>
          <Input
            value={overrides.description ?? ''}
            onChange={(e) =>
              onSetField('description', e.target.value === '' ? undefined : e.target.value)
            }
            placeholder="Short description"
          />
        </div>
      </Section>

      {/* Pricing */}
      <Section
        title="Pricing ($/token)"
        size="md"
        bodyStyle={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}
      >
        <div>
          <FieldLabel>Prompt</FieldLabel>
          <Input
            value={overrides.pricing?.prompt ?? ''}
            onChange={(e) =>
              onSetPricing('prompt', e.target.value === '' ? undefined : e.target.value)
            }
            placeholder="0.000003"
          />
        </div>
        <div>
          <FieldLabel>Completion</FieldLabel>
          <Input
            value={overrides.pricing?.completion ?? ''}
            onChange={(e) =>
              onSetPricing('completion', e.target.value === '' ? undefined : e.target.value)
            }
            placeholder="0.000015"
          />
        </div>
        <div>
          <FieldLabel>Input cache read</FieldLabel>
          <Input
            value={overrides.pricing?.input_cache_read ?? ''}
            onChange={(e) =>
              onSetPricing('input_cache_read', e.target.value === '' ? undefined : e.target.value)
            }
            placeholder="0.0000003"
          />
        </div>
        <div>
          <FieldLabel>Input cache write</FieldLabel>
          <Input
            value={overrides.pricing?.input_cache_write ?? ''}
            onChange={(e) =>
              onSetPricing('input_cache_write', e.target.value === '' ? undefined : e.target.value)
            }
            placeholder="0.00000375"
          />
        </div>
      </Section>

      {/* Architecture */}
      <Section
        title="Architecture"
        size="md"
        bodyStyle={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}
      >
        <div>
          <FieldLabel>Input modalities</FieldLabel>
          <TagSelect
            colorize
            placeholder="Add modalities..."
            options={MODALITY_SUGGESTIONS}
            selected={overrides.architecture?.input_modalities ?? []}
            allowCustom
            onChange={(list) =>
              onSetArchitecture('input_modalities', list.length > 0 ? list : undefined)
            }
          />
        </div>
        <div>
          <FieldLabel>Output modalities</FieldLabel>
          <TagSelect
            colorize
            placeholder="Add modalities..."
            options={MODALITY_SUGGESTIONS}
            selected={overrides.architecture?.output_modalities ?? []}
            allowCustom
            onChange={(list) =>
              onSetArchitecture('output_modalities', list.length > 0 ? list : undefined)
            }
          />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <FieldLabel>Tokenizer</FieldLabel>
          <Input
            value={overrides.architecture?.tokenizer ?? ''}
            onChange={(e) =>
              onSetArchitecture('tokenizer', e.target.value === '' ? undefined : e.target.value)
            }
            placeholder="e.g. cl100k_base"
          />
        </div>
      </Section>

      {/* Capabilities */}
      <Section
        title="Capabilities"
        size="md"
        bodyStyle={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        <div>
          <FieldLabel>Supported parameters</FieldLabel>
          <TagSelect
            colorize
            placeholder="Add parameters..."
            options={SUPPORTED_PARAM_SUGGESTIONS}
            selected={overrides.supported_parameters ?? []}
            allowCustom
            onChange={(list) =>
              onSetField('supported_parameters', list.length > 0 ? list : undefined)
            }
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <FieldLabel>Top provider context length</FieldLabel>
            <Input
              type="number"
              min={1}
              value={overrides.top_provider?.context_length ?? ''}
              onChange={(e) => onSetTopProvider('context_length', parseIntOrUndef(e.target.value))}
              placeholder="e.g. 128000"
            />
          </div>
          <div>
            <FieldLabel>Max completion tokens</FieldLabel>
            <Input
              type="number"
              min={1}
              value={overrides.top_provider?.max_completion_tokens ?? ''}
              onChange={(e) =>
                onSetTopProvider('max_completion_tokens', parseIntOrUndef(e.target.value))
              }
              placeholder="e.g. 16384"
            />
          </div>
        </div>
      </Section>
    </div>
  );
}

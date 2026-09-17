import { Badge } from '../../ui/Badge';
import { SectionCard } from '../../ui/SectionCard';
import { cn } from '../../../lib/cn';
import { ReasoningRewriteRulesEditor } from '../ReasoningRewriteRulesEditor';
import { ModelOverrideRules } from './ModelOverrideRules';
import { getAdapterName, KNOWN_ADAPTERS, normalizeAdapterEntries } from './adapter-utils';
import { GPT5_SUPPRESSION_ADAPTER, isGpt5Model } from './constants';
import type { ModelConfig } from './types';

interface Props {
  modelId: string;
  modelConfig: ModelConfig;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  updateModelConfig: (modelId: string, updates: any) => void;
}

export function ModelAdapters({
  modelId,
  modelConfig,
  isOpen,
  setIsOpen,
  updateModelConfig,
}: Props) {
  const modelAdapters = normalizeAdapterEntries(modelConfig.adapter);

  return (
    <SectionCard
      size="sm"
      title="Model Adapters"
      collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      bodyClassName="bg-surface-sunken p-2"
      extra={
        modelAdapters.length > 0 ? (
          <Badge status="neutral" noDot>
            {modelAdapters.length}
          </Badge>
        ) : null
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {isGpt5Model(modelId) &&
          (() => {
            const suppressionDisabled = modelAdapters.some(
              (entry) =>
                typeof entry !== 'string' &&
                getAdapterName(entry) === GPT5_SUPPRESSION_ADAPTER &&
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
                      (entry) => getAdapterName(entry) !== GPT5_SUPPRESSION_ADAPTER
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
                    updateModelConfig(modelId, {
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
        {KNOWN_ADAPTERS.map((adapter) => {
          const active = modelAdapters.some((entry) => getAdapterName(entry) === adapter.value);
          return (
            <label
              key={adapter.value}
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
                  const next = active
                    ? modelAdapters.filter((entry) => getAdapterName(entry) !== adapter.value)
                    : [
                        ...modelAdapters,
                        {
                          name: adapter.value,
                          options:
                            adapter.value === 'model_override' ||
                            adapter.value === 'reasoning_rewrite'
                              ? { rules: [] }
                              : {},
                        },
                      ];
                  updateModelConfig(modelId, {
                    adapter: next.length > 0 ? next : undefined,
                  });
                }}
              />
              <div>
                <div className="font-sans text-[12px] font-medium text-foreground">
                  {adapter.label}
                </div>
                <div className="font-sans text-[11px] leading-snug text-foreground-muted">
                  {adapter.description}
                </div>
              </div>
            </label>
          );
        })}
        <ModelOverrideRules
          modelId={modelId}
          modelConfig={modelConfig}
          updateModelConfig={updateModelConfig}
        />
        <ReasoningRewriteRulesEditor
          adapters={modelAdapters}
          onChange={(next: any[]) => updateModelConfig(modelId, { adapter: next })}
        />
      </div>
    </SectionCard>
  );
}

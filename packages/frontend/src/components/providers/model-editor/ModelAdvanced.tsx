import { Badge } from '../../ui/Badge';
import { SectionCard } from '../../ui/SectionCard';
import { FIELD_CLS } from './constants';
import type { ModelConfig } from './types';

interface Props {
  modelId: string;
  modelConfig: ModelConfig;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  updateModelConfig: (modelId: string, updates: any) => void;
  piAiProvider?: string;
  inlineQuirksAvailable: boolean;
}

export function ModelAdvanced({
  modelId,
  modelConfig,
  isOpen,
  setIsOpen,
  updateModelConfig,
  piAiProvider,
  inlineQuirksAvailable,
}: Props) {
  const mappingReady = !!piAiProvider || inlineQuirksAvailable;
  return (
    <SectionCard
      size="sm"
      title="Advanced"
      collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      bodyClassName="bg-surface-sunken p-2"
      extra={
        <>
          {modelConfig.maxConcurrency != null && (
            <Badge status="neutral" noDot>
              Concurrency: {modelConfig.maxConcurrency}
            </Badge>
          )}
          {modelConfig.auto_compat === true && (
            <Badge status="neutral" noDot>
              Auto Compat
            </Badge>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-col gap-0.5">
          <label
            className="flex items-start gap-2 py-1 cursor-pointer"
            title={
              !mappingReady && modelConfig.auto_compat !== true
                ? 'Select a pi-ai provider or inline quirks first'
                : undefined
            }
          >
            <input
              type="checkbox"
              disabled={!mappingReady && modelConfig.auto_compat !== true}
              checked={modelConfig.auto_compat === true}
              onChange={(e) =>
                updateModelConfig(modelId, {
                  auto_compat: e.target.checked ? true : undefined,
                })
              }
            />
            <div>
              <div className="font-sans text-xs text-foreground">Auto Compat</div>
              <div className="font-sans text-label leading-snug text-foreground-muted">
                Translates this model's reasoning and generation options using its mapped pi-ai
                model or the provider's inline quirks. Requires Auto Compat here or on the provider.
              </div>
            </div>
          </label>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="font-sans text-label font-medium text-foreground-muted">
            Max Concurrency
            <span className="font-normal text-2xs text-foreground-subtle ml-1">
              this model only
            </span>
          </label>
          <input
            className={FIELD_CLS}
            type="number"
            step="1"
            min="1"
            placeholder="No limit"
            value={modelConfig.maxConcurrency != null ? modelConfig.maxConcurrency : ''}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                updateModelConfig(modelId, { maxConcurrency: undefined });
              } else {
                const val = Number(raw);
                if (Number.isFinite(val) && val >= 1) {
                  updateModelConfig(modelId, { maxConcurrency: val });
                }
              }
            }}
          />
          <span className="font-sans text-label text-foreground-subtle italic">
            Limit in-flight requests for this model. Leave empty to use the provider-wide limit or
            no limit.
          </span>
        </div>
      </div>
    </SectionCard>
  );
}

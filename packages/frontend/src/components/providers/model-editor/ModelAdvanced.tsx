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
}

export function ModelAdvanced({
  modelId,
  modelConfig,
  isOpen,
  setIsOpen,
  updateModelConfig,
}: Props) {
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
          <label className="flex items-start gap-2 py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={modelConfig.auto_compat === true}
              onChange={(e) =>
                updateModelConfig(modelId, {
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
          <span className="font-sans text-[11px] text-foreground-subtle italic">
            Limit in-flight requests for this model. Leave empty to use the provider-wide limit or
            no limit.
          </span>
        </div>
      </div>
    </SectionCard>
  );
}

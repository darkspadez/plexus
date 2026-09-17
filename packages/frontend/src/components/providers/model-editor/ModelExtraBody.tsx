import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { SectionCard } from '../../ui/SectionCard';
import { DebouncedInput } from '../../ui/DebouncedInput';
import type { ModelConfig } from './types';

interface Props {
  modelId: string;
  modelConfig: ModelConfig;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  addModelKV: (modelId: string) => void;
  updateModelKV: (modelId: string, oldKey: string, newKey: string, value: any) => void;
  removeModelKV: (modelId: string, key: string) => void;
}

export function ModelExtraBody({
  modelId,
  modelConfig,
  isOpen,
  setIsOpen,
  addModelKV,
  updateModelKV,
  removeModelKV,
}: Props) {
  return (
    <SectionCard
      size="sm"
      title="Extra Body Fields"
      collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      bodyClassName="bg-surface-sunken p-2"
      extra={
        <>
          <Badge status="neutral" noDot>
            {Object.keys(modelConfig.extraBody || {}).length}
          </Badge>
          <Button
            size="sm"
            variant="secondary"
            className="px-1.5 py-0.5 leading-none"
            onClick={(e) => {
              e.stopPropagation();
              addModelKV(modelId);
              setIsOpen(true);
            }}
          >
            <Plus size={14} />
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        {Object.entries(modelConfig.extraBody || {}).length === 0 && (
          <div className="font-sans text-[11px] text-foreground-muted italic">
            No extra body fields configured.
          </div>
        )}
        {Object.entries(modelConfig.extraBody || {}).map(
          ([key, val]: [string, any], idx: number) => (
            <div key={idx} className="flex gap-1.5">
              <DebouncedInput
                placeholder="Field Name"
                value={key}
                onChange={(newKey: string) => updateModelKV(modelId, key, newKey, val)}
                className="flex-1"
              />
              <DebouncedInput
                placeholder="Value"
                value={typeof val === 'object' ? JSON.stringify(val) : String(val)}
                onChange={(val: string) => {
                  try {
                    updateModelKV(modelId, key, key, JSON.parse(val));
                  } catch {
                    updateModelKV(modelId, key, key, val);
                  }
                }}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeModelKV(modelId, key)}
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
  );
}

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { DebouncedInput } from '../../ui/DebouncedInput';
import { getAdapterName, normalizeAdapterEntries } from './adapter-utils';
import type { ModelConfig } from './types';

interface Props {
  modelId: string;
  modelConfig: ModelConfig;
  updateModelConfig: (modelId: string, updates: any) => void;
}

export function ModelOverrideRules({ modelId, modelConfig, updateModelConfig }: Props) {
  const modelAdapters = normalizeAdapterEntries(modelConfig.adapter);
  const overrideEntry = modelAdapters.find((entry) => getAdapterName(entry) === 'model_override');
  if (!overrideEntry || typeof overrideEntry === 'string') return null;

  const rules: any[] = overrideEntry.options?.rules ?? [];
  const applyRules = (updated: any[]) => {
    const newAdapters = modelAdapters.map((entry) =>
      typeof entry !== 'string' && getAdapterName(entry) === 'model_override'
        ? { ...entry, options: { ...entry.options, rules: updated } }
        : entry
    );
    updateModelConfig(modelId, { adapter: newAdapters });
  };

  return (
    <div className="mt-1 border-t border-border pt-1.5 sm:col-span-2">
      <div className="font-sans text-[11px] font-medium text-foreground-muted mb-1">
        Model Override Rules
      </div>
      <div className="font-sans text-[10px] leading-snug text-foreground-subtle mb-2">
        When ANY condition matches, rewrite the model name. Use dotted paths like reasoning.enabled.
      </div>
      {rules.map((rule: any, rIdx: number) => (
        <div key={rIdx} className="mb-1 rounded-sm border border-border bg-surface-sunken p-1.5">
          {/* Rewrite rule */}
          <div className="font-sans text-[10px] font-medium text-foreground-subtle mb-1">
            Rewrite
          </div>
          <div className="flex items-center gap-1">
            <div
              className="flex-[2] truncate rounded-sm border border-border bg-surface px-2 py-[5px] font-sans text-[12px] text-foreground-subtle"
              title={modelId}
            >
              {modelId}
            </div>
            <span className="font-sans text-[11px] text-foreground-subtle">→</span>
            <div className="flex-1">
              <DebouncedInput
                placeholder="Rewrite to (e.g. deepseek-r1-fast)"
                value={rule.rewriteTo ?? ''}
                onChange={(val: string) => {
                  const updated = [...rules];
                  updated[rIdx] = { ...updated[rIdx], rewriteTo: val };
                  applyRules(updated);
                }}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => applyRules(rules.filter((_rule: any, i: number) => i !== rIdx))}
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
                    newConditions[cIdx] = { ...newConditions[cIdx], field: val };
                    updated[rIdx] = { ...updated[rIdx], conditions: newConditions };
                    applyRules(updated);
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
                    newConditions[cIdx] = { field: newConditions[cIdx].field, value: parsed };
                    updated[rIdx] = { ...updated[rIdx], conditions: newConditions };
                    applyRules(updated);
                  }}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const updated = [...rules];
                  const newConditions = updated[rIdx].conditions.filter(
                    (_condition: any, i: number) => i !== cIdx
                  );
                  updated[rIdx] = { ...updated[rIdx], conditions: newConditions };
                  applyRules(updated);
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
              applyRules(updated);
            }}
            className="ml-2 px-1.5 py-0.5"
          >
            <Plus size={12} /> <span className="font-sans text-[10px]">Condition</span>
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          applyRules([...rules, { model: modelId, rewriteTo: '', conditions: [{ field: '' }] }])
        }
        className="mt-0.5"
      >
        <Plus size={12} /> <span className="font-sans text-[10px]">Rule</span>
      </Button>
    </div>
  );
}

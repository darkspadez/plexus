import { CheckCircle, Download, Loader2, Play, Plus, X, XCircle } from 'lucide-react';
import type { Provider } from '../../../lib/api';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { CopyButton } from '../../ui/CopyButton';
import { DebouncedInput } from '../../ui/DebouncedInput';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { SectionCard } from '../../ui/SectionCard';
import { Switch } from '../../ui/Switch';
import { NotConfigured } from '../KVSection';
import type { ModelConfig, ModelTestState } from './types';

interface Props {
  editingProvider: Provider;
  setEditingProvider: React.Dispatch<React.SetStateAction<Provider>>;
  testStates: Record<string, ModelTestState>;
  addModel: () => void;
  onOpenFetchModels: () => void;
  onTestModel: (providerId: string, modelId: string, modelType?: string) => void;
  onSelectModel: (modelId: string) => void;
  onRemoveModel: (modelId: string) => void;
  isNewProvider: boolean;
  piProviders: string[];
  piProviderCustom: boolean;
  setPiProviderCustom: (value: boolean) => void;
}

export function ModelList({
  editingProvider,
  setEditingProvider,
  testStates,
  addModel,
  onOpenFetchModels,
  onTestModel,
  onSelectModel,
  onRemoveModel,
  isNewProvider,
  piProviders,
  piProviderCustom,
  setPiProviderCustom,
}: Props) {
  const models = (editingProvider.models || {}) as Record<string, ModelConfig>;
  const modelCount = Object.keys(models).length;

  return (
    <SectionCard
      title="Models"
      extra={
        <>
          {modelCount > 0 ? <Badge status="success">{modelCount} Models</Badge> : <NotConfigured />}
          <Button
            size="sm"
            variant="secondary"
            onClick={onOpenFetchModels}
            leftIcon={<Download size={14} />}
          >
            Fetch Models
          </Button>
          <Button size="sm" variant="secondary" leftIcon={<Plus size={14} />} onClick={addModel}>
            Add Model
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          {!piProviderCustom ? (
            <Select
              label="pi-ai Provider"
              value={editingProvider.pi_ai_provider ?? ''}
              onChange={(raw) => {
                if (raw === '__custom__') {
                  setPiProviderCustom(true);
                  return;
                }
                setEditingProvider({
                  ...editingProvider,
                  pi_ai_provider: raw || undefined,
                });
              }}
              options={[
                { value: '', label: '— none —' },
                ...piProviders.map((p) => ({ value: p, label: p })),
                { value: '__custom__', label: 'custom...' },
              ]}
            />
          ) : (
            <Input
              label="pi-ai Provider"
              type="text"
              placeholder="e.g. anthropic, openai"
              value={editingProvider.pi_ai_provider ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                setEditingProvider({
                  ...editingProvider,
                  pi_ai_provider: raw || undefined,
                });
              }}
              autoFocus
              trailingAction={
                <button
                  type="button"
                  className="px-1 font-sans text-[11px] text-foreground-subtle hover:text-foreground"
                  title="Back to list"
                  onClick={() => setPiProviderCustom(false)}
                >
                  ↩
                </button>
              }
            />
          )}
          <div className="flex flex-col gap-1">
            <label className="font-sans text-[13px] font-medium text-foreground-muted">
              Model Autosync
            </label>
            <div className="flex h-[38px] items-center gap-2">
              <Switch
                aria-label="Enable Model Autosync"
                checked={editingProvider.modelAutosync?.enabled === true}
                onChange={(enabled) => {
                  setEditingProvider({
                    ...editingProvider,
                    modelAutosync: {
                      enabled,
                      intervalMinutes: Math.max(
                        1,
                        editingProvider.modelAutosync?.intervalMinutes || 60
                      ),
                    },
                  });
                }}
              />
              <span className="font-sans text-[11px] text-foreground-muted">every</span>
              <DebouncedInput
                type="number"
                min={1}
                step={1}
                disabled={editingProvider.modelAutosync?.enabled !== true}
                value={String(editingProvider.modelAutosync?.intervalMinutes || 60)}
                onChange={(val: string) => {
                  const intervalMinutes = Math.max(1, parseInt(val, 10) || 60);
                  setEditingProvider({
                    ...editingProvider,
                    modelAutosync: {
                      enabled: editingProvider.modelAutosync?.enabled === true,
                      intervalMinutes,
                    },
                  });
                }}
                className="w-20"
              />
              <span className="font-sans text-[11px] whitespace-nowrap text-foreground-muted">
                min
              </span>
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="flex flex-col gap-1.5">
          {modelCount === 0 && (
            <div className="font-sans text-[11px] italic text-foreground-muted">
              No models configured. Fetch them from the provider or add one manually.
            </div>
          )}
          {Object.entries(models).map(([modelId, modelConfig]) => {
            const testKey = `${editingProvider.id}-${modelId}`;
            const testState = testStates[testKey];
            return (
              <div
                key={modelId}
                className="flex items-center gap-1 rounded-md border border-border bg-surface transition-colors duration-150 hover:bg-surface-elevated"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 flex items-center gap-2 rounded-md px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                  onClick={() => onSelectModel(modelId)}
                >
                  <span className="min-w-0 flex-1 truncate font-sans text-[12px] font-medium text-foreground">
                    {modelId}
                  </span>
                  <span className="flex-shrink-0 font-sans text-[10px] text-foreground-subtle">
                    {modelConfig.type || 'text'}
                  </span>
                </button>
                <div className="flex flex-shrink-0 items-center gap-2 pr-2">
                  {testState?.showMessage && testState.result === 'error' && testState.message && (
                    <Badge status="danger" title={testState.message}>
                      Error
                    </Badge>
                  )}
                  <div
                    onClick={(e) => {
                      if (isNewProvider) return;
                      e.stopPropagation();
                      onTestModel(editingProvider.id, modelId, modelConfig.type);
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
                  <CopyButton value={`direct/${editingProvider.id}/${modelId}`} size="sm" />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveModel(modelId);
                    }}
                    aria-label={`Remove model ${modelId}`}
                    className="text-danger p-0.5"
                  >
                    <X size={12} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

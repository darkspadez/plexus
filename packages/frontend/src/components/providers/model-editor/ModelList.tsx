import { useState } from 'react';
import { CheckCircle, Download, Loader2, Play, Plus, X, XCircle } from 'lucide-react';
import type { Provider } from '../../../lib/api';
import { api } from '../../../lib/api';
import {
  collectProviderEndpointUrls,
  isOAuthProviderDraft,
  PI_AI_AUTO_VALUE,
} from '../../../lib/piAiProvider';
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
  const [piProviderResolving, setPiProviderResolving] = useState(false);
  const piProviderLabel = editingProvider.pi_ai_quirks
    ? 'pi-ai Provider (inline quirks active)'
    : 'pi-ai Provider';

  // Apply a manual pi-ai provider choice: picking a provider clears inline
  // quirks; clearing it (with no quirks left) turns Auto Compat off.
  const applyPiProvider = (raw: string) => {
    setEditingProvider({
      ...editingProvider,
      pi_ai_provider: raw || undefined,
      pi_ai_quirks: raw ? undefined : editingProvider.pi_ai_quirks,
      auto_compat: raw || editingProvider.pi_ai_quirks ? editingProvider.auto_compat : false,
    });
  };

  // Resolve `- auto -` to the concrete pi-ai provider matching the current
  // endpoint URLs / OAuth provider. `- auto -` is never a stored selection:
  // it becomes the resolved entry, or leaves the selection unchanged when
  // nothing matches.
  const resolvePiAiAuto = async () => {
    const urls = collectProviderEndpointUrls(editingProvider.apiBaseUrl);
    const oauthProvider = isOAuthProviderDraft(editingProvider.apiBaseUrl)
      ? editingProvider.oauthProvider?.trim() || undefined
      : undefined;
    setPiProviderResolving(true);
    try {
      const resolved = await api.resolvePiAiProvider({ urls, oauthProvider });
      if (resolved) {
        setEditingProvider((prev) => ({
          ...prev,
          pi_ai_provider: resolved,
          pi_ai_quirks: undefined,
          auto_compat: true,
        }));
      }
    } catch {
      // non-fatal — leave the previous selection in place
    } finally {
      setPiProviderResolving(false);
    }
  };

  return (
    <SectionCard
      title="Models"
      extra={
        <>
          {modelCount > 0 ? <Badge status="success">{modelCount} Models</Badge> : <NotConfigured />}
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenFetchModels}
            leftIcon={<Download size="0.875rem" />}
          >
            Fetch Models
          </Button>
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Plus size="0.875rem" />}
            onClick={addModel}
          >
            Add Model
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          {!piProviderCustom ? (
            <Select
              label={piProviderLabel}
              value={editingProvider.pi_ai_provider ?? ''}
              disabled={piProviderResolving}
              title={
                piProviderResolving
                  ? 'Resolving pi-ai provider…'
                  : 'Pick - auto - to detect from the endpoint URLs or OAuth provider'
              }
              onChange={(raw) => {
                if (raw === '__custom__') {
                  setPiProviderCustom(true);
                  return;
                }
                if (raw === PI_AI_AUTO_VALUE) {
                  void resolvePiAiAuto();
                  return;
                }
                applyPiProvider(raw);
              }}
              options={[
                { value: '', label: '— none —' },
                { value: PI_AI_AUTO_VALUE, label: '- auto -' },
                ...piProviders.map((p) => ({ value: p, label: p })),
                { value: '__custom__', label: 'custom...' },
              ]}
            />
          ) : (
            <Input
              label={piProviderLabel}
              type="text"
              placeholder="e.g. anthropic, openai"
              value={editingProvider.pi_ai_provider ?? ''}
              onChange={(e) => {
                applyPiProvider(e.target.value);
              }}
              autoFocus
              trailingAction={
                <button
                  type="button"
                  className="px-1 font-sans text-label text-foreground-subtle hover:text-foreground"
                  title="Back to list"
                  onClick={() => setPiProviderCustom(false)}
                >
                  ↩
                </button>
              }
            />
          )}
          <div className="flex flex-col gap-1">
            <label className="font-sans text-sm font-medium text-foreground-muted">
              Model Autosync
            </label>
            <div className="flex h-[2.375rem] items-center gap-2">
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
              <span className="font-sans text-label text-foreground-muted">every</span>
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
              <span className="font-sans text-label whitespace-nowrap text-foreground-muted">
                min
              </span>
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="flex flex-col gap-1.5">
          {modelCount === 0 && (
            <div className="font-sans text-label italic text-foreground-muted">
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
                  className="min-w-0 flex-1 flex items-center gap-2 rounded-md px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
                  onClick={() => onSelectModel(modelId)}
                >
                  <span className="min-w-0 flex-1 truncate font-sans text-xs font-medium text-foreground">
                    {modelId}
                  </span>
                  <span className="flex-shrink-0 font-sans text-2xs text-foreground-subtle">
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
                      <Loader2 size="0.875rem" className="animate-spin text-foreground-muted" />
                    ) : testState?.showResult && testState.result === 'success' ? (
                      <CheckCircle size="0.875rem" className="text-success-text" />
                    ) : testState?.showResult && testState.result === 'error' ? (
                      <XCircle size="0.875rem" className="text-danger-text" />
                    ) : (
                      <Play size="0.875rem" className="text-primary-text opacity-60" />
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
                    className="text-danger-text p-0.5"
                  >
                    <X size="0.75rem" />
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

import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle, Loader2, Play, X, XCircle } from 'lucide-react';
import { CopyButton } from '../ui/CopyButton';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { Provider } from '../../lib/api';
import { api } from '../../lib/api';
import { ModelCard } from './model-editor/ModelCard';
import { ModelList } from './model-editor/ModelList';
import { renameRecordKey, removeRecordKey } from './model-editor/adapter-utils';
import { CODEX_OAUTH_PROVIDER } from './model-editor/constants';
import { usePiAiModels } from './model-editor/usePiAiModels';
import type { ModelTestState } from './model-editor/types';

interface Props {
  editingProvider: Provider;
  setEditingProvider: React.Dispatch<React.SetStateAction<Provider>>;
  selectedModelId: string | null;
  setSelectedModelId: (v: string | null) => void;
  isModelExtraBodyOpen: Record<string, boolean>;
  setIsModelExtraBodyOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  testStates: Record<string, ModelTestState>;
  onDismissTestMessage: (testKey: string) => void;
  addModel: () => void;
  updateModelId: (oldId: string, newId: string) => void;
  updateModelConfig: (modelId: string, updates: any) => void;
  removeModel: (modelId: string) => void;
  addModelKV: (modelId: string) => void;
  updateModelKV: (modelId: string, oldKey: string, newKey: string, value: any) => void;
  removeModelKV: (modelId: string, key: string) => void;
  onOpenFetchModels: () => void;
  onTestModel: (providerId: string, modelId: string, modelType?: string) => void;
  getApiBaseUrlMap: () => Record<string, string>;
  isNewProvider: boolean;
  isOAuthMode: boolean;
}

export function ProviderModelsEditor({
  editingProvider,
  setEditingProvider,
  selectedModelId,
  setSelectedModelId,
  isModelExtraBodyOpen,
  setIsModelExtraBodyOpen,
  testStates,
  addModel,
  updateModelId,
  updateModelConfig,
  removeModel,
  addModelKV,
  updateModelKV,
  removeModelKV,
  onOpenFetchModels,
  onTestModel,
  onDismissTestMessage,
  getApiBaseUrlMap,
  isNewProvider,
  isOAuthMode,
}: Props) {
  const [modelAdaptersOpen, setModelAdaptersOpen] = useState<Record<string, boolean>>({});
  const [modelAdvancedOpen, setModelAdvancedOpen] = useState<Record<string, boolean>>({});

  // pi-ai provider dropdown (toolbar) — select-or-custom, like the model IDs below
  const [piProviders, setPiProviders] = useState<string[]>([]);
  const [piProviderCustom, setPiProviderCustom] = useState(false);

  useEffect(() => {
    api
      .getPiProviders()
      .then(setPiProviders)
      .catch(() => {
        /* non-fatal — falls back to custom text input */
      });
  }, []);

  const piAiProvider = editingProvider.pi_ai_provider;
  const piAiModels = usePiAiModels(piAiProvider, editingProvider.models);

  // Flip to custom mode when the current value isn't a known pi-ai provider
  useEffect(() => {
    if (piAiProvider && piProviders.length > 0 && !piProviders.includes(piAiProvider)) {
      setPiProviderCustom(true);
    }
  }, [piAiProvider, piProviders]);

  // Codex Images rides the provider's ChatGPT OAuth session instead of a base
  // URL, so it is offered only on an OAuth provider whose backend is Codex —
  // and there it is the only image protocol the dispatcher will accept.
  const isCodexOAuthProvider =
    isOAuthMode && editingProvider.oauthProvider === CODEX_OAUTH_PROVIDER;

  const models = (editingProvider.models || {}) as Record<string, any>;

  // Renaming/removing a model must also keep every keyed-by-modelId piece of
  // local UI state (accordion open/closed, pi-ai custom-mode flag) in sync —
  // otherwise it silently resets or leaks a stale entry. `isModelExtraBodyOpen`
  // is owned by useProviderForm, which already migrates/removes that key (along
  // with testStates) itself — see updateModelId/removeModel there.
  const handleUpdateModelId = (oldId: string, newId: string) => {
    if (oldId === newId) return;
    setModelAdaptersOpen((prev) => renameRecordKey(prev, oldId, newId));
    setModelAdvancedOpen((prev) => renameRecordKey(prev, oldId, newId));
    piAiModels.renameModelId(oldId, newId);
    updateModelId(oldId, newId);
  };

  const handleRemoveModel = (modelId: string) => {
    setModelAdaptersOpen((prev) => removeRecordKey(prev, modelId));
    setModelAdvancedOpen((prev) => removeRecordKey(prev, modelId));
    piAiModels.removeModelId(modelId);
    removeModel(modelId);
  };

  // Probe / copy / remove cluster — shared by the list rows and the detail-view header.
  const renderModelActions = (mId: string, mCfg: any, opts?: { errorBadge?: boolean }) => {
    const testKey = `${editingProvider.id}-${mId}`;
    const testState = testStates[testKey];
    return (
      <>
        {opts?.errorBadge &&
          testState?.showMessage &&
          testState.result === 'error' &&
          testState.message && (
            <Badge status="danger" title={testState.message}>
              Error
            </Badge>
          )}
        <div
          onClick={(e) => {
            if (isNewProvider) return;
            e.stopPropagation();
            onTestModel(editingProvider.id, mId, mCfg.type);
          }}
          className={
            isNewProvider
              ? 'flex items-center cursor-not-allowed opacity-40'
              : 'flex items-center cursor-pointer'
          }
          title={isNewProvider ? 'Save the provider first to probe models' : 'Test this model'}
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
        <CopyButton value={`direct/${editingProvider.id}/${mId}`} size="sm" />
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            handleRemoveModel(mId);
          }}
          aria-label={`Remove model ${mId}`}
          className="text-danger p-0.5"
        >
          <X size={12} />
        </Button>
      </>
    );
  };

  // ── Detail subview: one model, full editor, "Back to models" to return ──
  if (selectedModelId != null && models[selectedModelId]) {
    const modelId = selectedModelId;
    const modelConfig = models[modelId];
    const testKey = `${editingProvider.id}-${modelId}`;
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft size={14} />}
            onClick={() => setSelectedModelId(null)}
          >
            Back to models
          </Button>
          <div className="flex items-center gap-2">{renderModelActions(modelId, modelConfig)}</div>
        </div>
        <ModelCard
          modelId={modelId}
          modelConfig={modelConfig}
          testState={testStates[testKey]}
          testKey={testKey}
          onDismissTestMessage={onDismissTestMessage}
          onUpdateModelId={handleUpdateModelId}
          updateModelConfig={updateModelConfig}
          modelAdaptersOpen={modelAdaptersOpen[modelId] ?? false}
          setModelAdaptersOpen={(open) =>
            setModelAdaptersOpen((prev) => ({ ...prev, [modelId]: open }))
          }
          modelAdvancedOpen={modelAdvancedOpen[modelId] ?? false}
          setModelAdvancedOpen={(open) =>
            setModelAdvancedOpen((prev) => ({ ...prev, [modelId]: open }))
          }
          modelExtraBodyOpen={isModelExtraBodyOpen[modelId] ?? false}
          setModelExtraBodyOpen={(open) =>
            setIsModelExtraBodyOpen((prev) => ({ ...prev, [modelId]: open }))
          }
          addModelKV={addModelKV}
          updateModelKV={updateModelKV}
          removeModelKV={removeModelKV}
          piAiProvider={piAiProvider}
          piModels={piAiModels.piModels}
          piModelCustom={piAiModels.piModelCustom}
          setPiModelCustom={piAiModels.setPiModelCustom}
          isCodexOAuthProvider={isCodexOAuthProvider}
          getApiBaseUrlMap={getApiBaseUrlMap}
        />
      </div>
    );
  }

  // ── List view: toolbar (catalog + autosync + fetch/add) over compact rows ──
  return (
    <ModelList
      editingProvider={editingProvider}
      setEditingProvider={setEditingProvider}
      testStates={testStates}
      addModel={addModel}
      onOpenFetchModels={onOpenFetchModels}
      onTestModel={onTestModel}
      onSelectModel={setSelectedModelId}
      onRemoveModel={handleRemoveModel}
      isNewProvider={isNewProvider}
      piProviders={piProviders}
      piProviderCustom={piProviderCustom}
      setPiProviderCustom={setPiProviderCustom}
    />
  );
}

import { ModelAdapters } from './ModelAdapters';
import { ModelAdvanced } from './ModelAdvanced';
import { ModelExtraBody } from './ModelExtraBody';
import { ModelIdentity } from './ModelIdentity';
import { ModelPricing } from './ModelPricing';
import type { ModelConfig, ModelTestState } from './types';
import type { PiAiModel } from './usePiAiModels';

interface Props {
  modelId: string;
  modelConfig: ModelConfig;
  testState?: ModelTestState;
  onDismissTestMessage: (testKey: string) => void;
  testKey: string;
  onUpdateModelId: (oldId: string, newId: string) => void;
  updateModelConfig: (modelId: string, updates: any) => void;
  modelAdaptersOpen: boolean;
  setModelAdaptersOpen: (open: boolean) => void;
  modelAdvancedOpen: boolean;
  setModelAdvancedOpen: (open: boolean) => void;
  modelExtraBodyOpen: boolean;
  setModelExtraBodyOpen: (open: boolean) => void;
  addModelKV: (modelId: string) => void;
  updateModelKV: (modelId: string, oldKey: string, newKey: string, value: any) => void;
  removeModelKV: (modelId: string, key: string) => void;
  piAiProvider?: string;
  piModels: PiAiModel[];
  piModelCustom: Record<string, boolean>;
  setPiModelCustom: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  isCodexOAuthProvider: boolean;
  getApiBaseUrlMap: () => Record<string, string>;
}

// Detail view for a single model — reached from ModelList's row navigation
// (`selectedModelId`), not an inline accordion. Always fully expanded.
export function ModelCard({
  modelId,
  modelConfig,
  testState,
  onDismissTestMessage,
  testKey,
  onUpdateModelId,
  updateModelConfig,
  modelAdaptersOpen,
  setModelAdaptersOpen,
  modelAdvancedOpen,
  setModelAdvancedOpen,
  modelExtraBodyOpen,
  setModelExtraBodyOpen,
  addModelKV,
  updateModelKV,
  removeModelKV,
  piAiProvider,
  piModels,
  piModelCustom,
  setPiModelCustom,
  isCodexOAuthProvider,
  getApiBaseUrlMap,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3">
      {testState?.showMessage && testState.result === 'error' && testState.message && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onDismissTestMessage(testKey);
          }}
          className="cursor-pointer rounded border border-danger/30 bg-danger/10 px-2 py-1"
          title="Click to dismiss"
        >
          <span className="text-[11px] italic text-danger">{testState.message} [×]</span>
        </div>
      )}

      {/* 2-column primary layout: left = identity, right = pricing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start">
        <ModelIdentity
          modelId={modelId}
          modelConfig={modelConfig}
          updateModelConfig={updateModelConfig}
          onUpdateModelId={onUpdateModelId}
          piAiProvider={piAiProvider}
          piModels={piModels}
          piModelCustom={piModelCustom}
          setPiModelCustom={setPiModelCustom}
          isCodexOAuthProvider={isCodexOAuthProvider}
          getApiBaseUrlMap={getApiBaseUrlMap}
        />
        <ModelPricing
          modelId={modelId}
          modelConfig={modelConfig}
          updateModelConfig={updateModelConfig}
        />
      </div>

      <ModelAdapters
        modelId={modelId}
        modelConfig={modelConfig}
        isOpen={modelAdaptersOpen}
        setIsOpen={setModelAdaptersOpen}
        updateModelConfig={updateModelConfig}
      />
      <ModelExtraBody
        modelId={modelId}
        modelConfig={modelConfig}
        isOpen={modelExtraBodyOpen}
        setIsOpen={setModelExtraBodyOpen}
        addModelKV={addModelKV}
        updateModelKV={updateModelKV}
        removeModelKV={removeModelKV}
      />
      <ModelAdvanced
        modelId={modelId}
        modelConfig={modelConfig}
        isOpen={modelAdvancedOpen}
        setIsOpen={setModelAdvancedOpen}
        updateModelConfig={updateModelConfig}
      />
    </div>
  );
}

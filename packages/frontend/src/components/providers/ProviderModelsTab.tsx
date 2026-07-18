import { ProviderModelsEditor } from './ProviderModelsEditor';
import type { ProviderFormApi } from '../../hooks/useProviderForm';

export function ProviderModelsTab({ f }: { f: ProviderFormApi }) {
  return (
    <ProviderModelsEditor
      editingProvider={f.editingProvider}
      setEditingProvider={f.setEditingProvider}
      selectedModelId={f.selectedModelId}
      setSelectedModelId={f.setSelectedModelId}
      isModelExtraBodyOpen={f.isModelExtraBodyOpen}
      setIsModelExtraBodyOpen={f.setIsModelExtraBodyOpen}
      testStates={f.testStates}
      addModel={f.addModel}
      updateModelId={f.updateModelId}
      updateModelConfig={f.updateModelConfig}
      removeModel={f.removeModel}
      addModelKV={f.addModelKV}
      updateModelKV={f.updateModelKV}
      removeModelKV={f.removeModelKV}
      onOpenFetchModels={f.handleOpenFetchModels}
      onTestModel={f.handleTestModel}
      onDismissTestMessage={f.dismissTestMessage}
      getApiBaseUrlMap={f.getApiBaseUrlMap}
      isNewProvider={!f.originalId}
    />
  );
}

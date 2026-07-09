import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Pill } from '../chips/Pill';
import { Download } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { FetchedModel } from '../../hooks/useProviderForm';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  modelsUrl: string;
  setModelsUrl: (url: string) => void;
  isFetchingModels: boolean;
  fetchedModels: FetchedModel[];
  selectedModelIds: Set<string>;
  fetchError: string | null;
  isOAuthMode: boolean;
  onFetch: () => Promise<void>;
  onToggleSelection: (modelId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onAddSelected: () => void;
}

export function FetchModelsModal({
  isOpen,
  onClose,
  modelsUrl,
  setModelsUrl,
  isFetchingModels,
  fetchedModels,
  selectedModelIds,
  fetchError,
  isOAuthMode,
  onFetch,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onAddSelected,
}: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Fetch Models from Provider"
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onAddSelected} disabled={selectedModelIds.size === 0}>
            Add {selectedModelIds.size} Model{selectedModelIds.size !== 1 ? 's' : ''}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Input
              label="Models Endpoint URL"
              value={modelsUrl}
              onChange={(e) => setModelsUrl(e.target.value)}
              placeholder={
                isOAuthMode
                  ? 'OAuth providers use built-in model lists'
                  : 'https://api.example.com/v1/models'
              }
              disabled={isOAuthMode}
            />
          </div>
          <Button
            onClick={onFetch}
            isLoading={isFetchingModels}
            leftIcon={<Download size={16} />}
            className="w-full sm:w-auto"
          >
            Fetch
          </Button>
        </div>
        {fetchError && (
          <div className="rounded-sm border border-danger/30 bg-danger/10 p-3 text-[13px] text-danger">
            {fetchError}
          </div>
        )}
        {fetchedModels.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="font-sans text-[13px] font-medium text-foreground-muted">
                Available Models ({fetchedModels.length})
              </label>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={onSelectAll}>
                  Select All
                </Button>
                <Button size="sm" variant="ghost" onClick={onClearSelection}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="max-h-[400px] overflow-y-auto rounded-sm border border-border bg-background">
              {fetchedModels.map((model) => {
                const contextLengthK = model.context_length
                  ? `${(model.context_length / 1000).toFixed(0)}K`
                  : null;
                return (
                  <div
                    key={model.id}
                    onClick={() => onToggleSelection(model.id)}
                    className={cn(
                      'cursor-pointer border-b border-border p-3 transition-colors duration-150 hover:bg-surface-elevated',
                      selectedModelIds.has(model.id) ? 'bg-surface-elevated' : 'bg-transparent'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedModelIds.has(model.id)}
                        onChange={() => onToggleSelection(model.id)}
                        className="mt-0.5 cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-foreground">
                            {model.id}
                          </span>
                          {contextLengthK && (
                            <Pill tone="success" size="sm">
                              {contextLengthK}
                            </Pill>
                          )}
                        </div>
                        {model.name && model.name !== model.id && (
                          <div className="mb-0.5 text-[12px] text-foreground-muted">
                            {model.name}
                          </div>
                        )}
                        {model.description && (
                          <div className="mt-1 text-[11px] leading-snug text-foreground-subtle">
                            {model.description.length > 150
                              ? `${model.description.substring(0, 150)}...`
                              : model.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {!isFetchingModels && fetchedModels.length === 0 && !fetchError && (
          <div className="p-8 text-center text-[13px] italic text-foreground-muted">
            {isOAuthMode
              ? 'Click Fetch to load known OAuth models'
              : 'Enter a URL and click Fetch to load available models'}
          </div>
        )}
      </div>
    </Modal>
  );
}

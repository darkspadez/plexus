import { useEffect, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { apiAccessToKey, hasApiAccess, toggleApiAccess } from '../../../lib/apiFormats';
import { Select } from '../../ui/Select';
import { Input } from '../../ui/Input';
import { Tooltip } from '../../ui/Tooltip';
import { cn } from '../../../lib/cn';
import type { PiAiModel } from './usePiAiModels';
import {
  API_ACCESS_OPTIONS,
  CODEX_IMAGE_ACCESS,
  CODEX_IMAGE_API_ACCESS_OPTIONS,
  DEFAULT_IMAGE_ACCESS,
  FIELD_CLS,
  getApiBadgeClass,
  IMAGE_API_ACCESS_OPTIONS,
} from './constants';
import type { ModelConfig } from './types';

function ModelIdInputCompact({
  modelId,
  onCommit,
}: {
  modelId: string;
  onCommit: (oldId: string, newId: string) => void;
}) {
  const [draftId, setDraftId] = useState(modelId);

  useEffect(() => {
    setDraftId(modelId);
  }, [modelId]);

  const commit = () => {
    if (!draftId || draftId === modelId) return;
    onCommit(modelId, draftId);
  };

  return (
    <input
      className={FIELD_CLS}
      value={draftId}
      onChange={(e) => setDraftId(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

interface Props {
  modelId: string;
  modelConfig: ModelConfig;
  updateModelConfig: (modelId: string, updates: any) => void;
  onUpdateModelId: (oldId: string, newId: string) => void;
  piAiProvider?: string;
  piModels: PiAiModel[];
  piModelCustom: Record<string, boolean>;
  setPiModelCustom: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  isCodexOAuthProvider: boolean;
  getApiBaseUrlMap: () => Record<string, string>;
}

export function ModelIdentity({
  modelId,
  modelConfig,
  updateModelConfig,
  onUpdateModelId,
  piAiProvider,
  piModels,
  piModelCustom,
  setPiModelCustom,
  isCodexOAuthProvider,
  getApiBaseUrlMap,
}: Props) {
  const mCfg = modelConfig;
  const imageAccessOptions = isCodexOAuthProvider
    ? CODEX_IMAGE_API_ACCESS_OPTIONS
    : IMAGE_API_ACCESS_OPTIONS;
  const defaultImageAccess = isCodexOAuthProvider ? CODEX_IMAGE_ACCESS : DEFAULT_IMAGE_ACCESS;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Compact Model ID — bypasses Input component's py-2 */}
      <div className="flex flex-col gap-1">
        <label className="font-sans text-[11px] font-medium text-foreground-muted">Model ID</label>
        <ModelIdInputCompact modelId={modelId} onCommit={onUpdateModelId} />
      </div>
      <Select
        label="Model Type"
        value={mCfg.type || 'text'}
        onChange={(value) => {
          const newType = value as 'text' | 'embeddings' | 'transcriptions' | 'speech' | 'image';
          if (newType === 'embeddings')
            updateModelConfig(modelId, {
              type: newType,
              access_via: ['embeddings'],
            });
          else if (newType === 'transcriptions')
            updateModelConfig(modelId, {
              type: newType,
              access_via: ['transcriptions'],
            });
          else if (newType === 'speech')
            updateModelConfig(modelId, { type: newType, access_via: ['speech'] });
          else if (newType === 'image')
            updateModelConfig(modelId, {
              type: newType,
              access_via: [defaultImageAccess],
            });
          else updateModelConfig(modelId, { type: newType });
        }}
        options={[
          { value: 'text', label: 'Text' },
          { value: 'embeddings', label: 'Embeddings' },
          { value: 'transcriptions', label: 'Transcriptions' },
          { value: 'speech', label: 'Speech' },
          { value: 'image', label: 'Image' },
        ]}
      />

      {(!mCfg.type || mCfg.type === 'text' || mCfg.type === 'image') && (
        <div className="flex flex-col gap-1">
          <label className="font-sans text-[11px] font-medium text-foreground-muted">
            Access Via
          </label>
          <div className="flex flex-wrap gap-1 justify-start">
            {(mCfg.type === 'image' ? imageAccessOptions : API_ACCESS_OPTIONS).map((option) => {
              const key = apiAccessToKey(option);
              const selected = hasApiAccess(mCfg.access_via, key);
              return (
                <div key={key} className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-[3px]">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        if (mCfg.type === 'image') {
                          updateModelConfig(modelId, {
                            access_via: selected ? [] : [key],
                          });
                          return;
                        }

                        let next = toggleApiAccess(mCfg.access_via, option);
                        if (key === 'responses' && selected) {
                          next = next.filter((entry) => apiAccessToKey(entry) !== 'responses:lite');
                        }
                        updateModelConfig(modelId, { access_via: next });
                      }}
                    />
                    <span
                      className={cn(
                        'inline-flex items-center rounded-xl px-1.5 py-0.5 text-[10px] font-medium',
                        getApiBadgeClass(option.type),
                        selected ? 'opacity-100' : 'opacity-50'
                      )}
                    >
                      {option.label}
                    </span>
                  </label>
                  {key === 'responses' && selected && (
                    <div className="flex items-center gap-1">
                      <label className="flex cursor-pointer items-center gap-1.5 font-sans text-[11px] text-foreground-muted">
                        <input
                          type="checkbox"
                          checked={hasApiAccess(mCfg.access_via, 'responses:lite')}
                          onChange={() => {
                            const next = toggleApiAccess(mCfg.access_via, {
                              type: 'responses',
                              subtype: 'lite',
                            });
                            updateModelConfig(modelId, { access_via: next });
                          }}
                        />
                        <span>Lite</span>
                      </label>
                      <Tooltip
                        position="top"
                        content={
                          <div className="w-64 whitespace-normal font-sans leading-relaxed">
                            Passes Codex-specific Responses input through unchanged, including
                            additional tools. Enable only for targets known to support Responses
                            Lite—usually direct OpenAI or Codex endpoints. Most OpenAI-compatible
                            proxies do not support it.
                          </div>
                        }
                      >
                        <button
                          type="button"
                          aria-label="About Responses Lite"
                          className="flex h-4 w-4 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                        >
                          <Info size={12} />
                        </button>
                      </Tooltip>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {(!mCfg.access_via || mCfg.access_via.length === 0) && (
            <span className="font-sans text-[11px] text-foreground-subtle italic">
              empty = use any provider API
            </span>
          )}
          {(() => {
            const providerBaseUrlMap = getApiBaseUrlMap();
            const hasOllamaBaseUrl = Object.entries(providerBaseUrlMap).some(
              ([type, url]) => type === 'ollama' && url && url.trim() !== ''
            );
            if (hasOllamaBaseUrl && !hasApiAccess(mCfg.access_via, 'ollama')) {
              return (
                <div className="flex items-start gap-2 py-1.5 px-2 bg-info/10 border border-info/30 rounded-sm">
                  <Info size={14} className="text-info shrink-0 mt-0.5" />
                  <span className="text-[11px] text-info">
                    Provider has a native Ollama URL — select{' '}
                    <span className="font-semibold">ollama</span> above to use it.
                  </span>
                </div>
              );
            }
            return null;
          })()}
          {mCfg.type === 'image' && (
            <div className="flex items-start gap-2 py-1.5 px-2 bg-info/10 border border-info/30 rounded-sm">
              <Info size={14} className="text-info shrink-0 mt-0.5" />
              <span className="text-[11px] text-info">
                {isCodexOAuthProvider ? (
                  <>
                    Codex Images is the only image protocol available on a ChatGPT OAuth provider.
                    Requests are signed with the provider&apos;s OAuth session, so no base URL is
                    needed.
                  </>
                ) : (
                  <>
                    Choose one image protocol. OpenRouter Images targets the dedicated{' '}
                    <code>/api/v1/images</code> endpoint; OpenAI-compatible and Gemini Images use
                    their native adapters.
                  </>
                )}
              </span>
            </div>
          )}
          {mCfg.type === 'image' &&
            isCodexOAuthProvider &&
            (mCfg.access_via?.length ?? 0) > 0 &&
            !hasApiAccess(mCfg.access_via, CODEX_IMAGE_ACCESS) && (
              <div className="flex items-start gap-2 py-1.5 px-2 bg-warning/10 border border-warning/30 rounded-sm">
                <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                <span className="text-[11px] text-warning">
                  This model still targets an HTTP image protocol, which a ChatGPT OAuth provider
                  cannot serve. Select{' '}
                  <span className="font-semibold">Codex Images (ChatGPT OAuth)</span> above.
                </span>
              </div>
            )}
        </div>
      )}

      {/* pi-ai Model ID */}
      {piAiProvider && piModels.length > 0 && !piModelCustom[modelId] ? (
        <Select
          label="pi-ai Model ID"
          value={mCfg.pi_ai_model_id ?? ''}
          onChange={(raw) => {
            if (raw === '__custom__') {
              setPiModelCustom((prev) => ({ ...prev, [modelId]: true }));
              return;
            }
            updateModelConfig(modelId, {
              pi_ai_model_id: raw || undefined,
            });
          }}
          options={[
            { value: '', label: '— none —' },
            ...piModels.map((m) => ({
              value: m.id,
              label: `${m.id}${m.custom ? ' (custom)' : ''}`,
            })),
            { value: '__custom__', label: 'custom...' },
          ]}
        />
      ) : (
        <Input
          label="pi-ai Model ID"
          type="text"
          placeholder="e.g. gpt-4.1, claude-opus-4-6"
          value={mCfg.pi_ai_model_id ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            updateModelConfig(modelId, {
              pi_ai_model_id: raw || undefined,
            });
          }}
          autoFocus={!!piModelCustom[modelId]}
          trailingAction={
            piAiProvider && piModels.length > 0 && piModelCustom[modelId] ? (
              <button
                type="button"
                className="font-sans text-[11px] text-foreground-subtle hover:text-foreground px-1 flex-shrink-0"
                title="Back to list"
                onClick={() => setPiModelCustom((prev) => ({ ...prev, [modelId]: false }))}
              >
                ↩
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

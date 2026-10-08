import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { SectionCard } from '../ui/SectionCard';
import { KV_REMOVE_BUTTON_CLASS, NotConfigured } from './KVSection';
import type { Provider } from '../../lib/api';

const CONNECTION_TYPE_OPTIONS = [
  { value: 'url', label: 'Custom API URL' },
  { value: 'oauth', label: 'OAuth (pi-ai)' },
];

const CONNECTION_INFO = (
  <div className="text-label leading-relaxed">
    <span className="italic">API types determine the protocol:</span>
    <ul className="mt-1 list-disc pl-4">
      <li>
        <span className="font-semibold">chat</span> — OpenAI-compatible endpoints, including
        Ollama&apos;s <code className="text-primary-text">/v1</code> API
      </li>
      <li>
        <span className="font-semibold">completions</span> — OpenAI text/code completion endpoints
        (e.g. <code className="text-primary-text">/v1/completions</code> or FIM models)
      </li>
      <li>
        <span className="font-semibold">openrouter-images</span> — OpenRouter dedicated image API;
        use the <code className="text-primary-text">/api/v1</code> base URL
      </li>
      <li>
        <span className="font-semibold">ollama</span> — Native Ollama API, use the root URL (e.g.{' '}
        <code className="text-primary-text">http://localhost:11434</code>)
      </li>
    </ul>
  </div>
);

function OllamaUrlWarnings({ apiType, url }: { apiType: string; url: string }) {
  const urlLower = url.toLowerCase();
  const hasNativeOllamaPath =
    urlLower.includes('/api/chat') ||
    urlLower.includes('/api/generate') ||
    urlLower.includes('/api/embeddings') ||
    urlLower.includes('/api/tags');
  const hasV1Suffix = urlLower.includes('/v1');
  const showOllamaV1Warning = apiType === 'ollama' && hasV1Suffix;
  const showChatOllamaWarning = apiType === 'chat' && hasNativeOllamaPath && !hasV1Suffix;
  if (!showOllamaV1Warning && !showChatOllamaWarning) return null;
  return (
    <>
      {showOllamaV1Warning && (
        <div className="flex items-start gap-2 rounded-sm border border-warning/28 bg-warning-subtle px-2 py-1.5">
          <AlertTriangle size="0.875rem" className="mt-0.5 shrink-0 text-warning-text" />
          <span className="text-label text-warning-text">
            <span className="font-semibold">native ollama</span> type expects root URL. URLs with{' '}
            <code>/v1</code> are OpenAI-compatible — use <span className="font-semibold">chat</span>{' '}
            type.
          </span>
        </div>
      )}
      {showChatOllamaWarning && (
        <div className="flex items-start gap-2 rounded-sm border border-warning/28 bg-warning-subtle px-2 py-1.5">
          <AlertTriangle size="0.875rem" className="mt-0.5 shrink-0 text-warning-text" />
          <span className="text-label text-warning-text">
            This URL contains <code>/api/</code> paths typical of native Ollama. Use{' '}
            <span className="font-semibold">ollama</span> type if native.
          </span>
        </div>
      )}
    </>
  );
}

interface Props {
  /** API types the provider form supports (hub's list). */
  knownApis: readonly string[];
  isOAuthMode: boolean;
  getPrimaryEntry: () => { type: string; url: string };
  setPrimaryEntry: (newType: string, newUrl: string) => void;
  editingProvider: Provider;
  setEditingProvider: React.Dispatch<React.SetStateAction<Provider>>;
  OAUTH_PROVIDERS: Array<{ value: string; label: string }>;
  /** Rendered beneath the OAuth fields when in OAuth mode (OAuth login card). */
  oauthSlot?: React.ReactNode;
  // Additional Base URLs (absorbed from the retired Advanced section)
  isApiBaseUrlsOpen: boolean;
  setIsApiBaseUrlsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  getApiBaseUrlMap: () => Record<string, string>;
  addAdditionalBaseUrlEntry: () => void;
  updateApiBaseUrlEntry: (oldType: string, newType: string, url: string) => void;
  removeApiBaseUrlEntry: (apiType: string) => void;
}

export function ProviderApiUrlsEditor({
  knownApis,
  isOAuthMode,
  getPrimaryEntry,
  setPrimaryEntry,
  editingProvider,
  setEditingProvider,
  OAUTH_PROVIDERS,
  oauthSlot,
  isApiBaseUrlsOpen,
  setIsApiBaseUrlsOpen,
  getApiBaseUrlMap,
  addAdditionalBaseUrlEntry,
  updateApiBaseUrlEntry,
  removeApiBaseUrlEntry,
}: Props) {
  const { type: primaryType, url: primaryUrl } = getPrimaryEntry();
  // Base-URL map (mirrors useProviderForm's getApiBaseUrlMap) — used only to keep the
  // primary Type select from offering an API type already claimed by an "Additional
  // Base URLs" entry, which would otherwise silently overwrite that entry's URL.
  const apiBaseUrlMap: Record<string, string> =
    typeof editingProvider.apiBaseUrl === 'object' &&
    editingProvider.apiBaseUrl !== null &&
    !Array.isArray(editingProvider.apiBaseUrl)
      ? (editingProvider.apiBaseUrl as Record<string, string>)
      : {};
  const otherApiTypes = new Set(Object.keys(apiBaseUrlMap).slice(1));
  const primaryTypeOptions = knownApis
    .map((t) => ({ value: t, label: t }))
    .filter((opt) => opt.value === primaryType || !otherApiTypes.has(opt.value));
  if (primaryType && !knownApis.includes(primaryType)) {
    primaryTypeOptions.push({ value: primaryType, label: `${primaryType} (legacy)` });
  }
  const additionalBaseUrlEntries = Object.entries(apiBaseUrlMap).slice(1);

  return (
    <SectionCard title="Authentication" info={!isOAuthMode ? CONNECTION_INFO : undefined}>
      <div className="flex flex-col gap-3">
        <Select
          label="Connection Type"
          value={isOAuthMode ? 'oauth' : 'url'}
          onChange={(value) => {
            if (value === 'oauth') {
              setEditingProvider({
                ...editingProvider,
                apiBaseUrl: 'oauth://',
                apiKey: 'oauth',
                oauthProvider: editingProvider.oauthProvider || OAUTH_PROVIDERS[0].value,
                type: ['oauth'],
              });
            } else {
              setEditingProvider({
                ...editingProvider,
                apiBaseUrl: {},
                apiKey: '',
                oauthProvider: '',
                type: [],
              });
            }
          }}
          options={CONNECTION_TYPE_OPTIONS}
        />

        {isOAuthMode ? (
          <div className="flex flex-col gap-3">
            <Select
              label="OAuth Provider"
              value={editingProvider.oauthProvider || OAUTH_PROVIDERS[0].value}
              onChange={(value) => setEditingProvider({ ...editingProvider, oauthProvider: value })}
              options={OAUTH_PROVIDERS}
            />
            <div className="text-label leading-normal text-foreground-muted">
              Uses the provider ID as its OAuth account — one login per provider.
            </div>
            {oauthSlot}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Input
              label="API Key"
              type="password"
              value={editingProvider.apiKey}
              onChange={(e) => setEditingProvider({ ...editingProvider, apiKey: e.target.value })}
              placeholder="sk-..."
            />
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8.75rem_1fr] sm:items-end">
                <Select
                  label="Type"
                  value={primaryType}
                  onChange={(value) => setPrimaryEntry(value, primaryUrl)}
                  options={primaryTypeOptions}
                />
                <Input
                  label="Base URL"
                  placeholder={
                    primaryType === 'ollama'
                      ? 'http://localhost:11434'
                      : 'https://api.example.com/v1/...'
                  }
                  value={primaryUrl}
                  onChange={(e) => setPrimaryEntry(primaryType, e.target.value)}
                />
              </div>
              <OllamaUrlWarnings apiType={primaryType} url={primaryUrl} />
            </div>

            <SectionCard
              size="sm"
              title="Additional Base URLs"
              collapsible
              open={isApiBaseUrlsOpen}
              onOpenChange={setIsApiBaseUrlsOpen}
              extra={
                <>
                  {additionalBaseUrlEntries.length > 0 ? (
                    <Badge status="neutral" noDot>
                      {additionalBaseUrlEntries.length}
                    </Badge>
                  ) : (
                    <NotConfigured />
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      addAdditionalBaseUrlEntry();
                    }}
                    disabled={knownApis.every((t) =>
                      Object.prototype.hasOwnProperty.call(getApiBaseUrlMap(), t)
                    )}
                  >
                    <Plus size="0.875rem" />
                  </Button>
                </>
              }
            >
              <div className="flex flex-col gap-2">
                {additionalBaseUrlEntries.length === 0 && (
                  <div className="font-sans text-label italic text-foreground-muted">
                    No additional base URLs configured.
                  </div>
                )}
                {additionalBaseUrlEntries.map(([apiType, url]) => (
                  <div key={apiType} className="flex flex-col gap-1.5">
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
                      <div className="w-full shrink-0 sm:w-36">
                        <Select
                          value={apiType}
                          onChange={(value) =>
                            updateApiBaseUrlEntry(
                              apiType,
                              value,
                              typeof url === 'string' ? url : ''
                            )
                          }
                          options={[
                            ...knownApis
                              .filter((t) => t === apiType || !(t in apiBaseUrlMap))
                              .map((t) => ({ value: t, label: t })),
                            // Stored configs can carry types no longer offered (e.g.
                            // pre-collapse Decisions names): show the current value so
                            // the select never misrepresents the config.
                            ...(knownApis.includes(apiType)
                              ? []
                              : [{ value: apiType, label: `${apiType} (legacy)` }]),
                          ]}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <Input
                          placeholder={
                            apiType === 'ollama'
                              ? 'http://localhost:11434'
                              : 'https://api.example.com/v1/...'
                          }
                          value={typeof url === 'string' ? url : ''}
                          onChange={(e) => updateApiBaseUrlEntry(apiType, apiType, e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeApiBaseUrlEntry(apiType)}
                        aria-label={`Remove ${apiType}`}
                        className={KV_REMOVE_BUTTON_CLASS}
                      >
                        <Trash2 size="1rem" />
                      </button>
                    </div>
                    <OllamaUrlWarnings apiType={apiType} url={typeof url === 'string' ? url : ''} />
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

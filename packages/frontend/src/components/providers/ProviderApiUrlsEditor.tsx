import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { SectionCard } from '../ui/SectionCard';
import { KV_REMOVE_BUTTON_CLASS, NotConfigured } from './KVSection';
import type { Provider } from '../../lib/api';

const KNOWN_APIS = [
  'chat',
  'messages',
  'gemini',
  'embeddings',
  'transcriptions',
  'speech',
  'images',
  'responses',
  'ollama',
];

const API_TYPE_OPTIONS = KNOWN_APIS.map((t) => ({ value: t, label: t }));

const CONNECTION_TYPE_OPTIONS = [
  { value: 'url', label: 'Custom API URL' },
  { value: 'oauth', label: 'OAuth (pi-ai)' },
];

const CONNECTION_INFO = (
  <div className="text-[11px] leading-relaxed">
    <span className="italic">API types determine the protocol:</span>
    <ul className="mt-1 list-disc pl-4">
      <li>
        <span className="font-semibold">chat</span> — OpenAI-compatible endpoints, including
        Ollama&apos;s <code className="text-accent">/v1</code> API
      </li>
      <li>
        <span className="font-semibold">ollama</span> — Native Ollama API, use the root URL (e.g.{' '}
        <code className="text-accent">http://localhost:11434</code>)
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
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
          <span className="text-[11px] text-warning">
            <span className="font-semibold">native ollama</span> type expects root URL. URLs with{' '}
            <code>/v1</code> are OpenAI-compatible — use <span className="font-semibold">chat</span>{' '}
            type.
          </span>
        </div>
      )}
      {showChatOllamaWarning && (
        <div className="flex items-start gap-2 rounded-sm border border-warning/28 bg-warning-subtle px-2 py-1.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
          <span className="text-[11px] text-warning">
            This URL contains <code>/api/</code> paths typical of native Ollama. Use{' '}
            <span className="font-semibold">ollama</span> type if native.
          </span>
        </div>
      )}
    </>
  );
}

interface Props {
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
  const primaryTypeOptions = API_TYPE_OPTIONS.filter(
    (opt) => opt.value === primaryType || !otherApiTypes.has(opt.value)
  );
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
                oauthAccount: editingProvider.oauthAccount || '',
                type: ['oauth'],
              });
            } else {
              setEditingProvider({
                ...editingProvider,
                apiBaseUrl: {},
                apiKey: '',
                oauthProvider: '',
                oauthAccount: '',
                type: [],
              });
            }
          }}
          options={CONNECTION_TYPE_OPTIONS}
        />

        {isOAuthMode ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                label="OAuth Provider"
                value={editingProvider.oauthProvider || OAUTH_PROVIDERS[0].value}
                onChange={(value) =>
                  setEditingProvider({ ...editingProvider, oauthProvider: value })
                }
                options={OAUTH_PROVIDERS}
              />
              <Input
                label="OAuth Account"
                value={editingProvider.oauthAccount || ''}
                onChange={(e) =>
                  setEditingProvider({ ...editingProvider, oauthAccount: e.target.value })
                }
                placeholder="e.g. work, personal, team-a"
              />
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr] sm:items-end">
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
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      addAdditionalBaseUrlEntry();
                    }}
                    disabled={Object.keys(getApiBaseUrlMap()).length >= KNOWN_APIS.length}
                  >
                    <Plus size={14} />
                  </Button>
                </>
              }
            >
              <div className="flex flex-col gap-2">
                {additionalBaseUrlEntries.length === 0 && (
                  <div className="font-sans text-[11px] italic text-foreground-muted">
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
                          options={KNOWN_APIS.filter(
                            (t) => t === apiType || !(t in apiBaseUrlMap)
                          ).map((t) => ({ value: t, label: t }))}
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
                        <Trash2 size={16} />
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

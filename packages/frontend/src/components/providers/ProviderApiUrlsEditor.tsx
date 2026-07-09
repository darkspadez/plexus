import { AlertTriangle } from 'lucide-react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { SectionCard } from '../ui/SectionCard';
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

interface Props {
  isOAuthMode: boolean;
  getPrimaryEntry: () => { type: string; url: string };
  setPrimaryEntry: (newType: string, newUrl: string) => void;
  editingProvider: Provider;
  setEditingProvider: React.Dispatch<React.SetStateAction<Provider>>;
  OAUTH_PROVIDERS: Array<{ value: string; label: string }>;
  /** Rendered beneath the OAuth fields when in OAuth mode (Task 4: OAuth login card). */
  oauthSlot?: React.ReactNode;
}

export function ProviderApiUrlsEditor({
  isOAuthMode,
  getPrimaryEntry,
  setPrimaryEntry,
  editingProvider,
  setEditingProvider,
  OAUTH_PROVIDERS,
  oauthSlot,
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
  const urlLower = primaryUrl.toLowerCase();
  const hasNativeOllamaPath =
    urlLower.includes('/api/chat') ||
    urlLower.includes('/api/generate') ||
    urlLower.includes('/api/embeddings') ||
    urlLower.includes('/api/tags');
  const hasV1Suffix = urlLower.includes('/v1');
  const showOllamaV1Warning = primaryType === 'ollama' && hasV1Suffix;
  const showChatOllamaWarning = primaryType === 'chat' && hasNativeOllamaPath && !hasV1Suffix;

  return (
    <SectionCard
      title="Connection"
      id="section-connection"
      info={!isOAuthMode ? CONNECTION_INFO : undefined}
    >
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
            <Select
              label="OAuth Provider"
              value={editingProvider.oauthProvider || OAUTH_PROVIDERS[0].value}
              onChange={(value) => setEditingProvider({ ...editingProvider, oauthProvider: value })}
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
            {oauthSlot}
          </div>
        ) : (
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
            {showOllamaV1Warning && (
              <div className="flex items-start gap-2 rounded-sm border border-warning/28 bg-warning-subtle px-2 py-1.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                <span className="text-[11px] text-warning">
                  <span className="font-semibold">native ollama</span> type expects root URL. URLs
                  with <code>/v1</code> are OpenAI-compatible — use{' '}
                  <span className="font-semibold">chat</span> type.
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
          </div>
        )}
      </div>
    </SectionCard>
  );
}

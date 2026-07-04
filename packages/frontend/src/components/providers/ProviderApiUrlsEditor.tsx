import { ChevronDown, ChevronRight, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Pill } from '../chips/Pill';
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

interface Props {
  isOAuthMode: boolean;
  getApiBaseUrlMap: () => Record<string, string>;
  addApiBaseUrlEntry: () => void;
  updateApiBaseUrlEntry: (oldType: string, newType: string, url: string) => void;
  removeApiBaseUrlEntry: (apiType: string) => void;
  editingProvider: Provider;
  setEditingProvider: React.Dispatch<React.SetStateAction<Provider>>;
  OAUTH_PROVIDERS: Array<{ value: string; label: string }>;
  isApiBaseUrlsOpen: boolean;
  setIsApiBaseUrlsOpen: (v: boolean) => void;
}

export function ProviderApiUrlsEditor({
  isOAuthMode,
  getApiBaseUrlMap,
  addApiBaseUrlEntry,
  updateApiBaseUrlEntry,
  removeApiBaseUrlEntry,
  editingProvider,
  setEditingProvider,
  OAUTH_PROVIDERS,
  isApiBaseUrlsOpen,
  setIsApiBaseUrlsOpen,
}: Props) {
  return (
    <div className="flex flex-col gap-1 border border-border rounded-md p-3 bg-surface-sunken">
      <div className="flex flex-col gap-1" style={{ marginBottom: '6px' }}>
        <label className="font-sans text-[13px] font-medium text-foreground-muted">
          Connection Type
        </label>
        <select
          className="w-full h-[27px] py-0 px-2 font-sans text-[12px] leading-none text-foreground bg-surface border border-border rounded-sm outline-none focus:border-accent"
          value={isOAuthMode ? 'oauth' : 'url'}
          onChange={(e) => {
            if (e.target.value === 'oauth') {
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
        >
          <option value="url">Custom API URL</option>
          <option value="oauth">OAuth (pi-ai)</option>
        </select>
      </div>
      <label className="font-sans text-[13px] font-medium text-foreground-muted">
        Supported APIs & Base URLs
      </label>
      <div
        style={{
          fontSize: '11px',
          color: 'var(--foreground-muted)',
          marginBottom: '4px',
          lineHeight: '1.5',
        }}
      >
        <span style={{ fontStyle: 'italic' }}>API types determine the protocol:</span>
        <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
          <li>
            <span style={{ fontWeight: 600 }}>chat</span> — OpenAI-compatible endpoints, including
            Ollama&apos;s <code className="text-accent">/v1</code> API
          </li>
          <li>
            <span style={{ fontWeight: 600 }}>ollama</span> — Native Ollama API, use the root URL
            (e.g. <code className="text-accent">http://localhost:11434</code>)
          </li>
        </ul>
      </div>
      {isOAuthMode ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            background: 'var(--surface-sunken)',
            padding: '8px',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="font-sans text-[13px] font-medium text-foreground-muted">
              OAuth Provider
            </label>
            <select
              className="w-full h-[27px] py-0 px-2 font-sans text-[12px] leading-none text-foreground bg-surface border border-border rounded-sm outline-none focus:border-accent"
              value={editingProvider.oauthProvider || OAUTH_PROVIDERS[0].value}
              onChange={(e) =>
                setEditingProvider({ ...editingProvider, oauthProvider: e.target.value })
              }
            >
              {OAUTH_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="OAuth Account"
            value={editingProvider.oauthAccount || ''}
            onChange={(e) =>
              setEditingProvider({ ...editingProvider, oauthAccount: e.target.value })
            }
            placeholder="e.g. work, personal, team-a"
          />
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <div
            className="p-2 px-3 flex items-center gap-2 cursor-pointer bg-surface-elevated transition-colors duration-200 select-none hover:bg-surface"
            onClick={() => setIsApiBaseUrlsOpen(!isApiBaseUrlsOpen)}
          >
            {isApiBaseUrlsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <label
              className="font-sans text-[13px] font-medium text-foreground-muted"
              style={{ marginBottom: 0, flex: 1 }}
            >
              Base URL Entries
            </label>
            <Pill tone="neutral" size="sm">
              {Object.keys(getApiBaseUrlMap()).length}
            </Pill>
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                addApiBaseUrlEntry();
              }}
              disabled={Object.keys(getApiBaseUrlMap()).length >= KNOWN_APIS.length}
            >
              <Plus size={14} />
            </Button>
          </div>
          {isApiBaseUrlsOpen && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '8px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-sunken)',
              }}
            >
              {Object.entries(getApiBaseUrlMap()).length === 0 && (
                <div className="font-sans text-[11px] text-foreground-muted italic">
                  No base URLs configured yet.
                </div>
              )}
              {Object.entries(getApiBaseUrlMap()).map(([apiType, url]) => {
                const urlLower = typeof url === 'string' ? url.toLowerCase() : '';
                const hasNativeOllamaPath =
                  urlLower.includes('/api/chat') ||
                  urlLower.includes('/api/generate') ||
                  urlLower.includes('/api/embeddings') ||
                  urlLower.includes('/api/tags');
                const hasV1Suffix = urlLower.includes('/v1');
                const showOllamaV1Warning = apiType === 'ollama' && hasV1Suffix;
                const showChatOllamaWarning =
                  apiType === 'chat' && hasNativeOllamaPath && !hasV1Suffix;
                return (
                  <div
                    key={apiType}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-start"
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <select
                        className="w-full h-[27px] py-0 px-2 font-sans text-[12px] leading-none text-foreground bg-surface border border-border rounded-sm outline-none focus:border-accent"
                        value={apiType}
                        onChange={(e) =>
                          updateApiBaseUrlEntry(
                            apiType,
                            e.target.value,
                            typeof url === 'string' ? url : ''
                          )
                        }
                      >
                        {KNOWN_APIS.map((t) => (
                          <option key={t} value={t} className="bg-surface text-foreground">
                            {t}
                          </option>
                        ))}
                      </select>
                      <input
                        className="w-full h-[27px] py-0 px-2 font-sans text-[12px] leading-none text-foreground bg-surface border border-border rounded-sm outline-none focus:border-accent"
                        placeholder={
                          apiType === 'ollama'
                            ? 'http://localhost:11434'
                            : 'https://api.example.com/v1/...'
                        }
                        value={typeof url === 'string' ? url : ''}
                        onChange={(e) => updateApiBaseUrlEntry(apiType, apiType, e.target.value)}
                      />
                      {showOllamaV1Warning && (
                        <div className="flex items-start gap-2 py-1.5 px-2 bg-warning/10 border border-warning/30 rounded-sm">
                          <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                          <span className="text-[11px] text-warning">
                            <span style={{ fontWeight: 600 }}>native ollama</span> type expects root
                            URL. URLs with <code>/v1</code> are OpenAI-compatible — use{' '}
                            <span style={{ fontWeight: 600 }}>chat</span> type.
                          </span>
                        </div>
                      )}
                      {showChatOllamaWarning && (
                        <div className="flex items-start gap-2 py-1.5 px-2 bg-warning/10 border border-warning/30 rounded-sm">
                          <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                          <span className="text-[11px] text-warning">
                            This URL contains <code>/api/</code> paths typical of native Ollama. Use{' '}
                            <span style={{ fontWeight: 600 }}>ollama</span> type if native.
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeApiBaseUrlEntry(apiType)}
                      style={{ padding: '4px', marginTop: '4px' }}
                    >
                      <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/cn';
import {
  api,
  Provider,
  OAuthSession,
  initQuotaCheckerTypes,
  getQuotaCheckerTypes,
} from '../lib/api';
import { GPU_PROFILE_OPTIONS, resolveGpuParams } from '@plexus/shared';
import type { QuotaCheckerInfo } from '../types/quota';
import { formatMeterValue } from '../components/quota/MeterValue';
import { Button } from '../components/forms/Button';
import { Modal } from '../components/forms/Modal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui-v2/dialog';
import { Input } from '../components/forms/Input';
import { Pill } from '../components/chips/Pill';
import { ListPage } from '../components/templates';
import { useToast } from '../contexts/ToastContext';
import {
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronRight,
  X,
  Download,
  Info,
  AlertTriangle,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  Copy,
  Server,
  ShieldCheck,
} from 'lucide-react';

import { EmptyState } from '../components/ui-v2/empty-state';
import { Section } from '../components/ui-v2/section';
import { Switch } from '../components/ui-v2/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui-v2/select';
import { OpenRouterSlugInput } from '../components/forms/OpenRouterSlugInput';
import { NagaQuotaConfig } from '../components/quota/NagaQuotaConfig';
import { SyntheticQuotaConfig } from '../components/quota/SyntheticQuotaConfig';
import { NanoGPTQuotaConfig } from '../components/quota/NanoGPTQuotaConfig';
import { ZAIQuotaConfig } from '../components/quota/ZAIQuotaConfig';
import { MoonshotQuotaConfig } from '../components/quota/MoonshotQuotaConfig';
import { NovitaQuotaConfig } from '../components/quota/NovitaQuotaConfig';
import { MiniMaxQuotaConfig } from '../components/quota/MiniMaxQuotaConfig';
import { MiniMaxCodingQuotaConfig } from '../components/quota/MiniMaxCodingQuotaConfig';
import { OpenRouterQuotaConfig } from '../components/quota/OpenRouterQuotaConfig';
import { KiloQuotaConfig } from '../components/quota/KiloQuotaConfig';
import { WisdomGateQuotaConfig } from '../components/quota/WisdomGateQuotaConfig';
import { GeminiCliQuotaConfig } from '../components/quota/GeminiCliQuotaConfig';
import { AntigravityQuotaConfig } from '../components/quota/AntigravityQuotaConfig';
import { ApertisQuotaConfig } from '../components/quota/ApertisQuotaConfig';
import { KimiCodeQuotaConfig } from '../components/quota/KimiCodeQuotaConfig';
import { PoeQuotaConfig } from '../components/quota/PoeQuotaConfig';
import { OllamaQuotaConfig } from '../components/quota/OllamaQuotaConfig';
import { NeuralwattQuotaConfig } from '../components/quota/NeuralwattQuotaConfig';
import { ZenmuxQuotaConfig } from '../components/quota/ZenmuxQuotaConfig';

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

const OAUTH_PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic (Claude Code Pro/Max)' },
  { value: 'github-copilot', label: 'GitHub Copilot' },
  { value: 'google-gemini-cli', label: 'Google Cloud Code Assist (Gemini CLI)' },
  { value: 'google-antigravity', label: 'Antigravity (Gemini 3, Claude, GPT-OSS)' },
  { value: 'openai-codex', label: 'ChatGPT Plus/Pro (Codex Subscription)' },
];

// Fallback list for UI display until types are fetched from backend
const QUOTA_CHECKER_TYPES_FALLBACK = [
  'synthetic',
  'naga',
  'nanogpt',
  'openai-codex',
  'claude-code',
  'kimi-code',
  'zai',
  'moonshot',
  'novita',
  'minimax',
  'minimax-coding',
  'openrouter',
  'kilo',
  'wisdomgate',
  'apertis',
  'poe',
  'copilot',
  'gemini-cli',
  'antigravity',
  'ollama',
  'neuralwatt',
  'zenmux',
] as const;

/** Maps an oauth_provider value to the one checker type relevant for it, or null. */
const getOAuthCheckerType = (oauthProvider?: string): string | null => {
  if (!oauthProvider) return null;
  const map: Record<string, string> = {
    'openai-codex': 'openai-codex',
    anthropic: 'claude-code',
    'claude-code': 'claude-code',
    'github-copilot': 'copilot',
    'google-gemini-cli': 'gemini-cli',
    'google-antigravity': 'antigravity',
  };
  return map[oauthProvider] ?? null;
};

const getApiBadgeStyle = (apiType: string): React.CSSProperties => {
  switch (apiType.toLowerCase()) {
    case 'messages':
      return { backgroundColor: '#D97757', color: 'white', border: 'none' };
    case 'chat':
      return { backgroundColor: '#ebebeb', color: '#333', border: 'none' };
    case 'gemini':
      return { backgroundColor: '#5084ff', color: 'white', border: 'none' };
    case 'embeddings':
      return { backgroundColor: '#10b981', color: 'white', border: 'none' };
    case 'transcriptions':
      return { backgroundColor: '#a855f7', color: 'white', border: 'none' };
    case 'speech':
      return { backgroundColor: '#f97316', color: 'white', border: 'none' };
    case 'images':
      return { backgroundColor: '#d946ef', color: 'white', border: 'none' };
    case 'responses':
      return { backgroundColor: '#06b6d4', color: 'white', border: 'none' };
    case 'ollama':
      return { backgroundColor: '#1a5f7a', color: 'white', border: 'none' };
    case 'oauth':
      return { backgroundColor: '#111827', color: 'white', border: 'none' };
    default:
      return {};
  }
};

/**
 * Infer provider API types from api_base_url
 * Matches the backend inference logic
 */
const inferProviderTypes = (apiBaseUrl?: string | Record<string, string>): string[] => {
  if (!apiBaseUrl) {
    return ['chat']; // Default fallback
  }

  if (typeof apiBaseUrl === 'string') {
    const url = apiBaseUrl.toLowerCase();
    if (url.startsWith('oauth://')) {
      return ['oauth'];
    }
    if (url.includes('anthropic.com')) {
      return ['messages'];
    } else if (url.includes('generativelanguage.googleapis.com')) {
      return ['gemini'];
    } else {
      return ['chat'];
    }
  } else {
    return Object.keys(apiBaseUrl).filter((key) => {
      const value = apiBaseUrl[key];
      return typeof value === 'string' && value.length > 0;
    });
  }
};

const EMPTY_PROVIDER: Provider = {
  id: '',
  name: '',
  type: [],
  apiKey: '',
  oauthProvider: '',
  oauthAccount: '',
  enabled: true,
  disableCooldown: false,
  estimateTokens: false,
  useClaudeMasking: false,
  apiBaseUrl: {},
  headers: {},
  extraBody: {},
  models: {},
};

interface FetchedModel {
  id: string;
  name?: string;
  context_length?: number;
  created?: number;
  object?: string;
  owned_by?: string;
  description?: string;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
}

interface ModelIdInputProps {
  modelId: string;
  onCommit: (oldId: string, newId: string) => void;
}

const ModelIdInput = ({ modelId, onCommit }: ModelIdInputProps) => {
  const [draftId, setDraftId] = useState(modelId);

  useEffect(() => {
    setDraftId(modelId);
  }, [modelId]);

  const commit = () => {
    if (!draftId || draftId === modelId) return;
    onCommit(modelId, draftId);
  };

  return (
    <Input
      label="Model ID"
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
};

export const Providers = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider>(EMPTY_PROVIDER);
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [quotaCheckerTypes, setQuotaCheckerTypes] = useState<string[]>([
    ...QUOTA_CHECKER_TYPES_FALLBACK,
  ]);
  const [quotas, setQuotas] = useState<QuotaCheckerInfo[]>([]);
  const [quotasLoading, setQuotasLoading] = useState(true);

  const [oauthSessionId, setOauthSessionId] = useState<string | null>(null);
  const [oauthSession, setOauthSession] = useState<OAuthSession | null>(null);
  const [oauthPromptValue, setOauthPromptValue] = useState('');
  const [oauthManualCode, setOauthManualCode] = useState('');
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthCredentialReady, setOauthCredentialReady] = useState(false);
  const [oauthCredentialChecking, setOauthCredentialChecking] = useState(false);

  // Fetch quota checker types from backend on mount
  useEffect(() => {
    initQuotaCheckerTypes().then(() => {
      const types = Array.from(getQuotaCheckerTypes());
      setQuotaCheckerTypes(types.length > 0 ? types : [...QUOTA_CHECKER_TYPES_FALLBACK]);
    });
  }, []);

  // Fetch quotas on mount
  useEffect(() => {
    api
      .getQuotas()
      .then(setQuotas)
      .catch(() => {
        // Silently fail - quotas are optional
      })
      .finally(() => setQuotasLoading(false));
  }, []);

  const isOAuthMode =
    typeof editingProvider.apiBaseUrl === 'string' &&
    editingProvider.apiBaseUrl.toLowerCase().startsWith('oauth://');
  const oauthCheckerType = isOAuthMode ? getOAuthCheckerType(editingProvider.oauthProvider) : null;
  // OAuth providers: only show the one relevant checker type (or none if unmapped).
  // Non-OAuth providers: full list.
  const selectableQuotaCheckerTypes = oauthCheckerType
    ? [oauthCheckerType]
    : isOAuthMode
      ? [] // OAuth provider with no mapped checker — only <none> will be shown
      : quotaCheckerTypes;
  const selectedQuotaCheckerType =
    editingProvider.quotaChecker?.type &&
    (selectableQuotaCheckerTypes.includes(editingProvider.quotaChecker.type) ||
      editingProvider.quotaChecker.type === oauthCheckerType)
      ? editingProvider.quotaChecker.type
      : '';

  const validateQuotaChecker = (): string | null => {
    const quotaType = editingProvider.quotaChecker?.type;
    const options = editingProvider.quotaChecker?.options || {};

    if (!quotaType) return null;

    if (quotaType === 'naga') {
      if (!options.apiKey || !(options.apiKey as string).trim()) {
        return 'Provisioning API Key is required for Naga quota checker';
      }
    }

    if (quotaType === 'minimax') {
      if (!options.groupid || !(options.groupid as string).trim()) {
        return 'Group ID is required for MiniMax quota checker';
      }
      if (!options.hertzSession || !(options.hertzSession as string).trim()) {
        return 'HERTZ-SESSION cookie value is required for MiniMax quota checker';
      }
    }

    if (quotaType === 'wisdomgate') {
      if (!options.session || !(options.session as string).trim()) {
        return 'Session cookie is required for Wisdom Gate quota checker';
      }
    }

    // synthetic and nanogpt don't require options - they use the provider's api_key

    return null;
  };

  const quotaValidationError = validateQuotaChecker();

  const oauthStatus = oauthSession?.status;
  const oauthIsTerminal = oauthStatus
    ? ['success', 'error', 'cancelled'].includes(oauthStatus)
    : false;
  const oauthStatusLabel = oauthStatus
    ? {
        in_progress: 'Starting',
        awaiting_auth: 'Awaiting browser',
        awaiting_prompt: 'Awaiting input',
        awaiting_manual_code: 'Awaiting redirect',
        success: 'Authenticated',
        error: 'Error',
        cancelled: 'Cancelled',
      }[oauthStatus] || oauthStatus
    : oauthCredentialChecking
      ? 'Checking...'
      : oauthCredentialReady
        ? 'Ready'
        : 'Not started';

  // Accordion state for Modal
  const [isModelsOpen, setIsModelsOpen] = useState(false);
  const [openModelIdx, setOpenModelIdx] = useState<string | null>(null);
  const [isApiBaseUrlsOpen, setIsApiBaseUrlsOpen] = useState(true);
  const [isHeadersOpen, setIsHeadersOpen] = useState(false);
  const [isExtraBodyOpen, setIsExtraBodyOpen] = useState(false);
  const [isModelExtraBodyOpen, setIsModelExtraBodyOpen] = useState<Record<string, boolean>>({});
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Fetch Models Modal state
  const [isFetchModelsModalOpen, setIsFetchModelsModalOpen] = useState(false);
  const [modelsUrl, setModelsUrl] = useState('');
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [deleteModalProvider, setDeleteModalProvider] = useState<Provider | null>(null);
  const [deleteModalLoading, setDeleteModalLoading] = useState(false);
  const [affectedAliases, setAffectedAliases] = useState<
    { aliasId: string; targetsCount: number }[]
  >([]);

  // Test model state
  const [testStates, setTestStates] = useState<
    Record<
      string,
      { loading: boolean; result?: 'success' | 'error'; message?: string; showResult: boolean }
    >
  >({});

  const handleTestModel = async (providerId: string, modelId: string, modelType?: string) => {
    const testKey = `${providerId}-${modelId}`;
    setTestStates((prev) => ({ ...prev, [testKey]: { loading: true, showResult: true } }));

    let testApiTypes: string[] = ['chat'];
    if (modelType === 'embeddings') testApiTypes = ['embeddings'];
    else if (modelType === 'image') testApiTypes = ['images'];
    else if (modelType === 'responses') testApiTypes = ['responses'];
    else if (modelType === 'transcriptions') testApiTypes = ['transcriptions'];
    else if (modelType === 'speech') testApiTypes = ['speech'];

    try {
      const results = await Promise.all(
        testApiTypes.map((apiType) => api.testModel(providerId, modelId, apiType))
      );

      const allSuccess = results.every((r) => r.success);
      const firstError = results.find((r) => !r.success);
      const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
      const avgDuration = Math.round(totalDuration / results.length);

      setTestStates((prev) => ({
        ...prev,
        [testKey]: {
          loading: false,
          result: allSuccess ? 'success' : 'error',
          message: allSuccess
            ? `Success (${avgDuration}ms avg, ${testApiTypes.length} API${testApiTypes.length > 1 ? 's' : ''})`
            : `Failed via ${firstError?.apiType || 'unknown'}: ${firstError?.error || 'Test failed'}`,
          showResult: true,
        },
      }));

      if (allSuccess) {
        setTimeout(() => {
          setTestStates((prev) => ({
            ...prev,
            [testKey]: { ...prev[testKey], showResult: false },
          }));
        }, 3000);
      }
    } catch (e) {
      setTestStates((prev) => ({
        ...prev,
        [testKey]: { loading: false, result: 'error', message: String(e), showResult: true },
      }));
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const p = await api.getProviders();
      setProviders(p);
    } catch (e) {
      console.error('Failed to load data', e);
    } finally {
      setHasLoaded(true);
    }
  };

  const handleEdit = (provider: Provider) => {
    setOriginalId(provider.id);
    setEditingProvider(JSON.parse(JSON.stringify(provider)));
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setOriginalId(null);
    setEditingProvider(JSON.parse(JSON.stringify(EMPTY_PROVIDER)));
    setIsModalOpen(true);
  };

  const openDeleteModal = async (provider: Provider) => {
    const affected = await api.getAffectedAliases(provider.id);
    setAffectedAliases(affected);
    setDeleteModalProvider(provider);
  };

  const handleDelete = async (cascade: boolean) => {
    if (!deleteModalProvider) return;

    setDeleteModalLoading(true);
    try {
      await api.deleteProvider(deleteModalProvider.id, cascade);
      await loadData();
      setDeleteModalProvider(null);
    } catch (e) {
      toast.error('Failed to delete provider: ' + e);
    } finally {
      setDeleteModalLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingProvider.id) {
      toast.error('Provider ID is required');
      return;
    }
    setIsSaving(true);
    try {
      let providerToSave = editingProvider;
      if (isOAuthMode && !providerToSave.oauthProvider) {
        providerToSave = { ...providerToSave, oauthProvider: OAUTH_PROVIDERS[0].value };
      }
      if (isOAuthMode && !providerToSave.oauthAccount?.trim()) {
        toast.error('OAuth account is required');
        return;
      }
      // Quota checker validation is handled by the backend - just pass through as-is
      if (providerToSave.quotaChecker && !providerToSave.quotaChecker.type?.trim()) {
        providerToSave = {
          ...providerToSave,
          quotaChecker: undefined,
        };
      }
      await api.saveProvider(providerToSave, originalId || undefined);
      await loadData();
      setIsModalOpen(false);
    } catch (e) {
      console.error('Save error', e);
      toast.error('Failed to save provider: ' + e);
    } finally {
      setIsSaving(false);
    }
  };

  const resetOAuthState = () => {
    setOauthSessionId(null);
    setOauthSession(null);
    setOauthPromptValue('');
    setOauthManualCode('');
    setOauthError(null);
    setOauthBusy(false);
  };

  useEffect(() => {
    if (!isModalOpen) {
      resetOAuthState();
      setOauthCredentialReady(false);
      setOauthCredentialChecking(false);
      return;
    }
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen || !isOAuthMode) {
      setOauthCredentialReady(false);
      setOauthCredentialChecking(false);
      return;
    }

    const providerId = editingProvider.oauthProvider || OAUTH_PROVIDERS[0].value;
    const accountId = editingProvider.oauthAccount?.trim();
    if (!accountId) {
      setOauthCredentialReady(false);
      setOauthCredentialChecking(false);
      return;
    }

    let cancelled = false;
    setOauthCredentialChecking(true);
    api
      .getOAuthCredentialStatus(providerId, accountId)
      .then((result) => {
        if (cancelled) return;
        setOauthCredentialReady(!!result.ready);
      })
      .catch(() => {
        if (cancelled) return;
        setOauthCredentialReady(false);
      })
      .finally(() => {
        if (cancelled) return;
        setOauthCredentialChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isModalOpen,
    isOAuthMode,
    editingProvider.oauthProvider,
    editingProvider.oauthAccount,
    oauthStatus,
  ]);

  useEffect(() => {
    if (!isOAuthMode) return;
    resetOAuthState();
  }, [editingProvider.oauthProvider, isOAuthMode]);

  useEffect(() => {
    if (!oauthSessionId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const session = await api.getOAuthSession(oauthSessionId);
        if (cancelled) return;
        setOauthSession(session);
        if (['awaiting_prompt', 'awaiting_manual_code', 'awaiting_auth'].includes(session.status)) {
          setOauthBusy(false);
        }
        if (['success', 'error', 'cancelled'].includes(session.status)) {
          setOauthBusy(false);
          return;
        }
        setTimeout(poll, 1000);
      } catch (error) {
        if (!cancelled) {
          setOauthError(error instanceof Error ? error.message : 'Failed to load OAuth session');
          setOauthBusy(false);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [oauthSessionId]);

  const handleStartOAuth = async () => {
    const providerId = editingProvider.oauthProvider || OAUTH_PROVIDERS[0].value;
    const accountId = editingProvider.oauthAccount?.trim();
    if (!accountId) {
      setOauthError('OAuth account is required before starting login');
      return;
    }
    setOauthBusy(true);
    setOauthError(null);
    setOauthSession(null);
    setOauthSessionId(null);
    try {
      const session = await api.startOAuthSession(providerId, accountId);
      setOauthSessionId(session.id);
      setOauthSession(session);
      if (['awaiting_prompt', 'awaiting_manual_code', 'awaiting_auth'].includes(session.status)) {
        setOauthBusy(false);
      }
    } catch (error) {
      setOauthError(error instanceof Error ? error.message : 'Failed to start OAuth');
      setOauthBusy(false);
    }
  };

  const handleSubmitPrompt = async () => {
    if (!oauthSessionId) return;
    setOauthBusy(true);
    setOauthError(null);
    try {
      const session = await api.submitOAuthPrompt(oauthSessionId, oauthPromptValue);
      setOauthSession(session);
      setOauthPromptValue('');
    } catch (error) {
      setOauthError(error instanceof Error ? error.message : 'Failed to submit prompt');
    } finally {
      setOauthBusy(false);
    }
  };

  const handleSubmitManualCode = async () => {
    if (!oauthSessionId) return;
    setOauthBusy(true);
    setOauthError(null);
    try {
      const session = await api.submitOAuthManualCode(oauthSessionId, oauthManualCode);
      setOauthSession(session);
      setOauthManualCode('');
    } catch (error) {
      setOauthError(error instanceof Error ? error.message : 'Failed to submit code');
    } finally {
      setOauthBusy(false);
    }
  };

  const handleCancelOAuth = async () => {
    if (!oauthSessionId) return;
    setOauthBusy(true);
    setOauthError(null);
    try {
      const session = await api.cancelOAuthSession(oauthSessionId);
      setOauthSession(session);
    } catch (error) {
      setOauthError(error instanceof Error ? error.message : 'Failed to cancel session');
    } finally {
      setOauthBusy(false);
    }
  };

  const handleToggleEnabled = async (provider: Provider, newState: boolean) => {
    const updated = providers.map((p) => (p.id === provider.id ? { ...p, enabled: newState } : p));
    setProviders(updated);

    try {
      const p = { ...provider, enabled: newState };
      await api.saveProvider(p, provider.id);
    } catch (e) {
      console.error('Toggle error', e);
      toast.error('Failed to update provider status: ' + e);
      loadData();
    }
  };

  const getApiBaseUrlMap = (): Record<string, string> => {
    if (
      typeof editingProvider.apiBaseUrl === 'object' &&
      editingProvider.apiBaseUrl !== null &&
      !Array.isArray(editingProvider.apiBaseUrl)
    ) {
      return { ...(editingProvider.apiBaseUrl as Record<string, string>) };
    }

    if (typeof editingProvider.apiBaseUrl === 'string' && editingProvider.apiBaseUrl.trim()) {
      const inferredTypes = inferProviderTypes(editingProvider.apiBaseUrl);
      const fallbackType = inferredTypes[0] || 'chat';
      return { [fallbackType]: editingProvider.apiBaseUrl };
    }

    return {};
  };

  const addApiBaseUrlEntry = () => {
    if (isOAuthMode) return;
    const currentMap = getApiBaseUrlMap();
    const nextType = KNOWN_APIS.find((apiType) => !(apiType in currentMap));
    if (!nextType) return;

    const updated = { ...currentMap, [nextType]: '' };
    setEditingProvider({
      ...editingProvider,
      apiBaseUrl: updated,
      type: inferProviderTypes(updated),
    });
    setIsApiBaseUrlsOpen(true);
  };

  const updateApiBaseUrlEntry = (oldType: string, newType: string, url: string) => {
    if (isOAuthMode) return;
    const currentMap = getApiBaseUrlMap();
    const updated: Record<string, string> = { ...currentMap };
    delete updated[oldType];

    const normalizedType = newType.trim();
    if (normalizedType) {
      // Keep unfinished entries (empty URL) visible while editing.
      // Types are still inferred only from non-empty URLs via inferProviderTypes().
      updated[normalizedType] = url;
    }

    setEditingProvider({
      ...editingProvider,
      apiBaseUrl: updated,
      type: inferProviderTypes(updated),
    });
  };

  const removeApiBaseUrlEntry = (apiType: string) => {
    if (isOAuthMode) return;
    const currentMap = getApiBaseUrlMap();
    const updated = { ...currentMap };
    delete updated[apiType];

    setEditingProvider({
      ...editingProvider,
      apiBaseUrl: updated,
      type: inferProviderTypes(updated),
    });
  };

  const getApiUrlValue = (apiType: string) => {
    if (typeof editingProvider.apiBaseUrl === 'string') {
      const types = Array.isArray(editingProvider.type)
        ? editingProvider.type
        : [editingProvider.type];
      if (types.includes(apiType) && types.length === 1) {
        return editingProvider.apiBaseUrl;
      }
      return '';
    }
    return (editingProvider.apiBaseUrl as any)?.[apiType] || '';
  };

  // Generic Key-Value pair helpers
  const addKV = (field: 'headers' | 'extraBody') => {
    const current = editingProvider[field] || {};
    setEditingProvider({
      ...editingProvider,
      [field]: { ...current, '': '' },
    });
  };

  const updateKV = (field: 'headers' | 'extraBody', oldKey: string, newKey: string, value: any) => {
    const current = { ...(editingProvider[field] || {}) };
    if (oldKey !== newKey) {
      delete current[oldKey];
    }
    current[newKey] = value;
    setEditingProvider({ ...editingProvider, [field]: current });
  };

  const removeKV = (field: 'headers' | 'extraBody', key: string) => {
    const current = { ...(editingProvider[field] || {}) };
    delete current[key];
    setEditingProvider({ ...editingProvider, [field]: current });
  };

  // Model-level extraBody helpers
  const addModelKV = (modelId: string) => {
    const models = { ...(editingProvider.models as Record<string, any>) };
    const current = models[modelId]?.extraBody || {};
    models[modelId] = {
      ...models[modelId],
      extraBody: { ...current, '': '' },
    };
    setEditingProvider({ ...editingProvider, models });
  };

  const updateModelKV = (modelId: string, oldKey: string, newKey: string, value: any) => {
    const models = { ...(editingProvider.models as Record<string, any>) };
    const current = { ...(models[modelId]?.extraBody || {}) };
    if (oldKey !== newKey) {
      delete current[oldKey];
    }
    current[newKey] = value;
    models[modelId] = { ...models[modelId], extraBody: current };
    setEditingProvider({ ...editingProvider, models });
  };

  const removeModelKV = (modelId: string, key: string) => {
    const models = { ...(editingProvider.models as Record<string, any>) };
    const current = { ...(models[modelId]?.extraBody || {}) };
    delete current[key];
    models[modelId] = { ...models[modelId], extraBody: current };
    setEditingProvider({ ...editingProvider, models });
  };

  // Model Management
  const addModel = () => {
    const modelId = `model-${Date.now()}`;
    const newModels = {
      ...(typeof editingProvider.models === 'object' && !Array.isArray(editingProvider.models)
        ? editingProvider.models
        : {}),
    };
    newModels[modelId] = {
      pricing: { source: 'simple', input: 0, output: 0 },
      access_via: [],
    };
    setEditingProvider({ ...editingProvider, models: newModels });
    setOpenModelIdx(modelId);
  };

  const updateModelId = (oldId: string, newId: string) => {
    if (oldId === newId) return;
    const models = { ...(editingProvider.models as Record<string, any>) };
    models[newId] = models[oldId];
    delete models[oldId];
    setEditingProvider({ ...editingProvider, models });
    if (openModelIdx === oldId) setOpenModelIdx(newId);
  };

  const updateModelConfig = (modelId: string, updates: any) => {
    const models = { ...(editingProvider.models as Record<string, any>) };
    models[modelId] = { ...models[modelId], ...updates };
    setEditingProvider({ ...editingProvider, models });
  };

  const removeModel = (modelId: string) => {
    const models = { ...(editingProvider.models as Record<string, any>) };
    delete models[modelId];
    setEditingProvider({ ...editingProvider, models });
  };

  // Generate default models URL from API URLs
  const generateModelsUrl = (): string => {
    if (isOAuthMode) return '';

    // For ollama API type, use the standard ollama library models endpoint
    const ollamaUrl = getApiUrlValue('ollama');
    if (ollamaUrl) {
      return 'https://ollama.com/api/tags';
    }

    // For chat API type, derive from chat URL
    const chatUrl = getApiUrlValue('chat');
    if (!chatUrl) return '';

    // Remove /chat/completions suffix and add /models
    const baseUrl = chatUrl.replace(/\/chat\/completions\/?$/, '');
    return `${baseUrl}/models`;
  };

  // Open fetch models modal
  const handleOpenFetchModels = () => {
    const defaultUrl = generateModelsUrl();
    setModelsUrl(defaultUrl);
    setFetchedModels([]);
    setSelectedModelIds(new Set());
    setFetchError(null);
    setIsFetchModelsModalOpen(true);
  };

  // Fetch models from URL
  const handleFetchModels = async () => {
    if (isOAuthMode) {
      const oauthProvider = editingProvider.oauthProvider || OAUTH_PROVIDERS[0].value;

      setIsFetchingModels(true);
      setFetchError(null);

      try {
        const models = await api.getOAuthProviderModels(oauthProvider);
        const sortedModels = [...models].sort((a, b) => a.id.localeCompare(b.id));

        if (sortedModels.length === 0) {
          setFetchError(`No models found for OAuth provider '${oauthProvider}'.`);
          setFetchedModels([]);
          setSelectedModelIds(new Set());
          return;
        }

        setFetchedModels(sortedModels);
        setSelectedModelIds(new Set());
        setFetchError(null);
      } catch (error) {
        console.error('Failed to fetch OAuth models:', error);
        setFetchError(error instanceof Error ? error.message : 'Failed to fetch models');
        setFetchedModels([]);
      } finally {
        setIsFetchingModels(false);
      }
      return;
    }

    if (!modelsUrl) {
      setFetchError('Please enter a URL');
      return;
    }

    setIsFetchingModels(true);
    setFetchError(null);

    try {
      // Use server-side proxy to bypass CORS restrictions
      const data = await api.fetchProviderModels(modelsUrl, editingProvider.apiKey);

      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response format: expected { data: [...] }');
      }

      // Sort models alphabetically by ID
      const sortedModels = [...data.data].sort((a, b) => a.id.localeCompare(b.id));
      setFetchedModels(sortedModels);
      setSelectedModelIds(new Set());
    } catch (error) {
      console.error('Failed to fetch models:', error);
      setFetchError(error instanceof Error ? error.message : 'Failed to fetch models');
      setFetchedModels([]);
    } finally {
      setIsFetchingModels(false);
    }
  };

  // Toggle model selection
  const toggleModelSelection = (modelId: string) => {
    const newSelection = new Set(selectedModelIds);
    if (newSelection.has(modelId)) {
      newSelection.delete(modelId);
    } else {
      newSelection.add(modelId);
    }
    setSelectedModelIds(newSelection);
  };

  // Add selected models to provider
  const handleAddSelectedModels = () => {
    const models = {
      ...(typeof editingProvider.models === 'object' && !Array.isArray(editingProvider.models)
        ? editingProvider.models
        : {}),
    };

    fetchedModels.forEach((model) => {
      if (selectedModelIds.has(model.id)) {
        // Only add if not already exists
        if (!models[model.id]) {
          models[model.id] = {
            pricing: { source: 'simple', input: 0, output: 0 },
            access_via: [],
          };
        }
      }
    });

    setEditingProvider({ ...editingProvider, models });
    setIsFetchModelsModalOpen(false);
  };

  const getQuotaDisplay = (provider: Provider) => {
    if (!provider.quotaChecker?.enabled) return null;
    if (quotasLoading) return <span className="text-foreground-muted text-xs">—</span>;
    const quota = quotas.find((q) => q.checkerId === provider.id);
    if (!quota?.meters?.length) return null;

    const handleQuotaClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      navigate('/quotas');
    };

    // Balance meters: show remaining
    const balanceMeter = quota.meters.find(
      (m) => m.kind === 'balance' && m.remaining !== undefined
    );
    if (balanceMeter && balanceMeter.remaining !== undefined) {
      const formatted = formatMeterValue(balanceMeter.remaining, balanceMeter.unit);
      return (
        <Pill tone="neutral" size="sm" onClick={handleQuotaClick} className="cursor-pointer">
          {formatted}
        </Pill>
      );
    }

    // Allowance meters: pick most constrained (highest utilization)
    const allowances = quota.meters.filter((m) => m.kind === 'allowance');
    const primary = allowances.reduce<(typeof allowances)[0] | undefined>((worst, m) => {
      if (!worst) return m;
      const wu = typeof worst.utilizationPercent === 'number' ? worst.utilizationPercent : 0;
      const mu = typeof m.utilizationPercent === 'number' ? m.utilizationPercent : 0;
      return mu > wu ? m : worst;
    }, undefined);

    if (!primary || typeof primary.utilizationPercent !== 'number') return null;
    const pct = Math.round(primary.utilizationPercent);
    const tone = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success';
    return (
      <Pill tone={tone} size="sm" onClick={handleQuotaClick} className="cursor-pointer">
        {pct}%
      </Pill>
    );
  };

  return (
    <ListPage
      title="Providers"
      subtitle="Configure upstream inference providers, credentials, and quota checkers."
      actions={
        <Button leftIcon={<Plus size={16} />} onClick={handleAddNew}>
          Add Provider
        </Button>
      }
    >
      {hasLoaded && providers.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No providers configured"
          description="Add an upstream provider to start routing model traffic. You can wire up credentials and quota checkers from the editor."
        >
          <Button leftIcon={<Plus size={16} />} onClick={handleAddNew}>
            Add Provider
          </Button>
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th
                    className="px-4 py-3 text-left border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider"
                    style={{ paddingLeft: '24px' }}
                  >
                    ID / Name
                  </th>
                  <th className="px-4 py-3 text-left border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider">
                    Status
                  </th>

                  <th className="px-4 py-3 text-left border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider">
                    Models
                  </th>
                  <th className="px-4 py-3 text-left border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider">
                    Quota/Balance
                  </th>
                  <th
                    className="px-4 py-3 text-left border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider"
                    style={{ paddingRight: '24px', textAlign: 'right' }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...providers]
                  .sort((a, b) => a.id.localeCompare(b.id))
                  .map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => handleEdit(p)}
                      style={{ cursor: 'pointer' }}
                      className="hover:bg-surface-elevated"
                    >
                      <td
                        className="px-4 py-3 text-left border-b border-border text-foreground"
                        style={{ paddingLeft: '24px' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Edit2 size={12} style={{ opacity: 0.5 }} />
                          <div style={{ fontWeight: 600 }}>{p.id}</div>
                          <div style={{ fontSize: '12px', color: 'var(--foreground-muted)' }}>
                            ( {p.name} )
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-left border-b border-border text-foreground">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={p.enabled !== false}
                            onCheckedChange={(val) => handleToggleEnabled(p, val)}
                            className="scale-75"
                          />
                        </div>
                      </td>

                      <td className="px-4 py-3 text-left border-b border-border text-foreground">
                        {p.models
                          ? Array.isArray(p.models)
                            ? p.models.length
                            : typeof p.models === 'object'
                              ? Object.keys(p.models).length
                              : 0
                          : 0}
                      </td>
                      <td className="px-4 py-3 text-left border-b border-border text-foreground">
                        {getQuotaDisplay(p)}
                      </td>
                      <td
                        className="px-4 py-3 text-left border-b border-border text-foreground"
                        style={{ paddingRight: '24px', textAlign: 'right' }}
                      >
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteModal(p);
                            }}
                            style={{ color: 'var(--danger)' }}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={originalId ? `Edit Provider: ${originalId}` : 'Add Provider'}
        size="lg"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} isLoading={isSaving} disabled={!!quotaValidationError}>
              Save Provider
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '-8px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr auto',
              gap: '12px',
              alignItems: 'end',
            }}
          >
            <Input
              label="Unique ID"
              value={editingProvider.id}
              onChange={(e) => setEditingProvider({ ...editingProvider, id: e.target.value })}
              placeholder="e.g. openai"
              disabled={!!originalId}
            />
            <Input
              label="Display Name"
              value={editingProvider.name}
              onChange={(e) => setEditingProvider({ ...editingProvider, name: e.target.value })}
              placeholder="e.g. OpenAI Production"
            />
            <Input
              label="API Key"
              type="password"
              value={editingProvider.apiKey}
              onChange={(e) => setEditingProvider({ ...editingProvider, apiKey: e.target.value })}
              placeholder="sk-..."
              disabled={isOAuthMode}
            />
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-foreground-muted">Enabled</label>
              <div style={{ height: '38px', display: 'flex', alignItems: 'center' }}>
                <Switch
                  checked={editingProvider.enabled !== false}
                  onCheckedChange={(checked) =>
                    setEditingProvider({ ...editingProvider, enabled: checked })
                  }
                />
              </div>
            </div>
          </div>

          {/* Separator */}
          <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Left: Connection */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[13px] font-medium text-foreground-muted">
                  Connection Type
                </label>
                <Select
                  value={isOAuthMode ? 'oauth' : 'url'}
                  onValueChange={(value) => {
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
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="url">Custom API URL</SelectItem>
                    <SelectItem value="oauth">OAuth (pi-ai)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isOAuthMode ? (
                <Section
                  title="OAuth Configuration"
                  rightSlot={
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '999px',
                          background:
                            oauthStatus === 'success' || (!oauthStatus && oauthCredentialReady)
                              ? 'var(--success)'
                              : oauthStatus === 'error' || oauthStatus === 'cancelled'
                                ? 'var(--danger)'
                                : 'var(--foreground-muted)',
                          opacity: oauthCredentialChecking ? 0.6 : 1,
                        }}
                      />
                      <span
                        className="text-[11px] font-medium text-foreground-muted"
                        style={{ textTransform: 'lowercase' }}
                      >
                        {oauthStatusLabel}
                      </span>
                    </div>
                  }
                  bodyStyle={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
                >
                  <div className="flex flex-col gap-1">
                    <label className="text-[13px] font-medium text-foreground-muted">
                      OAuth Provider
                    </label>
                    <Select
                      value={editingProvider.oauthProvider || OAUTH_PROVIDERS[0].value}
                      onValueChange={(v) =>
                        setEditingProvider({
                          ...editingProvider,
                          oauthProvider: v,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OAUTH_PROVIDERS.map((provider) => (
                          <SelectItem key={provider.value} value={provider.value}>
                            {provider.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    label="OAuth Account"
                    value={editingProvider.oauthAccount || ''}
                    onChange={(e) =>
                      setEditingProvider({
                        ...editingProvider,
                        oauthAccount: e.target.value,
                      })
                    }
                    placeholder="e.g. work, personal, team-a"
                  />
                  <div className="text-[11px] text-foreground-muted">
                    Tokens are saved to auth.json after login.
                  </div>

                  {oauthError && <div className="text-[11px] text-danger">{oauthError}</div>}

                  {oauthSession?.authInfo && (
                    <div className="space-y-2 rounded-md border border-border bg-surface-elevated p-3">
                      <div className="flex items-start gap-2">
                        <ShieldCheck
                          className="mt-0.5 size-4 shrink-0 text-info"
                          strokeWidth={1.75}
                        />
                        <div className="flex-1 space-y-1.5">
                          <div className="text-xs font-medium text-foreground">
                            Open this URL in your browser
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 break-all rounded border border-border bg-surface px-2 py-1.5 font-mono text-[11px] text-foreground">
                              {oauthSession.authInfo.url}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                navigator.clipboard.writeText(oauthSession.authInfo!.url);
                                toast.success('URL copied');
                              }}
                              aria-label="Copy URL"
                              className="shrink-0"
                            >
                              <Copy strokeWidth={1.75} />
                              Copy
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                window.open(oauthSession.authInfo!.url, '_blank', 'noopener')
                              }
                              aria-label="Open URL"
                              className="shrink-0"
                            >
                              Open
                            </Button>
                          </div>
                          {oauthSession.authInfo.instructions && (
                            <div className="text-[11px] text-foreground-muted">
                              {oauthSession.authInfo.instructions}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {oauthSession?.prompt && (
                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'flex-end',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <Input
                          label={oauthSession.prompt.message}
                          placeholder={oauthSession.prompt.placeholder}
                          value={oauthPromptValue}
                          onChange={(e) => setOauthPromptValue(e.target.value)}
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={handleSubmitPrompt}
                        disabled={
                          oauthBusy || (!oauthSession.prompt.allowEmpty && !oauthPromptValue)
                        }
                      >
                        Submit
                      </Button>
                    </div>
                  )}

                  {oauthSession?.status === 'awaiting_manual_code' && (
                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'flex-end',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <Input
                          label="Paste redirect URL or code"
                          value={oauthManualCode}
                          onChange={(e) => setOauthManualCode(e.target.value)}
                          placeholder="https://..."
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={handleSubmitManualCode}
                        disabled={oauthBusy || !oauthManualCode}
                      >
                        Submit
                      </Button>
                    </div>
                  )}

                  {oauthSession?.progress && oauthSession.progress.length > 0 && (
                    <div>
                      <div className="text-[11px] text-foreground-muted">Progress</div>
                      <div className="text-[11px] text-foreground" style={{ marginTop: '4px' }}>
                        {(oauthSession?.progress ?? []).slice(-3).map((message, idx) => (
                          <div key={`${message}-${idx}`}>{message}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {oauthStatus === 'success' && (
                    <div className="text-[11px] text-success">
                      Authentication complete. Tokens saved to auth.json.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleStartOAuth}
                      isLoading={oauthBusy && !oauthSessionId}
                      disabled={oauthBusy || (!!oauthSessionId && !oauthIsTerminal)}
                    >
                      {oauthSessionId && !oauthIsTerminal
                        ? 'OAuth in progress'
                        : oauthCredentialReady
                          ? 'Restart OAuth'
                          : 'Start OAuth'}
                    </Button>
                    {oauthSessionId && !oauthIsTerminal && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancelOAuth}
                        disabled={oauthBusy}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </Section>
              ) : (
                <Section
                  title="Base URL Entries"
                  collapsible
                  open={isApiBaseUrlsOpen}
                  onOpenChange={setIsApiBaseUrlsOpen}
                  info={
                    <div className="text-[11px]" style={{ lineHeight: '1.5' }}>
                      <span style={{ fontStyle: 'italic' }}>API types determine the protocol:</span>
                      <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
                        <li>
                          <span style={{ fontWeight: 600 }}>chat</span> — OpenAI-compatible
                          endpoints, including Ollama&apos;s{' '}
                          <code
                            style={{
                              background: 'var(--surface-elevated)',
                              padding: '1px 4px',
                              borderRadius: '2px',
                            }}
                          >
                            /v1
                          </code>{' '}
                          API
                        </li>
                        <li>
                          <span style={{ fontWeight: 600 }}>ollama</span> — Native Ollama API, use
                          the root URL (e.g.{' '}
                          <code
                            style={{
                              background: 'var(--surface-elevated)',
                              padding: '1px 4px',
                              borderRadius: '2px',
                            }}
                          >
                            http://localhost:11434
                          </code>
                          )
                        </li>
                      </ul>
                    </div>
                  }
                  rightSlot={
                    <>
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
                    </>
                  }
                  bodyStyle={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '8px',
                  }}
                >
                  {Object.entries(getApiBaseUrlMap()).length === 0 && (
                    <div className="text-[11px] text-foreground-muted italic">
                      No base URLs configured yet.
                    </div>
                  )}
                  {Object.entries(getApiBaseUrlMap()).map(([apiType, url]) => {
                    // Detect URL/API type mismatches based on endpoint-shape only
                    const urlLower = typeof url === 'string' ? url.toLowerCase() : '';
                    // Native Ollama API paths (not hostname-based, only path-based)
                    const hasNativeOllamaPath =
                      urlLower.includes('/api/chat') ||
                      urlLower.includes('/api/generate') ||
                      urlLower.includes('/api/embeddings') ||
                      urlLower.includes('/api/tags');
                    const hasV1Suffix = urlLower.includes('/v1');
                    // Warn when native Ollama type is selected but URL has /v1 (OpenAI-compatible)
                    const showOllamaV1Warning = apiType === 'ollama' && hasV1Suffix;
                    // Warn when chat type is selected but URL looks like native Ollama (path-based, no /v1)
                    const showChatOllamaWarning =
                      apiType === 'chat' && hasNativeOllamaPath && !hasV1Suffix;

                    return (
                      <div
                        key={apiType}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: '8px',
                          alignItems: 'start',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <Select
                            value={apiType}
                            onValueChange={(v) =>
                              updateApiBaseUrlEntry(apiType, v, typeof url === 'string' ? url : '')
                            }
                          >
                            <SelectTrigger size="sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {KNOWN_APIS.map((knownType) => (
                                <SelectItem key={knownType} value={knownType}>
                                  {knownType}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <input
                            className="w-full py-1.5 px-3 text-sm text-foreground bg-background border border-border rounded-md ring-offset-background focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder={
                              apiType === 'ollama'
                                ? 'http://localhost:11434'
                                : 'https://api.example.com/v1/...'
                            }
                            value={typeof url === 'string' ? url : ''}
                            onChange={(e) =>
                              updateApiBaseUrlEntry(apiType, apiType, e.target.value)
                            }
                          />
                          {showOllamaV1Warning && (
                            <div className="flex items-start gap-2 py-1.5 px-2 bg-warning/10 border border-warning/30 rounded-sm">
                              <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                              <span className="text-[11px] text-warning">
                                <span style={{ fontWeight: 600 }}>native ollama</span> type expects
                                root URL (e.g.{' '}
                                <code
                                  style={{
                                    background: 'var(--surface-elevated)',
                                    padding: '0 3px',
                                    borderRadius: '2px',
                                  }}
                                >
                                  http://localhost:11434
                                </code>
                                ). URLs with{' '}
                                <code
                                  style={{
                                    background: 'var(--surface-elevated)',
                                    padding: '0 3px',
                                    borderRadius: '2px',
                                  }}
                                >
                                  /v1
                                </code>{' '}
                                are OpenAI-compatible — use{' '}
                                <span style={{ fontWeight: 600 }}>chat</span> type instead.
                              </span>
                            </div>
                          )}
                          {showChatOllamaWarning && (
                            <div className="flex items-start gap-2 py-1.5 px-2 bg-warning/10 border border-warning/30 rounded-sm">
                              <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                              <span className="text-[11px] text-warning">
                                This URL contains{' '}
                                <code
                                  style={{
                                    background: 'var(--surface-elevated)',
                                    padding: '0 3px',
                                    borderRadius: '2px',
                                  }}
                                >
                                  /api/
                                </code>{' '}
                                paths typical of native Ollama. If this is a native Ollama endpoint,
                                use <span style={{ fontWeight: 600 }}>ollama</span> type instead.
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
                          <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                        </Button>
                      </div>
                    );
                  })}
                </Section>
              )}
            </div>

            {/* Right: Quota Checker */}
            <Section
              title="Quota Checker"
              collapsible
              defaultOpen={!!selectedQuotaCheckerType}
              rightSlot={
                <Pill tone={selectedQuotaCheckerType ? 'success' : 'neutral'} size="sm">
                  {selectedQuotaCheckerType ? 'Active' : 'Disabled'}
                </Pill>
              }
              bodyStyle={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 120px',
                  gap: '8px',
                  alignItems: 'end',
                }}
              >
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-foreground-muted">Type</label>
                  <Select
                    value={selectedQuotaCheckerType || '__none__'}
                    onValueChange={(v) => {
                      const quotaType = v === '__none__' ? '' : v;
                      if (!quotaType) {
                        setEditingProvider({ ...editingProvider, quotaChecker: undefined });
                        return;
                      }
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          type: quotaType,
                          enabled: true,
                          intervalMinutes: Math.max(
                            1,
                            editingProvider.quotaChecker?.intervalMinutes || 30
                          ),
                          options: editingProvider.quotaChecker?.options,
                        },
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">&lt;none&gt;</SelectItem>
                      {selectableQuotaCheckerTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-foreground-muted">
                    Interval (min)
                  </label>
                  <input
                    className="w-full py-2 px-3 text-sm text-foreground bg-background border border-border rounded-md ring-offset-background focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    type="number"
                    min={1}
                    step={1}
                    value={editingProvider.quotaChecker?.intervalMinutes || 30}
                    disabled={!selectedQuotaCheckerType}
                    onChange={(e) => {
                      const intervalMinutes = Math.max(1, parseInt(e.target.value, 10) || 30);
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          type: selectedQuotaCheckerType,
                          enabled: selectedQuotaCheckerType
                            ? editingProvider.quotaChecker?.enabled !== false
                            : false,
                          intervalMinutes,
                        },
                      });
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--foreground-muted)',
                  marginTop: '4px',
                  fontStyle: 'italic',
                }}
              >
                {isOAuthMode && oauthCheckerType
                  ? `Only the '${oauthCheckerType}' checker is available for this OAuth provider.`
                  : isOAuthMode
                    ? 'No quota checker is available for this OAuth provider type.'
                    : selectedQuotaCheckerType
                      ? 'Quota checker is active for this provider.'
                      : 'Select <none> to disable provider quota checks.'}
              </div>

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'naga' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <NagaQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'synthetic' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <SyntheticQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'nanogpt' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <NanoGPTQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'zai' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <ZAIQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'moonshot' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <MoonshotQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'novita' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <NovitaQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'minimax' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <MiniMaxQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'minimax-coding' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <MiniMaxCodingQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'openrouter' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <OpenRouterQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'kilo' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <KiloQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'poe' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <PoeQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'ollama' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <OllamaQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'wisdomgate' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-subtle">
                  <WisdomGateQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'kimi-code' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <KimiCodeQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'apertis' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <ApertisQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'antigravity' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <AntigravityQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'gemini-cli' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <GeminiCliQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'neuralwatt' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <NeuralwattQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {selectedQuotaCheckerType && selectedQuotaCheckerType === 'zenmux' && (
                <div className="mt-3 p-3 border border-border rounded-md bg-surface-elevated">
                  <ZenmuxQuotaConfig
                    options={editingProvider.quotaChecker?.options || {}}
                    onChange={(options) =>
                      setEditingProvider({
                        ...editingProvider,
                        quotaChecker: {
                          ...editingProvider.quotaChecker,
                          options,
                        } as Provider['quotaChecker'],
                      })
                    }
                  />
                </div>
              )}

              {quotaValidationError && (
                <div className="mt-2 text-xs text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2">
                  {quotaValidationError}
                </div>
              )}
            </Section>
          </div>

          {/* Advanced */}
          <Section
            title="Advanced"
            collapsible
            open={isAdvancedOpen}
            onOpenChange={setIsAdvancedOpen}
            bodyStyle={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            {/* Discount */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '140px',
                gap: '12px',
                alignItems: 'end',
              }}
            >
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-foreground-muted">
                  Discount (%)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="w-full py-2 pl-3 pr-7 text-sm text-foreground bg-background border border-border rounded-md ring-offset-background focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={Math.round((editingProvider.discount ?? 0) * 100)}
                    onChange={(e) => {
                      const percent = Number(e.target.value || '0');
                      const clamped = Math.min(100, Math.max(0, percent));
                      setEditingProvider({ ...editingProvider, discount: clamped / 100 });
                    }}
                  />
                  <span
                    className="text-[12px] text-foreground-muted"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                    }}
                  >
                    %
                  </span>
                </div>
              </div>
            </div>

            {/* GPU Profile (used for inference energy calculation) */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-foreground-muted">GPU Profile</label>
              <Select
                value={editingProvider.gpu_profile || '__default__'}
                onValueChange={(v) => {
                  const value = v === '__default__' ? '' : v;
                  if (!value) {
                    const resolved = resolveGpuParams('B200');
                    setEditingProvider({
                      ...editingProvider,
                      gpu_profile: undefined,
                      gpu_ram_gb: resolved.ram_gb,
                      gpu_bandwidth_tb_s: resolved.bandwidth_tb_s,
                      gpu_flops_tflop: resolved.flops_tflop,
                      gpu_power_draw_watts: resolved.power_draw_watts,
                    });
                  } else if (value === 'custom') {
                    const resolved = resolveGpuParams('custom', {
                      ram_gb: editingProvider.gpu_ram_gb,
                      bandwidth_tb_s: editingProvider.gpu_bandwidth_tb_s,
                      flops_tflop: editingProvider.gpu_flops_tflop,
                      power_draw_watts: editingProvider.gpu_power_draw_watts,
                    });
                    setEditingProvider({
                      ...editingProvider,
                      gpu_profile: 'custom',
                      gpu_ram_gb: resolved.ram_gb,
                      gpu_bandwidth_tb_s: resolved.bandwidth_tb_s,
                      gpu_flops_tflop: resolved.flops_tflop,
                      gpu_power_draw_watts: resolved.power_draw_watts,
                    });
                  } else {
                    const resolved = resolveGpuParams(value);
                    setEditingProvider({
                      ...editingProvider,
                      gpu_profile: value,
                      gpu_ram_gb: resolved.ram_gb,
                      gpu_bandwidth_tb_s: resolved.bandwidth_tb_s,
                      gpu_flops_tflop: resolved.flops_tflop,
                      gpu_power_draw_watts: resolved.power_draw_watts,
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Default (B200)</SelectItem>
                  {GPU_PROFILE_OPTIONS.map((profile) => (
                    <SelectItem key={profile.value} value={profile.value}>
                      {profile.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editingProvider.gpu_profile === 'custom' && (
                <div className="mt-2 p-3 border border-border rounded-md bg-surface-elevated">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-foreground-muted">
                        RAM (GB)
                      </label>
                      <input
                        className="w-full py-2 px-3 text-sm text-foreground bg-surface-elevated border border-border rounded-sm outline-none focus:border-primary"
                        type="number"
                        step="1"
                        min="1"
                        value={editingProvider.gpu_ram_gb || ''}
                        onChange={(e) =>
                          setEditingProvider({
                            ...editingProvider,
                            gpu_ram_gb: parseFloat(e.target.value) || undefined,
                          })
                        }
                        placeholder="e.g. 80"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-foreground-muted">
                        Bandwidth (TB/s)
                      </label>
                      <input
                        className="w-full py-2 px-3 text-sm text-foreground bg-surface-elevated border border-border rounded-sm outline-none focus:border-primary"
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={editingProvider.gpu_bandwidth_tb_s || ''}
                        onChange={(e) =>
                          setEditingProvider({
                            ...editingProvider,
                            gpu_bandwidth_tb_s: parseFloat(e.target.value) || undefined,
                          })
                        }
                        placeholder="e.g. 3.35"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-foreground-muted">
                        FLOPS (TFLOPs)
                      </label>
                      <input
                        className="w-full py-2 px-3 text-sm text-foreground bg-surface-elevated border border-border rounded-sm outline-none focus:border-primary"
                        type="number"
                        step="100"
                        min="1"
                        value={editingProvider.gpu_flops_tflop || ''}
                        onChange={(e) =>
                          setEditingProvider({
                            ...editingProvider,
                            gpu_flops_tflop: parseFloat(e.target.value) || undefined,
                          })
                        }
                        placeholder="e.g. 4000"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-foreground-muted">
                        Power Draw (Watts)
                      </label>
                      <input
                        className="w-full py-2 px-3 text-sm text-foreground bg-surface-elevated border border-border rounded-sm outline-none focus:border-primary"
                        type="number"
                        step="10"
                        min="1"
                        value={editingProvider.gpu_power_draw_watts || ''}
                        onChange={(e) =>
                          setEditingProvider({
                            ...editingProvider,
                            gpu_power_draw_watts: parseInt(e.target.value, 10) || undefined,
                          })
                        }
                        placeholder="e.g. 700"
                      />
                    </div>
                  </div>
                </div>
              )}
              <div className="text-[11px] text-foreground-muted">
                Used for inference energy calculation. Select a preset or enter custom GPU specs.
              </div>
            </div>

            {/* Custom Headers */}
            <Section
              title="Custom Headers"
              collapsible
              open={isHeadersOpen}
              onOpenChange={setIsHeadersOpen}
              rightSlot={
                <>
                  <Pill tone="neutral" size="sm">
                    {Object.keys(editingProvider.headers || {}).length}
                  </Pill>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      addKV('headers');
                      setIsHeadersOpen(true);
                    }}
                  >
                    <Plus size={14} />
                  </Button>
                </>
              }
              bodyStyle={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: '8px',
              }}
            >
              {Object.entries(editingProvider.headers || {}).length === 0 && (
                <div className="text-[11px] text-foreground-muted italic">
                  No custom headers configured.
                </div>
              )}
              {Object.entries(editingProvider.headers || {}).map(([key, val], idx) => (
                <div key={idx} style={{ display: 'flex', gap: '6px' }}>
                  <Input
                    placeholder="Header Name"
                    value={key}
                    onChange={(e) => updateKV('headers', key, e.target.value, val)}
                    style={{ flex: 1 }}
                  />
                  <Input
                    placeholder="Value"
                    value={typeof val === 'object' ? JSON.stringify(val) : val}
                    onChange={(e) => {
                      const rawValue = e.target.value;
                      let parsedValue;
                      try {
                        parsedValue = JSON.parse(rawValue);
                      } catch {
                        parsedValue = rawValue;
                      }
                      updateKV('headers', key, key, parsedValue);
                    }}
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeKV('headers', key)}
                    style={{ padding: '4px' }}
                  >
                    <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                  </Button>
                </div>
              ))}
            </Section>

            {/* Extra Body Fields */}
            <Section
              title="Extra Body Fields"
              collapsible
              open={isExtraBodyOpen}
              onOpenChange={setIsExtraBodyOpen}
              rightSlot={
                <>
                  <Pill tone="neutral" size="sm">
                    {Object.keys(editingProvider.extraBody || {}).length}
                  </Pill>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      addKV('extraBody');
                      setIsExtraBodyOpen(true);
                    }}
                  >
                    <Plus size={14} />
                  </Button>
                </>
              }
              bodyStyle={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: '8px',
              }}
            >
              {Object.entries(editingProvider.extraBody || {}).length === 0 && (
                <div className="text-[11px] text-foreground-muted italic">
                  No extra body fields configured.
                </div>
              )}
              {Object.entries(editingProvider.extraBody || {}).map(([key, val], idx) => (
                <div key={idx} style={{ display: 'flex', gap: '6px' }}>
                  <Input
                    placeholder="Field Name"
                    value={key}
                    onChange={(e) => updateKV('extraBody', key, e.target.value, val)}
                    style={{ flex: 1 }}
                  />
                  <Input
                    placeholder="Value"
                    value={typeof val === 'object' ? JSON.stringify(val) : val}
                    onChange={(e) => {
                      const rawValue = e.target.value;
                      let parsedValue;
                      try {
                        parsedValue = JSON.parse(rawValue);
                      } catch {
                        parsedValue = rawValue;
                      }
                      updateKV('extraBody', key, key, parsedValue);
                    }}
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeKV('extraBody', key)}
                    style={{ padding: '4px' }}
                  >
                    <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                  </Button>
                </div>
              ))}
            </Section>

            {/* Estimate Tokens */}
            <div className="border border-border rounded-md p-3 bg-surface-elevated">
              <div className="flex items-center gap-2" style={{ minHeight: '38px' }}>
                <Switch
                  checked={editingProvider.estimateTokens || false}
                  onCheckedChange={(checked) =>
                    setEditingProvider({
                      ...editingProvider,
                      estimateTokens: checked,
                    })
                  }
                />
                <label
                  className="text-[13px] font-medium text-foreground"
                  style={{ marginBottom: 0 }}
                >
                  Estimate Tokens
                </label>
              </div>
              <div
                className="text-[11px] text-foreground-muted"
                style={{ lineHeight: 1.35, marginTop: '4px' }}
              >
                Enable token estimation only when a provider does not return usage data.
                <span className="text-warning" style={{ marginLeft: '6px' }}>
                  Use sparingly—this is rarely needed.
                </span>
              </div>
            </div>

            {/* Disable Cooldown */}
            <div className="border border-border rounded-md p-3 bg-surface-elevated">
              <div className="flex items-center gap-2" style={{ minHeight: '38px' }}>
                <Switch
                  checked={editingProvider.disableCooldown || false}
                  onCheckedChange={(checked) =>
                    setEditingProvider({
                      ...editingProvider,
                      disableCooldown: checked,
                    })
                  }
                />
                <label
                  className="text-[13px] font-medium text-foreground"
                  style={{ marginBottom: 0 }}
                >
                  Disable Cooldowns
                </label>
              </div>
              <div
                className="text-[11px] text-foreground-muted"
                style={{ lineHeight: 1.35, marginTop: '4px' }}
              >
                When enabled, this provider will never be placed on cooldown due to errors — it will
                always remain eligible for routing regardless of consecutive failures.
                <span className="text-warning" style={{ marginLeft: '6px' }}>
                  Use only for providers with reliable external rate-limit handling.
                </span>
              </div>
            </div>

            {/* Use Claude Masking */}
            <div className="border border-border rounded-md p-3 bg-surface-elevated">
              <div className="flex items-center gap-2" style={{ minHeight: '38px' }}>
                <Switch
                  checked={editingProvider.useClaudeMasking || false}
                  onCheckedChange={(checked) =>
                    setEditingProvider({
                      ...editingProvider,
                      useClaudeMasking: checked,
                    })
                  }
                />
                <label
                  className="text-[13px] font-medium text-foreground"
                  style={{ marginBottom: 0 }}
                >
                  Use Claude Masking
                </label>
              </div>
              <div
                className="text-[11px] text-foreground-muted"
                style={{ lineHeight: 1.35, marginTop: '4px' }}
              >
                When enabled, requests to this Anthropic provider will be masked as Claude Code CLI
                sessions — tool names are prefixed to avoid conflicts with built-in tools, and
                Claude Code headers are injected. Applies regardless of API key type or OAuth.
                <span className="text-warning" style={{ marginLeft: '6px' }}>
                  Only effective for Anthropic providers.
                </span>
              </div>
            </div>
          </Section>

          {/* Models */}
          <Section
            title="Provider Models"
            collapsible
            open={isModelsOpen}
            onOpenChange={setIsModelsOpen}
            rightSlot={
              <>
                <Pill tone="success" size="sm">
                  {Object.keys(editingProvider.models || {}).length} Models
                </Pill>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenFetchModels();
                  }}
                  leftIcon={<Download size={14} />}
                >
                  Fetch Models
                </Button>
              </>
            }
            bodyStyle={{ padding: '8px' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {Object.entries(editingProvider.models || {}).map(([mId, mCfg]: [string, any]) => (
                <div
                  key={mId}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                  }}
                >
                  <div
                    style={{
                      padding: '6px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                    }}
                    onClick={() => setOpenModelIdx(openModelIdx === mId ? null : mId)}
                  >
                    {openModelIdx === mId ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span style={{ fontWeight: 600, fontSize: '12px', flex: 1 }}>{mId}</span>
                    {(() => {
                      const testKey = `${editingProvider.id}-${mId}`;
                      const testState = testStates[testKey];
                      return (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTestModel(editingProvider.id, mId, mCfg.type);
                          }}
                          className="flex items-center cursor-pointer"
                          title="Test this model"
                        >
                          {testState?.loading ? (
                            <Loader2 size={14} className="animate-spin text-foreground-muted" />
                          ) : testState?.showResult && testState.result === 'success' ? (
                            <CheckCircle size={14} className="text-success" />
                          ) : testState?.showResult && testState.result === 'error' ? (
                            <XCircle size={14} className="text-danger" />
                          ) : (
                            <Play size={14} className="text-primary opacity-60" />
                          )}
                        </div>
                      );
                    })()}
                    {(() => {
                      const testKey = `${editingProvider.id}-${mId}`;
                      const testState = testStates[testKey];
                      return testState?.showResult && testState.message ? (
                        <span
                          className={`text-[11px] italic ${testState.result === 'success' ? 'text-success' : 'text-danger'}`}
                        >
                          {testState.message}
                        </span>
                      ) : null;
                    })()}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeModel(mId);
                      }}
                      style={{ color: 'var(--danger)', padding: '2px' }}
                    >
                      <X size={12} />
                    </Button>
                  </div>
                  {openModelIdx === mId && (
                    <div
                      style={{
                        padding: '8px',
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <ModelIdInput modelId={mId} onCommit={updateModelId} />

                      <div className="grid gap-4 grid-cols-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[13px] font-medium text-foreground-muted">
                            Model Type
                          </label>
                          <Select
                            value={mCfg.type || 'chat'}
                            onValueChange={(v) => {
                              const newType = v as
                                | 'chat'
                                | 'embeddings'
                                | 'transcriptions'
                                | 'speech'
                                | 'image'
                                | 'responses';
                              // If switching to embeddings, clear non-embeddings APIs from access_via
                              if (newType === 'embeddings') {
                                const filteredAccessVia = (mCfg.access_via || []).filter(
                                  (api: string) => api === 'embeddings'
                                );
                                updateModelConfig(mId, {
                                  type: newType,
                                  access_via:
                                    filteredAccessVia.length > 0
                                      ? filteredAccessVia
                                      : ['embeddings'],
                                });
                              } else if (newType === 'transcriptions') {
                                const filteredAccessVia = (mCfg.access_via || []).filter(
                                  (api: string) => api === 'transcriptions'
                                );
                                updateModelConfig(mId, {
                                  type: newType,
                                  access_via:
                                    filteredAccessVia.length > 0
                                      ? filteredAccessVia
                                      : ['transcriptions'],
                                });
                              } else if (newType === 'speech') {
                                const filteredAccessVia = (mCfg.access_via || []).filter(
                                  (api: string) => api === 'speech'
                                );
                                updateModelConfig(mId, {
                                  type: newType,
                                  access_via:
                                    filteredAccessVia.length > 0 ? filteredAccessVia : ['speech'],
                                });
                              } else if (newType === 'image') {
                                const filteredAccessVia = (mCfg.access_via || []).filter(
                                  (api: string) => api === 'images'
                                );
                                updateModelConfig(mId, {
                                  type: newType,
                                  access_via:
                                    filteredAccessVia.length > 0 ? filteredAccessVia : ['images'],
                                });
                              } else if (newType === 'responses') {
                                const filteredAccessVia = (mCfg.access_via || []).filter(
                                  (api: string) => api === 'responses'
                                );
                                updateModelConfig(mId, {
                                  type: newType,
                                  access_via:
                                    filteredAccessVia.length > 0
                                      ? filteredAccessVia
                                      : ['responses'],
                                });
                              } else {
                                updateModelConfig(mId, { type: newType });
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="chat">Chat</SelectItem>
                              <SelectItem value="embeddings">Embeddings</SelectItem>
                              <SelectItem value="transcriptions">Transcriptions</SelectItem>
                              <SelectItem value="speech">Speech</SelectItem>
                              <SelectItem value="image">Image</SelectItem>
                              <SelectItem value="responses">Responses</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[13px] font-medium text-foreground-muted">
                            Pricing Source
                          </label>
                          <Select
                            value={mCfg.pricing?.source || 'simple'}
                            onValueChange={(v) => {
                              const newSource = v;
                              let newPricing: any;

                              // Create a clean pricing object based on the selected source
                              if (newSource === 'simple') {
                                newPricing = {
                                  source: 'simple',
                                  input: mCfg.pricing?.input || 0,
                                  output: mCfg.pricing?.output || 0,
                                  cached: mCfg.pricing?.cached || 0,
                                  cache_write: mCfg.pricing?.cache_write || 0,
                                };
                              } else if (newSource === 'openrouter') {
                                newPricing = {
                                  source: 'openrouter',
                                  slug: mCfg.pricing?.slug || '',
                                  ...(mCfg.pricing?.discount !== undefined && {
                                    discount: mCfg.pricing.discount,
                                  }),
                                };
                              } else if (newSource === 'defined') {
                                newPricing = {
                                  source: 'defined',
                                  range: mCfg.pricing?.range || [],
                                };
                              } else if (newSource === 'per_request') {
                                newPricing = {
                                  source: 'per_request',
                                  amount: mCfg.pricing?.amount || 0,
                                };
                              }

                              updateModelConfig(mId, { pricing: newPricing });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="simple">Simple</SelectItem>
                              <SelectItem value="openrouter">OpenRouter</SelectItem>
                              <SelectItem value="defined">Ranges (Complex)</SelectItem>
                              <SelectItem value="per_request">Per Request (Flat Fee)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {mCfg.type !== 'embeddings' &&
                          mCfg.type !== 'transcriptions' &&
                          mCfg.type !== 'speech' &&
                          mCfg.type !== 'image' &&
                          mCfg.type !== 'responses' && (
                            <div className="flex flex-col gap-1">
                              <label className="text-[13px] font-medium text-foreground-muted">
                                Access Via (APIs)
                              </label>
                              <div
                                style={{
                                  fontSize: '11px',
                                  color: 'var(--foreground-muted)',
                                  marginBottom: '4px',
                                  lineHeight: '1.4',
                                }}
                              >
                                Choose which API protocols this model should use.{' '}
                                <span style={{ fontWeight: 600 }}>chat</span> works with most
                                providers. Use <span style={{ fontWeight: 600 }}>ollama</span> only
                                for native Ollama API.
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '6px',
                                  flexWrap: 'wrap',
                                  marginTop: '4px',
                                }}
                              >
                                {KNOWN_APIS.filter((apiType) => {
                                  if (mCfg.type === 'chat') {
                                    return [
                                      'messages',
                                      'chat',
                                      'gemini',
                                      'responses',
                                      'ollama',
                                    ].includes(apiType);
                                  }
                                  return true;
                                }).map((apiType) => {
                                  const isEmbeddingsModel = mCfg.type === 'embeddings';
                                  const isTranscriptionsModel = mCfg.type === 'transcriptions';
                                  const isSpeechModel = mCfg.type === 'speech';
                                  const isImageModel = mCfg.type === 'image';
                                  const isResponsesModel = mCfg.type === 'responses';
                                  const isDisabled =
                                    (isEmbeddingsModel && apiType !== 'embeddings') ||
                                    (isTranscriptionsModel && apiType !== 'transcriptions') ||
                                    (isSpeechModel && apiType !== 'speech') ||
                                    (isImageModel && apiType !== 'images') ||
                                    (isResponsesModel && apiType !== 'responses');

                                  return (
                                    <label
                                      key={apiType}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        fontSize: '11px',
                                        opacity: isDisabled ? 0.4 : 1,
                                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={(mCfg.access_via || []).includes(apiType)}
                                        disabled={isDisabled}
                                        onChange={() => {
                                          const current = mCfg.access_via || [];
                                          const next = current.includes(apiType)
                                            ? current.filter((a: string) => a !== apiType)
                                            : [...current, apiType];
                                          updateModelConfig(mId, { access_via: next });
                                        }}
                                      />
                                      <span
                                        className="inline-flex items-center gap-2 py-1.5 px-3 rounded-xl text-xs font-medium"
                                        style={{
                                          ...getApiBadgeStyle(apiType),
                                          fontSize: '10px',
                                          padding: '2px 6px',
                                          opacity: (mCfg.access_via || []).includes(apiType)
                                            ? 1
                                            : 0.5,
                                        }}
                                      >
                                        {apiType}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                              {(!mCfg.access_via || mCfg.access_via.length === 0) && (
                                <div
                                  style={{
                                    fontSize: '11px',
                                    color: 'var(--foreground-muted)',
                                    marginTop: '4px',
                                    fontStyle: 'italic',
                                  }}
                                >
                                  Empty selection — Plexus will use any API type configured for this
                                  provider.
                                </div>
                              )}
                              {(() => {
                                // Check if provider has an ollama base URL configured
                                const providerBaseUrlMap = getApiBaseUrlMap();
                                const hasOllamaBaseUrl = Object.entries(providerBaseUrlMap).some(
                                  ([type, url]) => type === 'ollama' && url && url.trim() !== ''
                                );
                                // Check if model is not opted into ollama access_via
                                const accessVia = mCfg.access_via || [];
                                const modelMissingOllamaAccess = !accessVia.includes('ollama');

                                if (
                                  hasOllamaBaseUrl &&
                                  modelMissingOllamaAccess &&
                                  mCfg.type !== 'embeddings' &&
                                  mCfg.type !== 'transcriptions' &&
                                  mCfg.type !== 'speech' &&
                                  mCfg.type !== 'image' &&
                                  mCfg.type !== 'responses'
                                ) {
                                  return (
                                    <div className="flex items-start gap-2 py-1.5 px-2 bg-info/10 border border-info/30 rounded-sm mt-2">
                                      <Info size={14} className="text-info shrink-0 mt-0.5" />
                                      <span className="text-[11px] text-info">
                                        Provider has a native Ollama URL. If you want this model to
                                        use native Ollama, select{' '}
                                        <span style={{ fontWeight: 600 }}>ollama</span> in Access
                                        Via above.
                                      </span>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          )}
                        {mCfg.type === 'embeddings' && (
                          <div className="flex flex-col gap-1">
                            <div
                              style={{
                                fontSize: '11px',
                                color: 'var(--foreground-muted)',
                                marginTop: '4px',
                                fontStyle: 'italic',
                                padding: '8px',
                                background: 'var(--surface-elevated)',
                                borderRadius: 'var(--radius-sm)',
                              }}
                            >
                              <Info className="inline w-3 h-3 mb-0.5 mr-1" />
                              Embeddings models automatically use the 'embeddings' API only.
                            </div>
                          </div>
                        )}
                        {mCfg.type === 'transcriptions' && (
                          <div className="flex flex-col gap-1">
                            <div
                              style={{
                                fontSize: '11px',
                                color: 'var(--foreground-muted)',
                                marginTop: '4px',
                                fontStyle: 'italic',
                                padding: '8px',
                                background: 'var(--surface-elevated)',
                                borderRadius: 'var(--radius-sm)',
                              }}
                            >
                              <Info className="inline w-3 h-3 mb-0.5 mr-1" />
                              Transcriptions models automatically use the 'transcriptions' API only.
                            </div>
                          </div>
                        )}
                        {mCfg.type === 'speech' && (
                          <div className="flex flex-col gap-1">
                            <div
                              style={{
                                fontSize: '11px',
                                color: 'var(--foreground-muted)',
                                marginTop: '4px',
                                fontStyle: 'italic',
                                padding: '8px',
                                background: 'var(--surface-elevated)',
                                borderRadius: 'var(--radius-sm)',
                              }}
                            >
                              <Info className="inline w-3 h-3 mb-0.5 mr-1" />
                              Speech models automatically use the 'speech' API only.
                            </div>
                          </div>
                        )}
                        {mCfg.type === 'image' && (
                          <div className="flex flex-col gap-1">
                            <div
                              style={{
                                fontSize: '11px',
                                color: 'var(--foreground-muted)',
                                marginTop: '4px',
                                fontStyle: 'italic',
                                padding: '8px',
                                background: 'var(--surface-elevated)',
                                borderRadius: 'var(--radius-sm)',
                              }}
                            >
                              <Info className="inline w-3 h-3 mb-0.5 mr-1" />
                              Image models automatically use the 'images' API only.
                            </div>
                          </div>
                        )}
                        {mCfg.type === 'responses' && (
                          <div className="flex flex-col gap-1">
                            <div
                              style={{
                                fontSize: '11px',
                                color: 'var(--foreground-muted)',
                                marginTop: '4px',
                                fontStyle: 'italic',
                                padding: '8px',
                                background: 'var(--surface-elevated)',
                                borderRadius: 'var(--radius-sm)',
                              }}
                            >
                              <Info className="inline w-3 h-3 mb-0.5 mr-1" />
                              Responses models automatically use the 'responses' API only.
                            </div>
                          </div>
                        )}
                      </div>

                      {mCfg.pricing?.source === 'simple' && (
                        <div
                          className="grid grid-cols-4 gap-4"
                          style={{
                            background: 'var(--surface-elevated)',
                            padding: '12px',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          <Input
                            label="Input $/M"
                            type="number"
                            step="0.000001"
                            value={mCfg.pricing.input || 0}
                            onChange={(e) =>
                              updateModelConfig(mId, {
                                pricing: {
                                  ...mCfg.pricing,
                                  input: parseFloat(e.target.value),
                                },
                              })
                            }
                          />
                          <Input
                            label="Output $/M"
                            type="number"
                            step="0.000001"
                            value={mCfg.pricing.output || 0}
                            onChange={(e) =>
                              updateModelConfig(mId, {
                                pricing: {
                                  ...mCfg.pricing,
                                  output: parseFloat(e.target.value),
                                },
                              })
                            }
                          />
                          <Input
                            label="Cached $/M"
                            type="number"
                            step="0.000001"
                            value={mCfg.pricing.cached || 0}
                            onChange={(e) =>
                              updateModelConfig(mId, {
                                pricing: {
                                  ...mCfg.pricing,
                                  cached: parseFloat(e.target.value),
                                },
                              })
                            }
                          />
                          <Input
                            label="Cache Write $/M"
                            type="number"
                            step="0.000001"
                            value={mCfg.pricing.cache_write || 0}
                            onChange={(e) =>
                              updateModelConfig(mId, {
                                pricing: {
                                  ...mCfg.pricing,
                                  cache_write: parseFloat(e.target.value),
                                },
                              })
                            }
                          />
                        </div>
                      )}

                      {mCfg.pricing?.source === 'openrouter' && (
                        <div
                          style={{
                            background: 'var(--surface-elevated)',
                            padding: '12px',
                            borderRadius: 'var(--radius-sm)',
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'end',
                          }}
                        >
                          <div style={{ flex: '1' }}>
                            <OpenRouterSlugInput
                              label="OpenRouter Model Slug"
                              placeholder="e.g. anthropic/claude-3.5-sonnet or just 'claude-sonnet'"
                              value={mCfg.pricing.slug || ''}
                              onChange={(value) =>
                                updateModelConfig(mId, {
                                  pricing: { ...mCfg.pricing, slug: value },
                                })
                              }
                            />
                          </div>
                          <div style={{ width: '10%', minWidth: '80px' }}>
                            <Input
                              label="Discount (0-1)"
                              type="number"
                              step="0.01"
                              min="0"
                              max="1"
                              placeholder=""
                              value={mCfg.pricing.discount ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                  const { discount, ...rest } = mCfg.pricing;
                                  updateModelConfig(mId, { pricing: rest });
                                } else {
                                  updateModelConfig(mId, {
                                    pricing: { ...mCfg.pricing, discount: parseFloat(val) },
                                  });
                                }
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {mCfg.pricing?.source === 'defined' && (
                        <div
                          style={{
                            background: 'var(--surface-elevated)',
                            padding: '12px',
                            borderRadius: 'var(--radius-sm)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <label
                              className="text-[13px] font-medium text-foreground-muted"
                              style={{ marginBottom: 0 }}
                            >
                              Pricing Ranges
                            </label>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                const currentRanges = mCfg.pricing.range || [];
                                updateModelConfig(mId, {
                                  pricing: {
                                    ...mCfg.pricing,
                                    range: [
                                      ...currentRanges,
                                      {
                                        lower_bound: 0,
                                        upper_bound: 0,
                                        input_per_m: 0,
                                        output_per_m: 0,
                                        cache_write_per_m: 0,
                                      },
                                    ],
                                  },
                                });
                              }}
                              leftIcon={<Plus size={14} />}
                            >
                              Add Range
                            </Button>
                          </div>

                          {(mCfg.pricing.range || []).map((range: any, idx: number) => (
                            <div
                              key={idx}
                              style={{
                                border: '1px solid var(--border)',
                                padding: '12px',
                                borderRadius: 'var(--radius-sm)',
                                position: 'relative',
                              }}
                            >
                              <Button
                                size="sm"
                                variant="ghost"
                                style={{
                                  position: 'absolute',
                                  top: '8px',
                                  right: '8px',
                                  color: 'var(--danger)',
                                  padding: '4px',
                                }}
                                onClick={() => {
                                  const newRanges = [...mCfg.pricing.range];
                                  newRanges.splice(idx, 1);
                                  updateModelConfig(mId, {
                                    pricing: { ...mCfg.pricing, range: newRanges },
                                  });
                                }}
                              >
                                <X size={14} />
                              </Button>

                              <div
                                className="grid gap-4 grid-cols-2"
                                style={{ marginBottom: '8px' }}
                              >
                                <Input
                                  label="Lower Bound"
                                  type="number"
                                  value={range.lower_bound}
                                  onChange={(e) => {
                                    const newRanges = [...mCfg.pricing.range];
                                    newRanges[idx] = {
                                      ...range,
                                      lower_bound: parseFloat(e.target.value),
                                    };
                                    updateModelConfig(mId, {
                                      pricing: { ...mCfg.pricing, range: newRanges },
                                    });
                                  }}
                                />
                                <Input
                                  label="Upper Bound (0 = Infinite)"
                                  type="number"
                                  value={range.upper_bound === Infinity ? 0 : range.upper_bound}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    const newRanges = [...mCfg.pricing.range];
                                    newRanges[idx] = {
                                      ...range,
                                      upper_bound: val === 0 ? Infinity : val,
                                    };
                                    updateModelConfig(mId, {
                                      pricing: { ...mCfg.pricing, range: newRanges },
                                    });
                                  }}
                                />
                              </div>
                              <div className="grid grid-cols-4 gap-4">
                                <Input
                                  label="Input $/M"
                                  type="number"
                                  step="0.000001"
                                  value={range.input_per_m}
                                  onChange={(e) => {
                                    const newRanges = [...mCfg.pricing.range];
                                    newRanges[idx] = {
                                      ...range,
                                      input_per_m: parseFloat(e.target.value),
                                    };
                                    updateModelConfig(mId, {
                                      pricing: { ...mCfg.pricing, range: newRanges },
                                    });
                                  }}
                                />
                                <Input
                                  label="Output $/M"
                                  type="number"
                                  step="0.000001"
                                  value={range.output_per_m}
                                  onChange={(e) => {
                                    const newRanges = [...mCfg.pricing.range];
                                    newRanges[idx] = {
                                      ...range,
                                      output_per_m: parseFloat(e.target.value),
                                    };
                                    updateModelConfig(mId, {
                                      pricing: { ...mCfg.pricing, range: newRanges },
                                    });
                                  }}
                                />
                                <Input
                                  label="Cached $/M"
                                  type="number"
                                  step="0.000001"
                                  value={range.cached_per_m || 0}
                                  onChange={(e) => {
                                    const newRanges = [...mCfg.pricing.range];
                                    newRanges[idx] = {
                                      ...range,
                                      cached_per_m: parseFloat(e.target.value),
                                    };
                                    updateModelConfig(mId, {
                                      pricing: { ...mCfg.pricing, range: newRanges },
                                    });
                                  }}
                                />
                                <Input
                                  label="Cache Write $/M"
                                  type="number"
                                  step="0.000001"
                                  value={range.cache_write_per_m || 0}
                                  onChange={(e) => {
                                    const nextValue = Number(e.target.value);
                                    const newRanges = [...mCfg.pricing.range];
                                    newRanges[idx] = {
                                      ...range,
                                      cache_write_per_m: Number.isFinite(nextValue) ? nextValue : 0,
                                    };
                                    updateModelConfig(mId, {
                                      pricing: { ...mCfg.pricing, range: newRanges },
                                    });
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                          {(!mCfg.pricing.range || mCfg.pricing.range.length === 0) && (
                            <div className="text-foreground-muted italic text-center text-sm p-4">
                              No ranges defined. Pricing will likely default to 0.
                            </div>
                          )}
                        </div>
                      )}

                      {mCfg.pricing?.source === 'per_request' && (
                        <div
                          className="grid grid-cols-1 gap-4"
                          style={{
                            background: 'var(--surface-elevated)',
                            padding: '12px',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          <Input
                            label="Cost Per Request ($)"
                            type="number"
                            step="0.000001"
                            min="0"
                            value={mCfg.pricing.amount || 0}
                            onChange={(e) =>
                              updateModelConfig(mId, {
                                pricing: {
                                  ...mCfg.pricing,
                                  amount: parseFloat(e.target.value) || 0,
                                },
                              })
                            }
                          />
                          <div
                            className="text-[11px] text-foreground-muted"
                            style={{ fontStyle: 'italic' }}
                          >
                            A flat fee charged per API call, regardless of token count. The full
                            amount is recorded as the request cost.
                          </div>
                        </div>
                      )}

                      {/* Per-Model Extra Body Fields */}
                      <div
                        className="border border-border rounded-md p-3 bg-surface-elevated"
                        style={{ marginTop: '12px' }}
                      >
                        <div
                          className="flex items-center gap-2 cursor-pointer"
                          style={{ minHeight: '38px' }}
                          onClick={() =>
                            setIsModelExtraBodyOpen({
                              ...isModelExtraBodyOpen,
                              [mId]: !isModelExtraBodyOpen[mId],
                            })
                          }
                        >
                          {isModelExtraBodyOpen[mId] ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                          <label
                            className="text-[13px] font-medium text-foreground-muted"
                            style={{ marginBottom: 0, flex: 1, cursor: 'pointer' }}
                          >
                            Extra Body Fields
                          </label>
                          <Pill tone="neutral" size="sm">
                            {Object.keys(mCfg.extraBody || {}).length}
                          </Pill>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              addModelKV(mId);
                              setIsModelExtraBodyOpen({
                                ...isModelExtraBodyOpen,
                                [mId]: true,
                              });
                            }}
                          >
                            <Plus size={14} />
                          </Button>
                        </div>
                        {isModelExtraBodyOpen[mId] && (
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              padding: '8px',
                              borderTop: '1px solid var(--border)',
                              background: 'var(--background)',
                            }}
                          >
                            {Object.entries(mCfg.extraBody || {}).length === 0 && (
                              <div className="text-[11px] text-foreground-muted italic">
                                No extra body fields configured.
                              </div>
                            )}
                            {Object.entries(mCfg.extraBody || {}).map(([key, val], idx) => (
                              <div key={idx} style={{ display: 'flex', gap: '6px' }}>
                                <Input
                                  placeholder="Field Name"
                                  value={key}
                                  onChange={(e) => updateModelKV(mId, key, e.target.value, val)}
                                  style={{ flex: 1 }}
                                />
                                <Input
                                  placeholder="Value"
                                  value={
                                    typeof val === 'object' ? JSON.stringify(val) : String(val)
                                  }
                                  onChange={(e) => {
                                    const rawValue = e.target.value;
                                    let parsedValue;
                                    try {
                                      parsedValue = JSON.parse(rawValue);
                                    } catch {
                                      parsedValue = rawValue;
                                    }
                                    updateModelKV(mId, key, key, parsedValue);
                                  }}
                                  style={{ flex: 1 }}
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeModelKV(mId, key)}
                                  style={{ padding: '4px' }}
                                >
                                  <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus size={14} />}
                onClick={addModel}
              >
                Add Model Mapping
              </Button>
            </div>
          </Section>
        </div>
      </Modal>

      {/* Fetch Models Modal */}
      <Dialog
        open={isFetchModelsModalOpen}
        onOpenChange={(open) => !open && setIsFetchModelsModalOpen(false)}
      >
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Fetch models from provider</DialogTitle>
            <DialogDescription>
              Pull a list of available models from the provider's API and pick which ones to
              register.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="Models endpoint URL"
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
                onClick={handleFetchModels}
                isLoading={isFetchingModels}
                leftIcon={<Download size={16} />}
              >
                Fetch
              </Button>
            </div>

            {fetchError && (
              <div className="rounded-md border border-danger/40 bg-danger-subtle p-3 text-xs text-danger">
                {fetchError}
              </div>
            )}

            {fetchedModels.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-medium text-foreground-muted">
                    Available models ({fetchedModels.length})
                  </label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedModelIds(new Set(fetchedModels.map((m) => m.id)))}
                    >
                      Select all
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedModelIds(new Set())}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="max-h-[400px] overflow-y-auto rounded-md border border-border bg-background">
                  {fetchedModels.map((model) => {
                    const contextLengthK = model.context_length
                      ? `${(model.context_length / 1000).toFixed(0)}K`
                      : null;
                    const isSelected = selectedModelIds.has(model.id);

                    return (
                      <div
                        key={model.id}
                        onClick={() => toggleModelSelection(model.id)}
                        className={cn(
                          'cursor-pointer border-b border-border p-3 transition-colors hover:bg-surface-elevated last:border-b-0',
                          isSelected && 'bg-surface-elevated'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleModelSelection(model.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-0.5 cursor-pointer"
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
                              <div className="mb-0.5 text-xs text-foreground-muted">
                                {model.name}
                              </div>
                            )}
                            {model.description && (
                              <div className="mt-1 text-[11px] leading-relaxed text-foreground-muted">
                                {model.description.length > 150
                                  ? `${model.description.substring(0, 150)}…`
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
              <div className="px-8 py-8 text-center text-xs italic text-foreground-muted">
                {isOAuthMode
                  ? 'Click Fetch to load known OAuth models'
                  : 'Enter a URL and click Fetch to load available models'}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsFetchModelsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSelectedModels} disabled={selectedModelIds.size === 0}>
              Add {selectedModelIds.size} Model
              {selectedModelIds.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteModalProvider}
        onOpenChange={(open) => !open && setDeleteModalProvider(null)}
      >
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>
              Delete provider:{' '}
              <code className="font-mono text-foreground">
                {deleteModalProvider?.name || deleteModalProvider?.id || ''}
              </code>
            </DialogTitle>
            <DialogDescription>
              Choose how to delete this provider. The action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-md border border-border p-4">
              <div className="text-base font-semibold text-danger">Delete provider (cascade)</div>
              <div className="text-xs text-foreground-muted">
                Removes this provider AND deletes all model alias targets that reference it.
              </div>
              {affectedAliases.length > 0 ? (
                <div className="text-xs">
                  <div className="mb-1 font-medium text-foreground">
                    Affects {affectedAliases.length} model alias(es):
                  </div>
                  <ul className="list-disc pl-4 text-foreground-muted">
                    {affectedAliases.map((a) => (
                      <li key={a.aliasId}>
                        {a.aliasId} ({a.targetsCount} target(s))
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-xs italic text-foreground-muted">
                  No model aliases reference this provider.
                </div>
              )}
              <Button
                variant="danger"
                onClick={() => handleDelete(true)}
                disabled={deleteModalLoading}
                className="mt-auto"
              >
                {deleteModalLoading ? 'Deleting…' : 'Delete (cascade)'}
              </Button>
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-border p-4">
              <div className="text-base font-semibold text-foreground">Delete (retain targets)</div>
              <div className="text-xs text-foreground-muted">
                Removes only the provider. Model alias targets that reference this provider will
                remain but may cause errors.
              </div>
              {affectedAliases.length > 0 && (
                <div className="text-xs italic text-warning">
                  {affectedAliases.length} model alias(es) will have orphaned targets.
                </div>
              )}
              <Button
                variant="secondary"
                onClick={() => handleDelete(false)}
                disabled={deleteModalLoading}
                className="mt-auto"
              >
                {deleteModalLoading ? 'Deleting…' : 'Delete (retain)'}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteModalProvider(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPage>
  );
};

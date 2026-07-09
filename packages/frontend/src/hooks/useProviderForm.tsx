import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { api, type Provider, type OAuthSession, fetchQuotaCheckers } from '../lib/api';
import type { QuotaCheckerInfo } from '../types/quota';
import { formatMeterValue } from '../components/quota/MeterValue';
import {
  periodAbbrev,
  usagePercent,
  remainingValue,
  allowanceSubtext,
} from '../pages/quotas/quota-format';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../contexts/ToastContext';
import {
  useProviders,
  useSaveProvider,
  useDeleteProvider,
  useToggleProvider,
} from './queries/useProviders';
import {
  // providerFormSchema is not imported here — it's used by the schema file's own tests
  // and by toProviderPayload internally. See comment in useForm block below.
  toProviderPayload,
  PROVIDER_FORM_DEFAULTS,
  type ProviderFormValues,
} from '../pages/providers/provider-schema';

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

export const OAUTH_PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic (Claude Code Pro/Max)' },
  { value: 'github-copilot', label: 'GitHub Copilot' },
  { value: 'openai-codex', label: 'ChatGPT Plus/Pro (Codex Subscription)' },
];
// Gemini CLI / Antigravity OAuth were dropped; they are no
// longer offered as new-provider options.

const getOAuthCheckerType = (oauthProvider?: string): string | null => {
  if (!oauthProvider) return null;
  const map: Record<string, string> = {
    'openai-codex': 'openai-codex',
    anthropic: 'claude-code',
    'claude-code': 'claude-code',
    'github-copilot': 'copilot',
  };
  return map[oauthProvider] ?? null;
};

const inferProviderTypes = (apiBaseUrl?: string | Record<string, string>): string[] => {
  if (!apiBaseUrl) return ['chat'];
  if (typeof apiBaseUrl === 'string') {
    const url = apiBaseUrl.toLowerCase();
    if (url.startsWith('oauth://')) return ['oauth'];
    if (url.includes('anthropic.com')) return ['messages'];
    if (url.includes('generativelanguage.googleapis.com')) return ['gemini'];
    return ['chat'];
  }
  return Object.keys(apiBaseUrl).filter((key) => {
    const value = apiBaseUrl[key];
    return typeof value === 'string' && value.length > 0;
  });
};

export const EMPTY_PROVIDER: Provider = {
  id: '',
  name: '',
  type: [],
  apiKey: '',
  oauthProvider: '',
  oauthAccount: '',
  enabled: true,
  disableCooldown: false,
  stallCooldown: false,
  estimateTokens: false,
  useClaudeMasking: false,
  apiBaseUrl: {},
  headers: {},
  extraBody: {},
  models: {},
  modelAutosync: { enabled: false, intervalMinutes: 60 },
  adapter: [],
  timeoutMs: undefined,
  maxConcurrency: undefined,
  rawPassthrough: {
    enabled: false,
    baseUrl: '',
    auth: 'bearer',
  },
};

export interface FetchedModel {
  id: string;
  name?: string;
  context_length?: number;
  created?: number;
  object?: string;
  owned_by?: string;
  description?: string;
  pricing?: { prompt?: string; completion?: string };
}

export function useProviderForm() {
  const toast = useToast();
  const navigate = useNavigate();

  // ---------------------------------------------------------------------------
  // react-query: providers list (replaces local state + setInterval)
  // ---------------------------------------------------------------------------
  const providersQuery = useProviders();
  const providers = providersQuery.data ?? [];

  // ---------------------------------------------------------------------------
  // react-query: quota checkers + quotas
  // ---------------------------------------------------------------------------
  const quotaCheckersQuery = useQuery({
    queryKey: ['quota-checkers'],
    queryFn: () => fetchQuotaCheckers(),
    staleTime: 60_000,
  });
  const quotaCheckerTypes = quotaCheckersQuery.data?.knownTypes.map((t) => t.type) ?? [];

  const quotasQuery = useQuery<QuotaCheckerInfo[]>({
    queryKey: ['quotas'],
    queryFn: () => api.getQuotas(),
    staleTime: 60_000,
  });
  const quotas = quotasQuery.data ?? [];
  const quotasLoading = quotasQuery.isLoading;

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const saveProviderMutation = useSaveProvider();
  const deleteProviderMutation = useDeleteProvider();
  const toggleProviderMutation = useToggleProvider();

  // ---------------------------------------------------------------------------
  // rhf form — holds the full ProviderFormValues (= Provider shape)
  // ---------------------------------------------------------------------------
  // Note: zodResolver is intentionally NOT wired here. handleSave uses the existing
  // manual validation (via toProviderPayload) to preserve exact legacy behavior —
  // live zod validation could newly reject previously-valid provider configs.
  // providerFormSchema (in provider-schema.ts) and toProviderPayload are retained
  // for the payload contract and characterization tests.
  const { watch, reset } = useForm<ProviderFormValues>({
    defaultValues: PROVIDER_FORM_DEFAULTS,
  });

  // The form value IS the editing provider — sub-editors read this
  const editingProvider = watch() as unknown as Provider;

  // setEditingProvider-compatible: sub-editors call setEditingProvider({ ...editingProvider, field: value })
  // We intercept by wrapping reset(). Since all sub-editors use the object form (not function form),
  // this is safe. We cast through ProviderFormValues since Provider and ProviderFormValues are structurally identical.
  const setEditingProvider: React.Dispatch<React.SetStateAction<Provider>> = useCallback(
    (valueOrUpdater: Provider | ((prev: Provider) => Provider)) => {
      if (typeof valueOrUpdater === 'function') {
        // Function form — apply the updater to the current value
        reset((current) => {
          const currentProvider = current as unknown as Provider;
          const next = (valueOrUpdater as (prev: Provider) => Provider)(currentProvider);
          return next as unknown as ProviderFormValues;
        });
      } else {
        reset(valueOrUpdater as unknown as ProviderFormValues);
      }
    },
    [reset]
  );

  // ---------------------------------------------------------------------------
  // Modal open/close state
  // ---------------------------------------------------------------------------
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [originalId, setOriginalId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // OAuth local state (unchanged — OAuth session lifecycle stays local)
  // ---------------------------------------------------------------------------
  const [oauthSessionId, setOauthSessionId] = useState<string | null>(null);
  const [oauthSession, setOauthSession] = useState<OAuthSession | null>(null);
  const [oauthPromptValue, setOauthPromptValue] = useState('');
  const [oauthManualCode, setOauthManualCode] = useState('');
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthCredentialReady, setOauthCredentialReady] = useState(false);
  const [oauthCredentialChecking, setOauthCredentialChecking] = useState(false);

  // Accordion state
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
  const [affectedAliases, setAffectedAliases] = useState<
    { aliasId: string; targetsCount: number }[]
  >([]);

  const [testStates, setTestStates] = useState<
    Record<
      string,
      {
        loading: boolean;
        result?: 'success' | 'error';
        message?: string;
        showResult: boolean;
        showMessage?: boolean;
      }
    >
  >({});

  // ---------------------------------------------------------------------------
  // Derived from form state
  // ---------------------------------------------------------------------------
  const isOAuthMode =
    typeof editingProvider.apiBaseUrl === 'string' &&
    editingProvider.apiBaseUrl.toLowerCase().startsWith('oauth://');
  const oauthCheckerType = isOAuthMode ? getOAuthCheckerType(editingProvider.oauthProvider) : null;
  const selectableQuotaCheckerTypes = oauthCheckerType
    ? [oauthCheckerType]
    : isOAuthMode
      ? []
      : quotaCheckerTypes;
  const selectedQuotaCheckerType =
    editingProvider.quotaChecker?.type &&
    (selectableQuotaCheckerTypes.includes(editingProvider.quotaChecker.type) ||
      editingProvider.quotaChecker.type === oauthCheckerType)
      ? editingProvider.quotaChecker.type
      : '';

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

  // isSaving — derived from mutation state
  const isSaving = saveProviderMutation.isPending;

  // ---------------------------------------------------------------------------
  // Effects — OAuth credential check and session polling (unchanged)
  // ---------------------------------------------------------------------------

  // Modal close resets OAuth
  useEffect(() => {
    if (!isModalOpen) {
      resetOAuthState();
      setOauthCredentialReady(false);
      setOauthCredentialChecking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  // OAuth credential check
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
        if (!cancelled) setOauthCredentialReady(!!result.ready);
      })
      .catch(() => {
        if (!cancelled) setOauthCredentialReady(false);
      })
      .finally(() => {
        if (!cancelled) setOauthCredentialChecking(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingProvider.oauthProvider, isOAuthMode]);

  // OAuth session polling
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

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleEdit = (provider: Provider) => {
    setOriginalId(provider.id);
    // Reset the rhf form to the provider's values (deep-clone like old JSON.parse)
    reset(JSON.parse(JSON.stringify(provider)) as ProviderFormValues);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setOriginalId(null);
    reset(JSON.parse(JSON.stringify(PROVIDER_FORM_DEFAULTS)));
    setIsModalOpen(true);
  };

  const openDeleteModal = async (provider: Provider) => {
    const affected = await api.getAffectedAliases(provider.id);
    setAffectedAliases(affected);
    setDeleteModalProvider(provider);
  };

  const handleDelete = async (cascade: boolean) => {
    if (!deleteModalProvider) return;
    deleteProviderMutation.mutate(
      { providerId: deleteModalProvider.id, cascade },
      {
        onSuccess: () => setDeleteModalProvider(null),
        onError: (err: Error) => toast.error('Failed to delete provider: ' + err.message),
      }
    );
  };

  const handleSave = async () => {
    // Use editingProvider (already derived from watch() above) instead of calling watch() again.
    const formValues = editingProvider as unknown as ProviderFormValues;

    if (!formValues.id) {
      toast.error('Provider ID is required');
      return;
    }

    const result = toProviderPayload(formValues, { isOAuthMode });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    if (result.provider.rawPassthrough?.enabled) {
      if (isOAuthMode) {
        toast.error('Raw passthrough currently supports static API-key providers only');
        return;
      }
      try {
        const rawBaseUrl = new URL(result.provider.rawPassthrough.baseUrl);
        if (!['http:', 'https:'].includes(rawBaseUrl.protocol)) throw new Error();
      } catch {
        toast.error('Raw passthrough requires a valid HTTP(S) base URL');
        return;
      }
    }

    saveProviderMutation.mutate(
      { provider: result.provider, oldId: originalId || undefined },
      {
        onSuccess: () => setIsModalOpen(false),
        onError: (err: Error) => toast.error('Failed to save provider: ' + err.message),
      }
    );
  };

  const handleToggleEnabled = (provider: Provider, newState: boolean) => {
    toggleProviderMutation.mutate(
      { provider, newState },
      {
        onError: (err: Error) => toast.error('Failed to update provider status: ' + err.message),
      }
    );
  };

  const handleTestModel = async (providerId: string, modelId: string, modelType?: string) => {
    const testKey = `${providerId}-${modelId}`;
    setTestStates((prev) => ({
      ...prev,
      [testKey]: { loading: true, showResult: true, showMessage: false },
    }));
    let testApiTypes: string[] = ['chat'];
    if (modelType === 'embeddings') testApiTypes = ['embeddings'];
    else if (modelType === 'image') testApiTypes = ['images'];
    else if (modelType === 'responses') testApiTypes = ['responses'];
    else if (modelType === 'transcriptions') testApiTypes = ['transcriptions'];
    else if (modelType === 'speech') testApiTypes = ['speech'];
    try {
      const results = await Promise.all(
        testApiTypes.map((t) => api.testModel(providerId, modelId, t))
      );
      const allSuccess = results.every((r) => r.success);
      const firstError = results.find((r) => !r.success);
      const totalDuration = results.reduce((sum, r) => sum + (r.durationMs || 0), 0);
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
          showMessage: true,
        },
      }));
      setTimeout(
        () => {
          setTestStates((prev) => ({
            ...prev,
            [testKey]: { ...prev[testKey], showResult: false },
          }));
        },
        allSuccess ? 3000 : 1500
      );
      if (allSuccess) {
        setTimeout(() => {
          setTestStates((prev) => ({
            ...prev,
            [testKey]: { ...prev[testKey], showMessage: false },
          }));
        }, 3000);
      }
    } catch (e) {
      setTestStates((prev) => ({
        ...prev,
        [testKey]: {
          loading: false,
          result: 'error',
          message: String(e),
          showResult: true,
          showMessage: true,
        },
      }));
      setTimeout(() => {
        setTestStates((prev) => ({
          ...prev,
          [testKey]: { ...prev[testKey], showResult: false },
        }));
      }, 1500);
    }
  };

  const dismissTestMessage = (testKey: string) => {
    setTestStates((prev) => ({
      ...prev,
      [testKey]: { ...prev[testKey], showMessage: false },
    }));
  };

  // ---------------------------------------------------------------------------
  // OAuth handlers (unchanged from old useProviderForm)
  // ---------------------------------------------------------------------------
  const resetOAuthState = () => {
    setOauthSessionId(null);
    setOauthSession(null);
    setOauthPromptValue('');
    setOauthManualCode('');
    setOauthError(null);
    setOauthBusy(false);
  };

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
      if (['awaiting_prompt', 'awaiting_manual_code', 'awaiting_auth'].includes(session.status))
        setOauthBusy(false);
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

  // ---------------------------------------------------------------------------
  // API URL helpers (read from form state via editingProvider)
  // ---------------------------------------------------------------------------
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
      return { [inferredTypes[0] || 'chat']: editingProvider.apiBaseUrl };
    }
    return {};
  };

  const getApiUrlValue = (apiType: string) => {
    if (typeof editingProvider.apiBaseUrl === 'string') {
      const types = Array.isArray(editingProvider.type)
        ? editingProvider.type
        : [editingProvider.type];
      if (types.includes(apiType) && types.length === 1) return editingProvider.apiBaseUrl;
      return '';
    }
    return (editingProvider.apiBaseUrl as any)?.[apiType] || '';
  };

  const addApiBaseUrlEntry = () => {
    if (isOAuthMode) return;
    const currentMap = getApiBaseUrlMap();
    const nextType = KNOWN_APIS.find((t) => !(t in currentMap));
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
    if (normalizedType) updated[normalizedType] = url;
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

  const getPrimaryEntry = (): { type: string; url: string } => {
    const entries = Object.entries(getApiBaseUrlMap());
    if (entries.length === 0) return { type: 'chat', url: '' };
    const [type, url] = entries[0];
    return { type, url: typeof url === 'string' ? url : '' };
  };

  // Rebuilds the Record so the primary stays at insertion-position 0
  // even when its type is renamed. updateApiBaseUrlEntry would push the
  // renamed key to the end, which would steal the primary slot from us.
  const setPrimaryEntry = (newType: string, newUrl: string) => {
    if (isOAuthMode) return;
    const entries = Object.entries(getApiBaseUrlMap());
    const rest = entries.slice(1).filter(([k]) => k !== newType);
    const updated: Record<string, string> = { [newType]: newUrl };
    for (const [k, v] of rest) updated[k] = typeof v === 'string' ? v : '';
    setEditingProvider({
      ...editingProvider,
      apiBaseUrl: updated,
      type: inferProviderTypes(updated),
    });
  };

  // Adds an entry to the "Additional Base URLs" list (Advanced section),
  // never to the primary slot. Materializes the primary first if the map
  // is empty, so the new key appends as position 1+, not 0.
  const addAdditionalBaseUrlEntry = () => {
    if (isOAuthMode) return;
    const currentMap = getApiBaseUrlMap();
    const { type: primaryType, url: primaryUrl } = getPrimaryEntry();
    const baseMap: Record<string, string> =
      currentMap[primaryType] !== undefined
        ? { ...currentMap }
        : { [primaryType]: primaryUrl, ...currentMap };
    const nextType = KNOWN_APIS.find((apiType) => !(apiType in baseMap));
    if (!nextType) return;
    const updated = { ...baseMap, [nextType]: '' };
    setEditingProvider({
      ...editingProvider,
      apiBaseUrl: updated,
      type: inferProviderTypes(updated),
    });
    setIsApiBaseUrlsOpen(true);
  };

  // Generic KV helpers
  const addKV = (field: 'headers' | 'extraBody') => {
    const current = editingProvider[field] || {};
    setEditingProvider({ ...editingProvider, [field]: { ...current, '': '' } });
  };

  const updateKV = (field: 'headers' | 'extraBody', oldKey: string, newKey: string, value: any) => {
    const current = { ...(editingProvider[field] || {}) };
    if (oldKey !== newKey) delete current[oldKey];
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
    models[modelId] = { ...models[modelId], extraBody: { ...current, '': '' } };
    setEditingProvider({ ...editingProvider, models });
  };

  const updateModelKV = (modelId: string, oldKey: string, newKey: string, value: any) => {
    const models = { ...(editingProvider.models as Record<string, any>) };
    const current = { ...(models[modelId]?.extraBody || {}) };
    if (oldKey !== newKey) delete current[oldKey];
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

  // Model management
  const addModel = () => {
    const modelId = `model-${Date.now()}`;
    const newModels = {
      ...(typeof editingProvider.models === 'object' && !Array.isArray(editingProvider.models)
        ? editingProvider.models
        : {}),
    };
    newModels[modelId] = { pricing: { source: 'simple', input: 0, output: 0 }, access_via: [] };
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

  // Fetch models helpers
  const generateModelsUrl = (): string => {
    if (isOAuthMode) return '';
    const ollamaUrl = getApiUrlValue('ollama');
    if (ollamaUrl) return 'https://ollama.com/api/tags';
    const chatUrl = getApiUrlValue('chat');
    if (!chatUrl) return '';
    return `${chatUrl.replace(/\/chat\/completions\/?$/, '')}/models`;
  };

  const handleOpenFetchModels = () => {
    const defaultUrl = generateModelsUrl();
    setModelsUrl(defaultUrl);
    setFetchedModels([]);
    setSelectedModelIds(new Set());
    setFetchError(null);
    setIsFetchModelsModalOpen(true);
  };

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
      } catch (error) {
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
      const data = await api.fetchProviderModels(modelsUrl, editingProvider.apiKey);
      if (!data.data || !Array.isArray(data.data)) throw new Error('Invalid response format');
      setFetchedModels(
        [...data.data].sort((a: FetchedModel, b: FetchedModel) => a.id.localeCompare(b.id))
      );
      setSelectedModelIds(new Set());
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Failed to fetch models');
      setFetchedModels([]);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const toggleModelSelection = (modelId: string) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const selectAllFetchedModels = () => {
    setSelectedModelIds(new Set(fetchedModels.map((model) => model.id)));
  };

  const clearSelectedModels = () => {
    setSelectedModelIds(new Set());
  };

  const handleAddSelectedModels = () => {
    const models = {
      ...(typeof editingProvider.models === 'object' && !Array.isArray(editingProvider.models)
        ? editingProvider.models
        : {}),
    };
    fetchedModels.forEach((model) => {
      if (selectedModelIds.has(model.id) && !models[model.id]) {
        models[model.id] = { pricing: { source: 'simple', input: 0, output: 0 }, access_via: [] };
      }
    });
    setEditingProvider({ ...editingProvider, models });
    setIsFetchModelsModalOpen(false);
  };

  const validateQuotaChecker = (): string | null => {
    const quotaType = editingProvider.quotaChecker?.type;
    const options = editingProvider.quotaChecker?.options || {};
    if (!quotaType) return null;
    if (quotaType === 'naga' && (!options.apiKey || !(options.apiKey as string).trim()))
      return 'Provisioning API Key is required for Naga quota checker';
    if (quotaType === 'minimax') {
      if (!options.groupid || !(options.groupid as string).trim())
        return 'Group ID is required for MiniMax quota checker';
      if (!options.token || !(options.token as string).trim())
        return '_token cookie value is required for MiniMax quota checker';
    }
    if (quotaType === 'wisdomgate' && (!options.session || !(options.session as string).trim()))
      return 'Session cookie is required for Wisdom Gate quota checker';
    if (quotaType === 'devpass' && (!options.session || !(options.session as string).trim()))
      return 'Session cookie is required for DevPass quota checker';
    if (quotaType === 'opencode-go') {
      if (!options.workspaceId || !(options.workspaceId as string).trim())
        return 'Workspace ID is required for OpenCode Go quota checker';
      if (!options.authCookie || !(options.authCookie as string).trim())
        return 'Auth cookie is required for OpenCode Go quota checker';
    }
    if (
      quotaType === 'sakana' &&
      (!options.sessionCookie || !(options.sessionCookie as string).trim())
    )
      return 'Session cookie is required for Sakana quota checker';
    return null;
  };

  const getQuotaDisplay = (provider: Provider): React.ReactNode => {
    if (!provider.quotaChecker?.enabled) return null;
    if (quotasLoading) return <span className="text-foreground-muted text-xs">—</span>;
    const quota = quotas.find((q) => q.checkerId === provider.id);
    if (!quota?.meters?.length) return null;
    const handleQuotaClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      navigate('/quotas');
    };

    const badges: React.ReactNode[] = [];

    // Balance pills — one per balance meter, colored by its status.
    for (const meter of quota.meters) {
      if (meter.kind !== 'balance') continue;
      const value = remainingValue(meter);
      if (value === undefined) continue;
      const status =
        meter.status === 'exhausted' || meter.status === 'critical'
          ? 'error'
          : meter.status === 'warning'
            ? 'warning'
            : 'neutral';
      badges.push(
        <Badge
          key={`balance-${meter.key}`}
          status={status}
          title={meter.label}
          className="[&_.connection-dot]:hidden cursor-pointer text-[10px] py-0.5 px-2"
          onClick={handleQuotaClick}
        >
          {formatMeterValue(value, meter.unit)}
        </Badge>
      );
    }

    // Rolling-window pills — one per allowance with a numeric utilization.
    for (const meter of quota.meters) {
      if (meter.kind !== 'allowance') continue;
      const pct = usagePercent(meter);
      if (pct === null) continue;
      const rounded = Math.round(pct);
      const status = rounded >= 90 ? 'error' : rounded >= 70 ? 'warning' : 'connected';
      const tag = periodAbbrev(meter)?.replace(' rolling', '');
      badges.push(
        <Badge
          key={`allowance-${meter.key}`}
          status={status}
          title={allowanceSubtext(meter) ?? meter.label}
          className="[&_.connection-dot]:hidden cursor-pointer text-[10px] py-0.5 px-2"
          onClick={handleQuotaClick}
        >
          {tag ? `${tag} · ${rounded}%` : `${rounded}%`}
        </Badge>
      );
    }

    if (!badges.length) return null;
    if (badges.length === 1) return badges[0];
    return <div className="flex flex-wrap items-center gap-1.5">{badges}</div>;
  };

  const sortedProviders = [...providers].sort((a, b) => a.id.localeCompare(b.id));
  const quotaValidationError = validateQuotaChecker();

  return {
    // State
    providers,
    sortedProviders,
    isModalOpen,
    setIsModalOpen,
    editingProvider,
    setEditingProvider,
    originalId,
    isSaving,
    quotaCheckerTypes,
    quotas,
    quotasLoading,
    oauthSessionId,
    oauthSession,
    oauthPromptValue,
    setOauthPromptValue,
    oauthManualCode,
    setOauthManualCode,
    oauthError,
    oauthBusy,
    oauthCredentialReady,
    oauthCredentialChecking,
    oauthStatus,
    oauthIsTerminal,
    oauthStatusLabel,
    isOAuthMode,
    oauthCheckerType,
    selectableQuotaCheckerTypes,
    selectedQuotaCheckerType,
    quotaValidationError,
    // Accordion
    isModelsOpen,
    setIsModelsOpen,
    openModelIdx,
    setOpenModelIdx,
    isApiBaseUrlsOpen,
    setIsApiBaseUrlsOpen,
    isHeadersOpen,
    setIsHeadersOpen,
    isExtraBodyOpen,
    setIsExtraBodyOpen,
    isModelExtraBodyOpen,
    setIsModelExtraBodyOpen,
    isAdvancedOpen,
    setIsAdvancedOpen,
    // Fetch models
    isFetchModelsModalOpen,
    setIsFetchModelsModalOpen,
    modelsUrl,
    setModelsUrl,
    isFetchingModels,
    fetchedModels,
    selectedModelIds,
    setSelectedModelIds,
    fetchError,
    // Delete
    deleteModalProvider,
    setDeleteModalProvider,
    deleteModalLoading: deleteProviderMutation.isPending,
    affectedAliases,
    // Test
    testStates,
    dismissTestMessage,
    // Handlers
    handleEdit,
    handleAddNew,
    handleSave,
    handleDelete,
    handleToggleEnabled,
    handleTestModel,
    openDeleteModal,
    // OAuth
    handleStartOAuth,
    handleSubmitPrompt,
    handleSubmitManualCode,
    handleCancelOAuth,
    // API URLs
    getApiBaseUrlMap,
    getApiUrlValue,
    addApiBaseUrlEntry,
    updateApiBaseUrlEntry,
    removeApiBaseUrlEntry,
    getPrimaryEntry,
    setPrimaryEntry,
    addAdditionalBaseUrlEntry,
    // KV
    addKV,
    updateKV,
    removeKV,
    // Model KV
    addModelKV,
    updateModelKV,
    removeModelKV,
    // Models
    addModel,
    updateModelId,
    updateModelConfig,
    removeModel,
    // Fetch
    handleOpenFetchModels,
    handleFetchModels,
    toggleModelSelection,
    selectAllFetchedModels,
    clearSelectedModels,
    handleAddSelectedModels,
    // Quota
    getQuotaDisplay,
    // Constants
    KNOWN_APIS,
    OAUTH_PROVIDERS,
  };
}

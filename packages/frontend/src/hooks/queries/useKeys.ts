/**
 * useKeys — TanStack Query hooks for API Keys and User Quotas (Keys page).
 *
 * Covers: keys list, user-quotas list, providers list (for allowlist dropdowns),
 * aliases list (for allowlist dropdowns), and quota-status reads.
 * Standalone delete/rotate mutations.
 *
 * Create/edit form mutations are left for Phase 7.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const KEYS_KEY = ['keys'] as const;
export const KEYS_USER_QUOTAS_KEY = ['keys-user-quotas'] as const;
export const KEYS_PROVIDER_IDS_KEY = ['keys-provider-ids'] as const;
export const KEYS_ALIAS_IDS_KEY = ['keys-alias-ids'] as const;
export const KEYS_ALL_MODEL_NAMES_KEY = ['keys-all-model-names'] as const;
export const KEYS_DEFAULT_QUOTAS_KEY = ['keys-default-quotas'] as const;

// ---------------------------------------------------------------------------
// List queries
// ---------------------------------------------------------------------------

/** All API keys. */
export const useApiKeys = () =>
  useQuery({
    queryKey: KEYS_KEY,
    queryFn: () => api.getKeys(),
  });

/** User quotas (for the quota dropdown in the key form and the User Quotas page). */
export const useKeysUserQuotas = () =>
  useQuery({
    queryKey: KEYS_USER_QUOTAS_KEY,
    queryFn: () => api.getUserQuotas(),
  });

/** Enabled provider IDs (for allowlist/denylist dropdowns in the key form). */
export const useKeysProviderIds = () =>
  useQuery({
    queryKey: KEYS_PROVIDER_IDS_KEY,
    queryFn: async () => {
      const providers = await api.getProviders();
      return providers
        .filter((p) => p.enabled)
        .map((p) => p.id)
        .sort();
    },
  });

/** All alias IDs (for allowlist/denylist dropdowns in the key form). */
export const useKeysAliasIds = () =>
  useQuery({
    queryKey: KEYS_ALIAS_IDS_KEY,
    queryFn: async () => {
      const aliases = await api.getAliases();
      return aliases.map((a) => a.id).sort();
    },
  });

/**
 * Union of every model name exposed by any provider (enabled or not) — used
 * as the options list for quota-scope TagSelects (allowCustom covers models
 * not yet synced into a provider's catalog). Mirrors main Keys.tsx's
 * `allModelNames` derivation, which intentionally does NOT filter by
 * `enabled` the way `useKeysProviderIds` does.
 */
export const useKeysAllModelNames = () =>
  useQuery({
    queryKey: KEYS_ALL_MODEL_NAMES_KEY,
    queryFn: async () => {
      const providers = await api.getProviders();
      return Array.from(
        new Set(
          providers.flatMap((p) =>
            p.models && !Array.isArray(p.models) ? Object.keys(p.models) : []
          )
        )
      ).sort();
    },
  });

/** System-wide fallback quota names, applied to any key with no `quotas` of
 * its own. Read side never surfaces an error toast (mirrors main's
 * `api.getDefaultQuotas().catch(() => [])` at the loadData call site). */
export const useDefaultQuotaNames = () =>
  useQuery({
    queryKey: KEYS_DEFAULT_QUOTAS_KEY,
    queryFn: () => api.getDefaultQuotas().catch(() => [] as string[]),
  });

// ---------------------------------------------------------------------------
// Standalone mutations — delete key, delete quota, clear quota, recompute
// quota, save default quotas
// ---------------------------------------------------------------------------

/** Delete a single API key by name. */
export const useDeleteKey = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();

  return useMutation({
    mutationFn: (keyName: string) => api.deleteKey(keyName),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS_KEY }),
    onError: (err: Error) => toastError(`Failed to delete key: ${err.message}`),
  });
};

/** Disable a single API key by name — immediate, irreversible via the UI
 * (mirrors the confirm copy in Keys.tsx). Distinct from expiry: a disabled
 * key stops working right away, regardless of any `expiresAt`. */
export const useDisableKey = () => {
  const qc = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();

  return useMutation({
    mutationFn: (keyName: string) => api.disableKey(keyName),
    onSuccess: (_data, keyName) => {
      qc.invalidateQueries({ queryKey: KEYS_KEY });
      toastSuccess(`Key '${keyName}' disabled`);
    },
    onError: (err: Error) => toastError(`Failed to disable key: ${err.message}`),
  });
};

/** Delete a user quota by name. */
export const useDeleteKeysUserQuota = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();

  return useMutation({
    mutationFn: (name: string) => api.deleteUserQuota(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS_USER_QUOTAS_KEY }),
    onError: (err: Error) => toastError(`Failed to delete quota: ${err.message}`),
  });
};

/** Clear (reset) quota usage for a key. Omit `quotaName` to clear every
 * quota currently attached to the key (mirrors `api.clearQuota`'s optional
 * second argument). */
export const useClearQuota = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();

  return useMutation({
    mutationFn: ({ keyName, quotaName }: { keyName: string; quotaName?: string }) =>
      api.clearQuota(keyName, quotaName),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS_KEY }),
    onError: (err: Error) => toastError(`Failed to clear quota: ${err.message}`),
  });
};

/** Recompute a key's quota usage from historical request logs. Rejected by
 * the backend for rolling requests/tokens defs — see `isLeakyRollingDef` in
 * Keys.tsx, which disables the affordance before this is ever called. */
export const useRecomputeQuota = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();

  return useMutation({
    mutationFn: ({ keyName, quotaName }: { keyName: string; quotaName: string }) =>
      api.recomputeQuota(keyName, quotaName),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS_KEY }),
    onError: (err: Error) => toastError(err.message || 'Failed to recompute quota'),
  });
};

/** System-wide default-quotas list, with optimistic update + rollback on
 * error (mirrors useMcp.ts's useToggleMcpEnabled pattern). */
export const useSetDefaultQuotas = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();

  return useMutation({
    mutationFn: (names: string[]) => api.setDefaultQuotas(names),
    onMutate: async (names) => {
      await qc.cancelQueries({ queryKey: KEYS_DEFAULT_QUOTAS_KEY });
      const previous = qc.getQueryData<string[]>(KEYS_DEFAULT_QUOTAS_KEY);
      qc.setQueryData(KEYS_DEFAULT_QUOTAS_KEY, names);
      return { previous };
    },
    onError: (err: Error, _names, ctx) => {
      qc.setQueryData(KEYS_DEFAULT_QUOTAS_KEY, ctx?.previous);
      toastError(`Failed to save default quotas: ${err.message}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS_DEFAULT_QUOTAS_KEY }),
  });
};

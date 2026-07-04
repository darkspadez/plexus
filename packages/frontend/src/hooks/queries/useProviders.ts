/**
 * useProviders — TanStack Query hooks for the Providers page.
 *
 * Data layer for Phase 7c. Follows the canonical pattern from useUserQuotas.ts:
 *   - Single query-key constant (PROVIDERS_KEY) drives cache invalidation.
 *   - List query via useProviders(); polled every 10 s (matching old setInterval).
 *   - Four mutations: saveProvider, deleteProvider, toggleEnabled, fetchModels.
 *   - Errors surfaced through useToast() — no raw console.error leaking to users.
 *
 * DO NOT change api.ts methods — this hook calls them unchanged.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Provider } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

/** Shared query-key — import this in any component that needs to invalidate. */
export const PROVIDERS_KEY = ['providers'] as const;

// ---------------------------------------------------------------------------
// List query
// ---------------------------------------------------------------------------

export const useProviders = () =>
  useQuery<Provider[]>({
    queryKey: PROVIDERS_KEY,
    queryFn: () => api.getProviders(),
    // Poll every 10 seconds — matches the old setInterval(loadData, 10000)
    refetchInterval: 10_000,
  });

// ---------------------------------------------------------------------------
// Save mutation (create OR update — api.saveProvider handles both)
// ---------------------------------------------------------------------------

export const useSaveProvider = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, oldId }: { provider: Provider; oldId?: string }) =>
      api.saveProvider(provider, oldId),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROVIDERS_KEY }),
    // onError intentionally omitted — callers pass per-call onError to .mutate()
    // to avoid double-toast (one here + one in the call site).
  });
};

// ---------------------------------------------------------------------------
// Delete mutation
// ---------------------------------------------------------------------------

export const useDeleteProvider = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ providerId, cascade }: { providerId: string; cascade?: boolean }) =>
      api.deleteProvider(providerId, cascade),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROVIDERS_KEY }),
    // onError intentionally omitted — callers pass per-call onError to .mutate()
    // to avoid double-toast (one here + one in the call site).
  });
};

// ---------------------------------------------------------------------------
// Toggle-enabled mutation — optimistic update like the old handleToggleEnabled
// ---------------------------------------------------------------------------

export const useToggleProvider = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();

  return useMutation({
    mutationFn: ({ provider, newState }: { provider: Provider; newState: boolean }) =>
      api.saveProvider({ ...provider, enabled: newState }, provider.id),
    onMutate: async ({ provider, newState }) => {
      // Optimistic update — same as old: setProviders(providers.map(...))
      await qc.cancelQueries({ queryKey: PROVIDERS_KEY });
      const previous = qc.getQueryData<Provider[]>(PROVIDERS_KEY);
      qc.setQueryData<Provider[]>(PROVIDERS_KEY, (old) =>
        old ? old.map((p) => (p.id === provider.id ? { ...p, enabled: newState } : p)) : old
      );
      return { previous };
    },
    onError: (err: Error, _vars, context) => {
      // Roll back optimistic update
      if (context?.previous) {
        qc.setQueryData<Provider[]>(PROVIDERS_KEY, context.previous);
      }
      toastError(`Failed to update provider status: ${err.message}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: PROVIDERS_KEY }),
  });
};

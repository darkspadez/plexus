/**
 * useAliases — TanStack Query hooks for the Models page aliases data.
 *
 * Data layer for Phase 7d. Follows the canonical pattern from useProviders.ts:
 *   - Single query-key constant (ALIASES_KEY) drives cache invalidation.
 *   - List query via useAliases(); polled every 10 s (matching old setInterval).
 *   - Mutations: saveAlias, deleteAlias, deleteAllAliases.
 *   - Errors surfaced through useToast() — no raw console.error leaking to users.
 *
 * DO NOT change api.ts methods — this hook calls them unchanged.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Alias, type Model, type Cooldown } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

/** Shared query-key — import this in any component that needs to invalidate. */
export const ALIASES_KEY = ['aliases'] as const;

// ---------------------------------------------------------------------------
// List query — aliases + providers + models + cooldowns are fetched together
// in the old loadData(). We split them into individual queries so the cache
// can invalidate granularly on mutations.
// ---------------------------------------------------------------------------

export const useAliases = () =>
  useQuery<Alias[]>({
    queryKey: ALIASES_KEY,
    queryFn: () => api.getAliases(),
    // Poll every 10 seconds — matches the old setInterval(loadData, 10000)
    refetchInterval: 10_000,
  });

// ---------------------------------------------------------------------------
// Save mutation (create OR update — api.saveAlias handles both)
// ---------------------------------------------------------------------------

export const useSaveAlias = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ alias, oldId }: { alias: Alias; oldId?: string }) => api.saveAlias(alias, oldId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ALIASES_KEY }),
    // onError intentionally omitted — callers pass per-call onError to .mutate()
    // to avoid double-toast.
  });
};

// ---------------------------------------------------------------------------
// Delete mutation
// ---------------------------------------------------------------------------

export const useDeleteAlias = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ aliasId }: { aliasId: string }) => api.deleteAlias(aliasId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ALIASES_KEY }),
    // onError intentionally omitted — callers pass per-call onError.
  });
};

// ---------------------------------------------------------------------------
// Delete-all mutation
// ---------------------------------------------------------------------------

export const useDeleteAllAliases = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();

  return useMutation({
    mutationFn: () => api.deleteAllAliases(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ALIASES_KEY }),
    onError: (err: Error) => toastError(`Failed to delete all aliases: ${err.message}`),
  });
};

// ---------------------------------------------------------------------------
// Toggle-target mutation — optimistic update for instant UI feedback
// ---------------------------------------------------------------------------

export const useToggleAliasTarget = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();

  return useMutation({
    mutationFn: ({
      alias,
      groupIndex,
      targetIndex,
      newState,
    }: {
      alias: Alias;
      groupIndex: number;
      targetIndex: number;
      newState: boolean;
    }) => {
      const updatedAlias = JSON.parse(JSON.stringify(alias)) as Alias;
      if (updatedAlias.target_groups[groupIndex]?.targets[targetIndex]) {
        updatedAlias.target_groups[groupIndex].targets[targetIndex].enabled = newState;
      }
      return api.saveAlias(updatedAlias, alias.id);
    },
    onMutate: async ({ alias, groupIndex, targetIndex, newState }) => {
      // Optimistic update — same as old: setAliases(prev => prev.map(...))
      await qc.cancelQueries({ queryKey: ALIASES_KEY });
      const previous = qc.getQueryData<Alias[]>(ALIASES_KEY);
      qc.setQueryData<Alias[]>(ALIASES_KEY, (old) =>
        old
          ? old.map((a) => {
              if (a.id !== alias.id) return a;
              const updated = JSON.parse(JSON.stringify(a)) as Alias;
              if (updated.target_groups[groupIndex]?.targets[targetIndex]) {
                updated.target_groups[groupIndex].targets[targetIndex].enabled = newState;
              }
              return updated;
            })
          : old
      );
      return { previous };
    },
    onError: (err: Error, _vars, context) => {
      // Roll back optimistic update
      if (context?.previous) {
        qc.setQueryData<Alias[]>(ALIASES_KEY, context.previous);
      }
      toastError(`Failed to update target status: ${err.message}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ALIASES_KEY }),
  });
};

// ---------------------------------------------------------------------------
// Update-alias mutation — optimistic full-alias replace (inline expand editor)
// Used by the Models page's per-row inline editor (routing aliases + mappings).
// Saves immediately per change with optimistic cache update + rollback.
// ---------------------------------------------------------------------------

export const useUpdateAlias = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();

  return useMutation({
    mutationFn: ({ alias }: { alias: Alias }) => api.saveAlias(alias, alias.id),
    onMutate: async ({ alias }) => {
      await qc.cancelQueries({ queryKey: ALIASES_KEY });
      const previous = qc.getQueryData<Alias[]>(ALIASES_KEY);
      qc.setQueryData<Alias[]>(ALIASES_KEY, (old) =>
        old ? old.map((a) => (a.id === alias.id ? alias : a)) : old
      );
      return { previous };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) qc.setQueryData<Alias[]>(ALIASES_KEY, context.previous);
      toastError(`Failed to update alias: ${err.message}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ALIASES_KEY }),
  });
};

// ---------------------------------------------------------------------------
// Available models query (provider models list, for the target editor)
// ---------------------------------------------------------------------------

export const AVAILABLE_MODELS_KEY = ['available-models'] as const;

export const useAvailableModels = () =>
  useQuery<Model[]>({
    queryKey: AVAILABLE_MODELS_KEY,
    queryFn: () => api.getModels(),
    refetchInterval: 10_000,
  });

// ---------------------------------------------------------------------------
// Cooldowns query
// ---------------------------------------------------------------------------

export const COOLDOWNS_KEY = ['cooldowns'] as const;

export const useCooldowns = () =>
  useQuery<Cooldown[]>({
    queryKey: COOLDOWNS_KEY,
    queryFn: () => api.getCooldowns(),
    refetchInterval: 10_000,
  });

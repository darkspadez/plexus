/**
 * useUserQuotas — TanStack Query hooks for User Quotas.
 *
 * Canonical data-layer pattern for Phase 4 (reference for Phases 5–7):
 *   - Single query-key constant (KEY) drives all cache invalidation.
 *   - List query via useUserQuotas(); individual queries via getUserQuota() on demand.
 *   - Three mutations (save, delete) that all invalidate KEY on success.
 *   - Errors surfaced through useToast() — no raw console.error leaking to users.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type UserQuota } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

/** Shared query-key — import this in any component that needs to invalidate. */
export const USER_QUOTAS_KEY = ['user-quotas'] as const;

// ---------------------------------------------------------------------------
// List query
// ---------------------------------------------------------------------------

export const useUserQuotas = () =>
  useQuery<Record<string, UserQuota>>({
    queryKey: USER_QUOTAS_KEY,
    queryFn: () => api.getUserQuotas(),
    // Quota counts change frequently — most resource hooks should omit refetchInterval.
    refetchInterval: 60_000,
  });

// ---------------------------------------------------------------------------
// Save mutation (create OR update — single endpoint, PUT semantics)
// Handles rename: delete old name then save under new name.
// ---------------------------------------------------------------------------

export const useSaveUserQuota = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();

  return useMutation({
    mutationFn: async ({
      name,
      quota,
      oldName,
    }: {
      name: string;
      quota: UserQuota;
      oldName?: string;
    }) => {
      if (oldName && oldName !== name) {
        await api.deleteUserQuota(oldName);
      }
      await api.saveUserQuota(name, quota);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USER_QUOTAS_KEY }),
    onError: (err: Error) => toastError(`Failed to save quota: ${err.message}`),
  });
};

// ---------------------------------------------------------------------------
// Delete mutation
// ---------------------------------------------------------------------------

export const useDeleteUserQuota = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();

  return useMutation({
    mutationFn: (name: string) => api.deleteUserQuota(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: USER_QUOTAS_KEY }),
    onError: (err: Error) => toastError(`Failed to delete quota: ${err.message}`),
  });
};

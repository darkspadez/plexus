import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fetchQuotaCheckers } from '../../lib/api';
import { countFailedChecks } from '../../lib/quota';
import { useToast } from '../../contexts/ToastContext';

export const QUOTA_CHECKERS_KEY = ['quota-checkers'] as const;

export const useQuotaCheckers = (options?: { refetchInterval?: number | false }) =>
  useQuery({
    queryKey: QUOTA_CHECKERS_KEY,
    queryFn: () => fetchQuotaCheckers(),
    refetchInterval: options?.refetchInterval,
  });

export const useTriggerQuotaCheck = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();
  return useMutation({
    mutationFn: async (checkerId: string) => {
      // api.triggerQuotaCheck never rejects -- it catches internally and
      // resolves null on failure. Throw here so onError (and thus the toast
      // below) actually fires instead of being dead code.
      const result = await api.triggerQuotaCheck(checkerId);
      if (result == null) throw new Error('check returned no result');
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUOTA_CHECKERS_KEY }),
    onError: (err: Error) => toastError(`Failed to trigger quota check: ${err.message}`),
  });
};

/**
 * Fan out a force re-check to every given checker in parallel. Deliberately
 * bypasses `useTriggerQuotaCheck` -- reusing its `mutate` per id would fire
 * one invalidation (and refetch) per checker plus a toast per failure.
 * Instead this settles the whole batch, invalidates exactly once, and shows
 * at most one aggregated toast.
 */
export const useTriggerAllQuotaChecks = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();
  return useMutation({
    mutationFn: async (checkerIds: string[]) => {
      const results = await Promise.allSettled(checkerIds.map((id) => api.triggerQuotaCheck(id)));
      return { total: checkerIds.length, failed: countFailedChecks(results) };
    },
    onSuccess: ({ total, failed }) => {
      if (failed > 0) toastError(`${failed} of ${total} quota checks failed`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUOTA_CHECKERS_KEY }),
  });
};

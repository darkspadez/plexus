import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fetchQuotaCheckers } from '../../lib/api';
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
    mutationFn: (checkerId: string) => api.triggerQuotaCheck(checkerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUOTA_CHECKERS_KEY }),
    onError: (err: Error) => toastError(`Failed to trigger quota check: ${err.message}`),
  });
};

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { QuotaCheckerInfo } from '../../types/quota';

const QUOTAS_KEY = ['quotas'] as const;

export const useQuotas = () =>
  useQuery<QuotaCheckerInfo[]>({
    queryKey: QUOTAS_KEY,
    queryFn: () => api.getQuotas(),
    refetchInterval: 30_000,
  });

export const useTriggerQuotaCheck = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (checkerId: string) => api.triggerQuotaCheck(checkerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUOTAS_KEY });
    },
  });
};

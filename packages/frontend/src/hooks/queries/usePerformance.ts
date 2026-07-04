import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ProviderPerformanceData } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

export const PROVIDER_PERFORMANCE_KEY = ['provider-performance'] as const;

export const useProviderPerformance = () =>
  useQuery<ProviderPerformanceData[]>({
    queryKey: PROVIDER_PERFORMANCE_KEY,
    queryFn: () => api.getProviderPerformance(),
  });

export const useClearProviderPerformance = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();
  return useMutation({
    mutationFn: async (model: string) => {
      const ok = await api.clearProviderPerformance(model);
      if (!ok) throw new Error('Clear provider performance failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PROVIDER_PERFORMANCE_KEY }),
    onError: (err: Error) => toastError(`Failed to clear performance data: ${err.message}`),
  });
};

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ConcurrencyData, type UsageRecord } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { COOLDOWNS_KEY } from './useAliases';

// Live logs for LiveTab
export const LIVE_LOGS_KEY = ['live-logs'] as const;
// Concurrency data
export const CONCURRENCY_KEY = ['concurrency'] as const;

// Fetches logs list for live tab
export const useLiveLogs = (options: {
  limit: number;
  enabled?: boolean;
  refetchInterval?: number | false;
}) => {
  return useQuery<UsageRecord[]>({
    queryKey: [...LIVE_LOGS_KEY, options.limit],
    queryFn: async () => {
      const res = await api.getLogs(options.limit, 0);
      return res.data || [];
    },
    refetchInterval: options.refetchInterval,
    enabled: options.enabled !== false,
  });
};

// Concurrency data
export const useConcurrencyData = (options?: {
  enabled?: boolean;
  refetchInterval?: number | false;
}) => {
  return useQuery<ConcurrencyData[]>({
    queryKey: CONCURRENCY_KEY,
    queryFn: () => api.getConcurrencyData('hour', 'live'),
    refetchInterval: options?.refetchInterval,
    enabled: options?.enabled !== false,
  });
};

// Mutation: clear ALL cooldowns
export const useClearCooldowns = () => {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  return useMutation({
    mutationFn: () => api.clearCooldown(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COOLDOWNS_KEY });
      success('All cooldowns cleared');
    },
    onError: (err: Error) => toastError(`Failed to clear cooldowns: ${err.message}`),
  });
};

// Mutation: clear single cooldown
export const useClearSingleCooldown = () => {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  return useMutation({
    mutationFn: ({ provider, model }: { provider: string; model?: string }) =>
      api.clearCooldown(provider, model),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: COOLDOWNS_KEY });
      success(`Cooldown cleared for ${variables.provider}`);
    },
    onError: (err: Error) => toastError(`Failed to clear cooldown: ${err.message}`),
  });
};

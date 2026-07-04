import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type DashboardData, type ConcurrencyData, type UsageRecord } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

// Dashboard live data (stats + cooldowns + todayMetrics)
export const DASHBOARD_DATA_KEY = ['dashboard-data'] as const;
// Live logs for LiveTab
export const LIVE_LOGS_KEY = ['live-logs'] as const;
// Concurrency data
export const CONCURRENCY_KEY = ['concurrency'] as const;

// Fetches dashboard data for a given range (used by LiveTab with 'day')
export const useDashboardData = (options?: {
  range?: 'hour' | 'day' | 'week' | 'month';
  enabled?: boolean;
  refetchInterval?: number | false;
}) => {
  const range = options?.range ?? 'day';
  return useQuery<DashboardData>({
    queryKey: [...DASHBOARD_DATA_KEY, range],
    queryFn: () => api.getDashboardData(range, false),
    refetchInterval: options?.refetchInterval,
    enabled: options?.enabled !== false,
  });
};

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
  const { error: toastError } = useToast();
  return useMutation({
    mutationFn: () => api.clearCooldown(),
    onSuccess: () => qc.invalidateQueries({ queryKey: DASHBOARD_DATA_KEY }),
    onError: (err: Error) => toastError(`Failed to clear cooldowns: ${err.message}`),
  });
};

// Mutation: clear single cooldown
export const useClearSingleCooldown = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();
  return useMutation({
    mutationFn: ({ provider, model }: { provider: string; model?: string }) =>
      api.clearCooldown(provider, model),
    onSuccess: () => qc.invalidateQueries({ queryKey: DASHBOARD_DATA_KEY }),
    onError: (err: Error) => toastError(`Failed to clear cooldown: ${err.message}`),
  });
};

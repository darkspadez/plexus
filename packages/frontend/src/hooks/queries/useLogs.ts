import { useQuery } from '@tanstack/react-query';
import { api, type UsageRecord } from '../../lib/api';

export type LogTimeWindow = '15m' | '1h' | '24h' | '7d';

export interface LogsFilters {
  window: LogTimeWindow;
  apiKey?: string;
  provider?: string;
  modelAlias?: string;
}

const WINDOW_MS: Record<LogTimeWindow, number> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
};

const buildStartDate = (window: LogTimeWindow): string =>
  new Date(Date.now() - WINDOW_MS[window]).toISOString();

export const useLogs = (filters: LogsFilters, page: number, pageSize = 20) => {
  const offset = page * pageSize;
  return useQuery<{ data: UsageRecord[]; total: number }>({
    queryKey: ['logs', filters, page, pageSize],
    queryFn: async () => {
      const startDate = buildStartDate(filters.window);
      const apiFilters: Record<string, string> = { startDate };
      if (filters.apiKey) apiFilters.apiKey = filters.apiKey;
      if (filters.provider) apiFilters.provider = filters.provider;
      if (filters.modelAlias) apiFilters.incomingModelAlias = filters.modelAlias;
      return api.getLogs(pageSize, offset, apiFilters, 'date', 'desc');
    },
    refetchInterval: 5_000,
  });
};

export const useLogDetail = (requestId: string | null) =>
  useQuery({
    queryKey: ['logs', 'detail', requestId],
    queryFn: () => (requestId ? api.getDebugLogDetail(requestId) : Promise.resolve(null)),
    enabled: !!requestId,
  });

import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type TimeWindow = '24h' | '7d' | '30d';

const RANGE_BY_WINDOW: Record<TimeWindow, 'day' | 'week' | 'month'> = {
  '24h': 'day',
  '7d': 'week',
  '30d': 'month',
};

export const useDashboardSummary = (window: TimeWindow) => {
  const range = RANGE_BY_WINDOW[window];
  return useQuery({
    queryKey: ['dashboard', 'summary', range],
    queryFn: () => api.getDashboardData(range, true),
    refetchInterval: 15_000,
  });
};

/**
 * Recent errored requests (last 10) — feeds the dashboard's Recent Errors panel.
 * Pulls from /usage with responseStatus filtering on 4xx/5xx.
 */
export const useRecentErrors = (limit = 5) =>
  useQuery({
    queryKey: ['dashboard', 'recent-errors', limit],
    queryFn: async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const res = await api.getUsageRecords({
        limit: limit * 4,
        startDate,
        fields: [
          'requestId',
          'startTime',
          'responseStatus',
          'provider',
          'selectedModelName',
          'incomingModelAlias',
          'durationMs',
          'finishReason',
        ],
        cache: true,
      });
      const records = (res.data || []).filter((r) => {
        const code = parseInt(r.responseStatus ?? '', 10);
        return Number.isFinite(code) && code >= 400;
      });
      return records.slice(0, limit);
    },
    refetchInterval: 30_000,
  });

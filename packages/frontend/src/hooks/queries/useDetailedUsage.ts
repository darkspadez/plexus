import { useQuery } from '@tanstack/react-query';
import { api, type UsageRecord } from '../../lib/api';

export const DETAILED_USAGE_LOGS_KEY = ['detailed-usage-logs'] as const;
export const DETAILED_SUMMARY_KEY = ['detailed-summary'] as const;

export const useDetailedUsageLogs = (options: {
  startDate?: string;
  endDate?: string;
  enabled?: boolean;
  refetchInterval?: number | false;
}) =>
  useQuery<UsageRecord[]>({
    queryKey: [...DETAILED_USAGE_LOGS_KEY, options.startDate, options.endDate],
    queryFn: async () => {
      const res = await api.getLogs(100, 0, {
        startDate: options.startDate,
        endDate: options.endDate,
      });
      return res.data || [];
    },
    refetchInterval: options.refetchInterval,
    enabled: options.enabled !== false,
  });

export const useDetailedSummaryData = (options: {
  timeRange: 'live' | 'hour' | 'day' | 'week' | 'month' | 'custom';
  startDate?: string;
  endDate?: string;
  enabled?: boolean;
  refetchInterval?: number | false;
}) =>
  useQuery({
    queryKey: [...DETAILED_SUMMARY_KEY, options.timeRange, options.startDate, options.endDate],
    queryFn: () =>
      api.getSummaryData(
        options.timeRange === 'live'
          ? 'hour'
          : options.timeRange === 'custom'
            ? 'custom'
            : options.timeRange,
        true,
        options.startDate,
        options.endDate
      ),
    refetchInterval: options.refetchInterval,
    enabled: options.enabled !== false,
  });

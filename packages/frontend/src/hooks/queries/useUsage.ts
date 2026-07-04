import { useQuery } from '@tanstack/react-query';
import { api, type UsageData, type PieChartDataPoint, type ConcurrencyData } from '../../lib/api';

export const SUMMARY_DATA_KEY = ['summary-data'] as const;
export const USAGE_BY_MODEL_KEY = ['usage-by-model'] as const;
export const USAGE_BY_PROVIDER_KEY = ['usage-by-provider'] as const;
export const USAGE_BY_MODEL_OVERALL_KEY = ['usage-by-model-overall'] as const;
export const USAGE_BY_PROVIDER_OVERALL_KEY = ['usage-by-provider-overall'] as const;
export const USAGE_BY_KEY_KEY = ['usage-by-key'] as const;
export const CONCURRENCY_BY_PROVIDER_KEY = ['concurrency-by-provider'] as const;
export const CONCURRENCY_BY_MODEL_KEY = ['concurrency-by-model'] as const;
export const ENERGY_SUMMARY_KEY = ['energy-summary'] as const;
export const USAGE_SUMMARY_KEY = ['usage-summary'] as const;

type TimeRange = 'hour' | 'day' | 'week' | 'month' | 'custom';

export const useSummaryData = (
  timeRange: TimeRange,
  options?: { startDate?: string; endDate?: string }
) =>
  useQuery<UsageData[]>({
    queryKey: [...SUMMARY_DATA_KEY, timeRange, options?.startDate, options?.endDate],
    queryFn: () =>
      api.getSummaryData(
        timeRange === 'custom' ? 'custom' : timeRange,
        true,
        options?.startDate,
        options?.endDate
      ),
  });

export const useUsageByModel = (
  timeRange: TimeRange,
  options?: { startDate?: string; endDate?: string }
) =>
  useQuery<PieChartDataPoint[]>({
    queryKey: [...USAGE_BY_MODEL_KEY, timeRange, options?.startDate, options?.endDate],
    queryFn: () => api.getUsageByModel(timeRange, true, options?.startDate, options?.endDate),
  });

export const useUsageByProvider = (
  timeRange: TimeRange,
  options?: { startDate?: string; endDate?: string }
) =>
  useQuery<PieChartDataPoint[]>({
    queryKey: [...USAGE_BY_PROVIDER_KEY, timeRange, options?.startDate, options?.endDate],
    queryFn: () => api.getUsageByProvider(timeRange, true, options?.startDate, options?.endDate),
  });

export const useUsageByKey = (
  timeRange: TimeRange,
  options?: { startDate?: string; endDate?: string }
) =>
  useQuery<PieChartDataPoint[]>({
    queryKey: [...USAGE_BY_KEY_KEY, timeRange, options?.startDate, options?.endDate],
    queryFn: () => api.getUsageByKey(timeRange, true, options?.startDate, options?.endDate),
  });

export const useConcurrencyByProvider = (
  timeRange: TimeRange,
  options?: { startDate?: string; endDate?: string }
) =>
  useQuery<ConcurrencyData[]>({
    queryKey: [...CONCURRENCY_BY_PROVIDER_KEY, timeRange, options?.startDate, options?.endDate],
    queryFn: () =>
      api.getConcurrencyData(
        timeRange,
        'timeline',
        'provider',
        options?.startDate,
        options?.endDate
      ),
  });

export const useConcurrencyByModel = (
  timeRange: TimeRange,
  options?: { startDate?: string; endDate?: string }
) =>
  useQuery<ConcurrencyData[]>({
    queryKey: [...CONCURRENCY_BY_MODEL_KEY, timeRange, options?.startDate, options?.endDate],
    queryFn: () =>
      api.getConcurrencyData(timeRange, 'timeline', 'model', options?.startDate, options?.endDate),
  });

export const useEnergySummary = (
  timeRange: TimeRange,
  options?: { startDate?: string; endDate?: string }
) =>
  useQuery<{ totalKwhUsed: number } | null>({
    queryKey: [...ENERGY_SUMMARY_KEY, timeRange, options?.startDate, options?.endDate],
    queryFn: () =>
      api.getEnergySummary(
        timeRange === 'custom' ? 'custom' : timeRange,
        true,
        options?.startDate,
        options?.endDate
      ),
  });

export const useUsageSummary = (timeRange: 'hour' | 'day' | 'week' | 'month') =>
  useQuery({
    queryKey: [...USAGE_SUMMARY_KEY, timeRange],
    queryFn: () => api.getUsageSummary(timeRange, true),
  });

export const useUsageByProviderForOverall = (timeRange: 'hour' | 'day' | 'week' | 'month') =>
  useQuery<PieChartDataPoint[]>({
    queryKey: [...USAGE_BY_PROVIDER_OVERALL_KEY, timeRange],
    queryFn: () => api.getUsageByProvider(timeRange, true),
  });

export const useUsageByModelForOverall = (timeRange: 'hour' | 'day' | 'week' | 'month') =>
  useQuery<PieChartDataPoint[]>({
    queryKey: [...USAGE_BY_MODEL_OVERALL_KEY, timeRange],
    queryFn: () => api.getUsageByModel(timeRange, true),
  });

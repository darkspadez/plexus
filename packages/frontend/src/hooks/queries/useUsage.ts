import { useQuery } from '@tanstack/react-query';
import { api, type PieChartDataPoint, type ErrorsByProviderPoint } from '../../lib/api';
import { type TimeRange } from '../../components/dashboard/TimeRangeSelector';

export const USAGE_BY_MODEL_OVERALL_KEY = ['usage-by-model-overall'] as const;
export const USAGE_BY_PROVIDER_OVERALL_KEY = ['usage-by-provider-overall'] as const;
export const ERRORS_BY_PROVIDER_KEY = ['errors-by-provider'] as const;
export const USAGE_SUMMARY_KEY = ['usage-summary'] as const;

export const useErrorsByProvider = (
  timeRange: TimeRange,
  options?: { startDate?: string; endDate?: string }
) =>
  useQuery<ErrorsByProviderPoint[]>({
    queryKey: [...ERRORS_BY_PROVIDER_KEY, timeRange, options?.startDate, options?.endDate],
    queryFn: () => api.getErrorsByProvider(timeRange, true, options?.startDate, options?.endDate),
  });

export const useUsageSummary = (
  timeRange: TimeRange,
  options?: { startDate?: string; endDate?: string }
) =>
  useQuery({
    queryKey: [...USAGE_SUMMARY_KEY, timeRange, options?.startDate, options?.endDate],
    queryFn: () => api.getUsageSummary(timeRange, true, options?.startDate, options?.endDate),
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

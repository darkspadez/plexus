import { useQuery } from '@tanstack/react-query';
import {
  api,
  normalizeSummaryBreakdowns,
  type PieChartDataPoint,
  type ErrorsByProviderPoint,
  type UsageRange,
  type UsageSummaryBreakdown,
} from '../../lib/api';

export const USAGE_BY_MODEL_OVERALL_KEY = ['usage-by-model-overall'] as const;
export const USAGE_BY_PROVIDER_OVERALL_KEY = ['usage-by-provider-overall'] as const;
export const ERRORS_BY_PROVIDER_KEY = ['errors-by-provider'] as const;
export const USAGE_SUMMARY_KEY = ['usage-summary'] as const;

interface UsageRangeQueryOptions {
  /** Window bounds; only sent (and only part of the query key) for `'custom'`. */
  startDate?: string;
  endDate?: string;
  /** Poll interval that rolls a named range's window forward (see `rangeRefetchMs`). */
  refetchInterval?: number | false;
}

/**
 * Query-key segment for a range. Named ranges are resolved server-side from
 * `range=` alone, so their keys stay stable across refetches; only a custom
 * range is identified by its bounds.
 */
const rangeKey = (range: UsageRange, options?: UsageRangeQueryOptions) =>
  range === 'custom' ? [range, options?.startDate, options?.endDate] : [range];

// A polled query skips the API layer's short-lived request cache so every
// tick reaches the backend and the window actually advances.
const allowsRequestCache = (options?: UsageRangeQueryOptions) => !options?.refetchInterval;

export const useErrorsByProvider = (timeRange: UsageRange, options?: UsageRangeQueryOptions) =>
  useQuery<ErrorsByProviderPoint[]>({
    queryKey: [...ERRORS_BY_PROVIDER_KEY, ...rangeKey(timeRange, options)],
    queryFn: () =>
      api.getErrorsByProvider(
        timeRange,
        allowsRequestCache(options),
        options?.startDate,
        options?.endDate
      ),
    refetchInterval: options?.refetchInterval,
  });

interface UsageSummaryQueryOptions extends UsageRangeQueryOptions {
  /** Dimensions to group by; their results arrive in the response's `grouped`. */
  breakdowns?: UsageSummaryBreakdown[];
  /** Top-N rows per breakdown before the rest roll up into 'Other'. */
  breakdownLimit?: number;
}

export const useUsageSummary = (timeRange: UsageRange, options?: UsageSummaryQueryOptions) =>
  useQuery({
    queryKey: [
      ...USAGE_SUMMARY_KEY,
      ...rangeKey(timeRange, options),
      normalizeSummaryBreakdowns(options?.breakdowns ?? []),
      options?.breakdownLimit,
    ],
    queryFn: () =>
      api.getUsageSummary(
        timeRange,
        allowsRequestCache(options),
        options?.startDate,
        options?.endDate,
        options?.breakdowns,
        options?.breakdownLimit
      ),
    refetchInterval: options?.refetchInterval,
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

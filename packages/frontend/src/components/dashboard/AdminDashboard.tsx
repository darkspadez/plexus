import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Coins,
  DatabaseZap,
  DollarSign,
  Gauge as GaugeIcon,
  Timer,
  Zap,
} from 'lucide-react';
import { PageHeader } from '../layout/PageHeader';
import { PageContainer } from '../layout/PageContainer';
import { rangeRefetchMs, TimeRangeSelector, type TimeRange } from './TimeRangeSelector';
import { MetricsOverviewCard, type MetricDelta, type MetricItem } from './MetricsOverviewCard';
import { ServiceAlertsCard } from './ServiceAlertsCard';
import { ErrorsByProviderCard } from './ErrorsByProviderCard';
import { TimelineChart } from './TimelineChart';
import { TopUsageCard } from './TopUsageCard';
import { ConcurrencyCard, ModelTimelineCard } from './cards';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useUsageSummary } from '../../hooks/queries/useUsage';
import { useCooldowns } from '../../hooks/queries/useAliases';
import {
  useConcurrencyData,
  useClearCooldowns,
  useClearSingleCooldown,
} from '../../hooks/queries/useDashboard';
import { useGrafanaUrl } from '../../hooks/queries/useConfig';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';
import {
  formatCost,
  formatMs,
  formatNumber,
  formatPercent,
  formatTokens,
  formatTPS,
} from '../../lib/format';
import type { CustomDateRange } from '../../lib/date';
import type { UsageSummaryBreakdown } from '../../lib/api';
import {
  buildKpiDeltas,
  cacheHitRatePct,
  errorRatePct,
  EMPTY_KPI_DELTAS,
  formatDeltaPp,
  formatDeltaPercent,
} from './kpi-deltas';

// Feeds the Top Providers / Top Models tables. No exclusions, so they count
// the same requests as the KPI tiles.
const SUMMARY_BREAKDOWNS: UsageSummaryBreakdown[] = ['provider', 'modelAlias'];
const SUMMARY_BREAKDOWN_LIMIT = 5;

/**
 * Single-page admin dashboard that replaces the old Live Metrics / Usage
 * Analytics / Performance tab set. Composes, top to bottom,
 * MetricsOverviewCard, ServiceAlertsCard + ErrorsByProviderCard,
 * TimelineChart, two static cards salvaged from the old Live Metrics tab
 * (Concurrency, Model Stack — see docs/DESIGN_MIGRATION.md) and the Top
 * Providers / Top Models tables (TopUsageCard), around one shared time range
 * control. Only rendered for non-limited (admin) principals — `OverallTab`
 * remains the limited-key view.
 */
export const AdminDashboard: React.FC = () => {
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [timeRange, setTimeRange] = useState<TimeRange>('day');
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange | null>(null);

  // ISO start/end bounds for the selected range. Only a custom range sends
  // them: named ranges are resolved server-side from `range=` alone, which
  // keeps their query keys stable while polling rolls the window forward. For
  // named ranges these bounds only seed TimelineChart's axis-label fallback.
  const startDate = useMemo<string | undefined>(() => {
    if (timeRange === 'custom' && customDateRange) {
      return customDateRange.start.toISOString();
    }
    const now = new Date();
    const rangeStart = new Date(now);
    switch (timeRange) {
      case '1m':
        rangeStart.setMinutes(rangeStart.getMinutes() - 1);
        break;
      case '5m':
        rangeStart.setMinutes(rangeStart.getMinutes() - 5);
        break;
      case '15m':
        rangeStart.setMinutes(rangeStart.getMinutes() - 15);
        break;
      case 'hour':
        rangeStart.setHours(rangeStart.getHours() - 1);
        break;
      case 'day':
        rangeStart.setHours(rangeStart.getHours() - 24);
        break;
      case 'week':
        rangeStart.setDate(rangeStart.getDate() - 7);
        break;
      case 'month':
        rangeStart.setDate(rangeStart.getDate() - 30);
        break;
      case 'all':
        rangeStart.setTime(0);
        break;
    }
    return rangeStart.toISOString();
  }, [timeRange, customDateRange]);

  const endDate = useMemo<string | undefined>(() => {
    if (timeRange === 'custom' && customDateRange) {
      return customDateRange.end.toISOString();
    }
    return new Date().toISOString();
  }, [timeRange, customDateRange]);

  // The page's one summary request per refresh: KPI tiles, TimelineChart and
  // the Top Providers / Top Models tables all render from it.
  const summaryQuery = useUsageSummary(timeRange, {
    startDate,
    endDate,
    refetchInterval: rangeRefetchMs(timeRange),
    breakdowns: SUMMARY_BREAKDOWNS,
    breakdownLimit: SUMMARY_BREAKDOWN_LIMIT,
  });
  // The Active Requests tile is a live snapshot, and this page is the only
  // consumer of the shared concurrency query — the 10s poll must live here.
  const concurrencyQuery = useConcurrencyData({ refetchInterval: 10000 });
  // Cooldowns reflect current provider state, not the selected range. The
  // shared query polls every 10s (uncached), so a new provider outage shows
  // up in ServiceAlertsCard without the admin navigating away and back.
  const cooldownsQuery = useCooldowns();
  const grafanaUrlQuery = useGrafanaUrl();

  const clearCooldownsMutation = useClearCooldowns();
  const clearSingleCooldownMutation = useClearSingleCooldown();

  const cooldowns = cooldownsQuery.data ?? [];
  const grafanaUrl = grafanaUrlQuery.data?.grafanaUrl ?? '';

  // ---------------------------------------------------------------------------
  // Salvaged Live Metrics cards -- Concurrency + Model Stack, as a static
  // two-up grid between the timeline and the Top Providers / Top Models tables.
  // See docs/DESIGN_MIGRATION.md for why the other 8 cards were dropped.
  // ---------------------------------------------------------------------------
  const liveData = useLiveDashboardData();

  const activeRequests = useMemo(
    () => (concurrencyQuery.data ?? []).reduce((acc, item) => acc + Number(item.count || 0), 0),
    [concurrencyQuery.data]
  );

  // 8 tiles in two themed rows of 4: row 1 = health (requests, errors,
  // latency, live load), row 2 = consumption (tokens, cache, cost, throughput).
  const kpis: MetricItem[] = useMemo(() => {
    const stats = summaryQuery.data?.stats;
    const windowStats = {
      totalRequests: stats?.totalRequests ?? 0,
      totalErrors: stats?.totalErrors ?? 0,
      inputTokens: stats?.inputTokens ?? 0,
      outputTokens: stats?.outputTokens ?? 0,
      cachedTokens: stats?.cachedTokens ?? 0,
      cacheWriteTokens: stats?.cacheWriteTokens ?? 0,
    };
    const deltas = stats
      ? buildKpiDeltas(stats, summaryQuery.data?.prevStats ?? null)
      : EMPTY_KPI_DELTAS;

    const relativeDeltaChip = (value: number | null, inverse?: boolean): MetricDelta | undefined =>
      value === null ? undefined : { value, inverse, format: formatDeltaPercent };
    const ppDeltaChip = (value: number | null, inverse?: boolean): MetricDelta | undefined =>
      value === null ? undefined : { value, inverse, format: formatDeltaPp };

    const cachedTotal = windowStats.cachedTokens + windowStats.cacheWriteTokens;

    return [
      {
        label: 'Total Requests',
        value: formatNumber(windowStats.totalRequests, 0),
        icon: <Activity size={16} />,
        delta: relativeDeltaChip(deltas.requests),
      },
      {
        label: 'Error Rate',
        value: formatPercent(errorRatePct(windowStats)),
        icon: <AlertTriangle size={16} />,
        delta: ppDeltaChip(deltas.errorRate, true),
      },
      {
        label: 'Avg Latency',
        value: formatMs(stats?.avgDurationMs ?? 0),
        icon: <Timer size={16} />,
        delta: relativeDeltaChip(deltas.avgLatency, true),
      },
      {
        label: 'Active Requests',
        value: formatNumber(activeRequests, 0),
        icon: <GaugeIcon size={16} />,
      },
      {
        label: 'Tokens',
        value: formatTokens(stats?.totalTokens ?? 0),
        subtitle: `${formatTokens(windowStats.inputTokens)} in · ${formatTokens(windowStats.outputTokens)} out · ${formatTokens(cachedTotal)} cached`,
        icon: <Coins size={16} />,
        delta: relativeDeltaChip(deltas.tokens),
      },
      {
        label: 'Cache Hit Rate',
        value: formatPercent(cacheHitRatePct(windowStats)),
        icon: <DatabaseZap size={16} />,
        delta: ppDeltaChip(deltas.cacheHit),
      },
      {
        label: 'Cost',
        value: formatCost(stats?.totalCost ?? 0, 2),
        icon: <DollarSign size={16} />,
        delta: relativeDeltaChip(deltas.cost, true),
      },
      {
        label: 'Throughput',
        value: `${formatTPS(stats?.avgTokensPerSec ?? 0)} t/s`,
        icon: <Zap size={16} />,
        delta: relativeDeltaChip(deltas.throughput),
      },
    ];
  }, [summaryQuery.data, activeRequests]);

  /** Prompts the user to confirm, then clears all active cooldowns via the API. */
  const handleClearAll = async () => {
    const ok = await toast.confirm({
      title: 'Clear ALL provider cooldowns?',
      message:
        "Cooldowns are shared across all API keys. Clearing them affects traffic for every key using those providers. If the underlying problem hasn't been resolved, cooldowns will simply re-establish on the next failure.",
      confirmLabel: 'Clear all',
      variant: 'danger',
    });
    if (!ok) return;
    clearCooldownsMutation.mutate();
  };

  /** Prompts the user to confirm, then clears the cooldown for a single provider. */
  const handleClearSingle = async (provider: string) => {
    const ok = await toast.confirm({
      title: `Clear cooldown for ${provider}?`,
      message:
        "This affects traffic for every API key using that provider. The cooldown will re-establish on the next failure if the issue isn't resolved.",
      confirmLabel: 'Clear',
      variant: 'danger',
    });
    if (!ok) return;
    clearSingleCooldownMutation.mutate({ provider });
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Dashboard"
        subtitle="Real-time gateway traffic across all providers"
        actions={
          <>
            <TimeRangeSelector
              value={timeRange}
              onChange={setTimeRange}
              options={['1m', '5m', '15m', 'hour', 'day', 'week', 'month', 'all', 'custom']}
              customRange={customDateRange}
              onCustomRangeChange={setCustomDateRange}
            />
            {isAdmin && grafanaUrl && (
              <a
                href={grafanaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-accent hover:text-accent/80 transition-colors whitespace-nowrap"
              >
                View in Grafana ↗
              </a>
            )}
          </>
        }
      />

      <PageContainer className="flex flex-col gap-4">
        <MetricsOverviewCard metrics={kpis} />

        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          <ServiceAlertsCard
            cooldowns={cooldowns}
            onClearAll={handleClearAll}
            onClearSingle={handleClearSingle}
          />
          <ErrorsByProviderCard timeRange={timeRange} startDate={startDate} endDate={endDate} />
        </div>

        <TimelineChart
          series={summaryQuery.data?.series}
          loading={summaryQuery.isLoading}
          startDate={startDate}
          endDate={endDate}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ConcurrencyCard
            concurrencyLoading={liveData.concurrencyLoading}
            concurrencyHistory={liveData.concurrencyHistory}
            totalConcurrentRequests={liveData.totalConcurrentRequests}
            concurrencyProviders={liveData.concurrencyProviders}
          />
          <ModelTimelineCard
            loading={liveData.modelTimelineLoading}
            modelTimeline={liveData.modelTimeline}
            liveWindowMinutes={liveData.liveWindowMinutes}
          />
        </div>

        {/* Six columns only fit side by side at xl; below that the tables stack
            full-width instead of scrolling sideways inside their cards. */}
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
          <TopUsageCard
            title="Top Providers"
            noun="provider"
            breakdown={summaryQuery.data?.grouped?.provider}
            loading={summaryQuery.isLoading}
          />
          <TopUsageCard
            title="Top Models"
            noun="model"
            breakdown={summaryQuery.data?.grouped?.modelAlias}
            loading={summaryQuery.isLoading}
          />
        </div>
      </PageContainer>
    </div>
  );
};

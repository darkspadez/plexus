import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Gauge as GaugeIcon, Zap } from 'lucide-react';
import { Card } from '../ui/Card';
import { PageHeader } from '../layout/PageHeader';
import { PageContainer } from '../layout/PageContainer';
import { TimeRangeSelector, type TimeRange } from './TimeRangeSelector';
import { MetricsOverviewCard, type MetricItem } from './MetricsOverviewCard';
import { ServiceAlertsCard } from './ServiceAlertsCard';
import { ErrorsByProviderCard } from './ErrorsByProviderCard';
import { TimelineChart } from './TimelineChart';
import { ConcurrencyGauge } from './ConcurrencyGauge';
import { TotalEnergyComparison } from '../TotalEnergyComparison';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useUsageSummary } from '../../hooks/queries/useUsage';
import {
  useConcurrencyData,
  useDashboardData,
  useClearCooldowns,
  useClearSingleCooldown,
} from '../../hooks/queries/useDashboard';
import { useGrafanaUrl } from '../../hooks/queries/useConfig';
import { formatEnergy, formatNumber, formatPercent } from '../../lib/format';
import type { CustomDateRange } from '../../lib/date';

/**
 * Single-page admin dashboard that replaces the old Live Metrics / Usage
 * Analytics / Performance tab set. Composes the Task 6 widgets
 * (MetricsOverviewCard, TimelineChart, ConcurrencyGauge, ServiceAlertsCard,
 * ErrorsByProviderCard, TotalEnergyComparison) around one shared time range
 * control. Only rendered for non-limited (admin) principals — `OverallTab`
 * remains the limited-key view.
 */
export const AdminDashboard: React.FC = () => {
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [timeRange, setTimeRange] = useState<TimeRange>('day');
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange | null>(null);

  // ISO start/end bounds for the selected range — mirrors UsageTab's logic so
  // TimelineChart/ErrorsByProviderCard/useUsageSummary stay consistent with
  // other range-driven pages.
  const startDate = useMemo<string | undefined>(() => {
    if (timeRange === 'custom' && customDateRange) {
      return customDateRange.start.toISOString();
    }
    const now = new Date();
    const rangeStart = new Date(now);
    switch (timeRange) {
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

  const summaryQuery = useUsageSummary(timeRange, { startDate, endDate });
  const concurrencyQuery = useConcurrencyData();
  // Cooldowns aren't range-scoped (they reflect current provider state, not a
  // time window), so a fixed 'day' range is used here — same as LiveTab.
  // Polled on a fixed 10s interval (matching ConcurrencyGauge's cadence) so a
  // new provider outage shows up in ServiceAlertsCard without requiring the
  // admin to navigate away and back. This page has no LiveTab-style
  // visibility-tracking, so a simple fixed interval is used instead.
  const dashboardQuery = useDashboardData({ range: 'day', refetchInterval: 10000 });
  const grafanaUrlQuery = useGrafanaUrl();

  const clearCooldownsMutation = useClearCooldowns();
  const clearSingleCooldownMutation = useClearSingleCooldown();

  const cooldowns = dashboardQuery.data?.cooldowns ?? [];
  const grafanaUrl = grafanaUrlQuery.data?.grafanaUrl ?? '';

  const activeRequests = useMemo(
    () => (concurrencyQuery.data ?? []).reduce((acc, item) => acc + Number(item.count || 0), 0),
    [concurrencyQuery.data]
  );

  const kpis: MetricItem[] = useMemo(() => {
    const stats = summaryQuery.data?.stats;
    const totalRequests = stats?.totalRequests ?? 0;
    const totalErrors = stats?.totalErrors ?? 0;
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    const totalKwh = stats?.totalKwhUsed ?? 0;

    return [
      {
        label: 'Total Requests',
        value: formatNumber(totalRequests, 0),
        icon: <Activity size={16} />,
      },
      {
        label: 'Error Rate',
        value: formatPercent(errorRate),
        icon: <AlertTriangle size={16} />,
      },
      {
        label: 'Active Requests',
        value: formatNumber(activeRequests, 0),
        icon: <GaugeIcon size={16} />,
      },
      {
        label: 'Total Energy',
        value: formatEnergy(totalKwh),
        icon: <Zap size={16} />,
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
              onChange={(r) => setTimeRange(r as TimeRange)}
              options={['hour', 'day', 'week', 'month', 'all', 'custom']}
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

        <TimelineChart timeRange={timeRange} startDate={startDate} endDate={endDate} />

        <ConcurrencyGauge />

        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
          <ServiceAlertsCard
            cooldowns={cooldowns}
            onClearAll={handleClearAll}
            onClearSingle={handleClearSingle}
          />
          <ErrorsByProviderCard timeRange={timeRange} startDate={startDate} endDate={endDate} />
          <Card className="min-w-0" title="Energy Comparisons">
            <TotalEnergyComparison totalKwh={summaryQuery.data?.stats?.totalKwhUsed} />
          </Card>
        </div>
      </PageContainer>
    </div>
  );
};

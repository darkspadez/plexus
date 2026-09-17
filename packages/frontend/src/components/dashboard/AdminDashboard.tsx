import React, { useCallback, useMemo, useState } from 'react';
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
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { PageHeader } from '../layout/PageHeader';
import { PageContainer } from '../layout/PageContainer';
import { TimeRangeSelector, type TimeRange } from './TimeRangeSelector';
import { MetricsOverviewCard, type MetricDelta, type MetricItem } from './MetricsOverviewCard';
import { ServiceAlertsCard } from './ServiceAlertsCard';
import { ErrorsByProviderCard } from './ErrorsByProviderCard';
import { TimelineChart } from './TimelineChart';
import { ConcurrencyCard, ModelTimelineCard } from './cards';
import { LiveDashboardModal } from './modals';
import type { ModalCardId } from './liveTypes';
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
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';
import { useCardPositions } from '../../hooks/useCardPositions';
import type { CardId } from '../../types/card';
import {
  formatCost,
  formatMs,
  formatNumber,
  formatPercent,
  formatTokens,
  formatTPS,
} from '../../lib/format';
import type { CustomDateRange } from '../../lib/date';
import {
  buildKpiDeltas,
  cacheHitRatePct,
  errorRatePct,
  EMPTY_KPI_DELTAS,
  formatDeltaPp,
  formatDeltaPercent,
} from './kpi-deltas';

/**
 * The salvage set: only these two cards from upstream's 10-card Live Metrics
 * tab survive as user-orderable drill-ins on AdminDashboard. This is
 * intentionally a subset of the full `CardId` union (see types/card.ts) —
 * `useCardPositions` accepts a `defaultOrder` override for exactly this case,
 * so `CardId`/`DEFAULT_CARD_ORDER` themselves are left untouched (they are
 * also relied on by `CardLayoutCard`, owned by another agent).
 */
const LIVE_CARD_ORDER: CardId[] = ['concurrency', 'modelstack'];

/**
 * Single-page admin dashboard that replaces the old Live Metrics / Usage
 * Analytics / Performance tab set. Composes MetricsOverviewCard,
 * TimelineChart, ServiceAlertsCard and ErrorsByProviderCard around one
 * shared time range control, plus a small user-orderable drag-and-drop grid
 * of two drill-in cards salvaged from the old Live Metrics tab (Concurrency,
 * Model Stack) — see docs/DESIGN_MIGRATION.md. Only rendered for
 * non-limited (admin) principals — `OverallTab` remains the limited-key view.
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
  // The Active Requests tile is a live snapshot, and this page is the only
  // consumer of the shared concurrency query — the 10s poll must live here.
  const concurrencyQuery = useConcurrencyData({ refetchInterval: 10000 });
  // Cooldowns aren't range-scoped (they reflect current provider state, not a
  // time window), so a fixed 'day' range is used here — same as LiveTab.
  // Polled on a fixed 10s interval so a new provider outage shows up in
  // ServiceAlertsCard without requiring the admin to navigate away and back.
  // This page has no LiveTab-style visibility-tracking, so a simple fixed
  // interval is used instead.
  const dashboardQuery = useDashboardData({ range: 'day', refetchInterval: 10000 });
  const grafanaUrlQuery = useGrafanaUrl();

  const clearCooldownsMutation = useClearCooldowns();
  const clearSingleCooldownMutation = useClearSingleCooldown();

  const cooldowns = dashboardQuery.data?.cooldowns ?? [];
  const grafanaUrl = grafanaUrlQuery.data?.grafanaUrl ?? '';

  // ---------------------------------------------------------------------------
  // Salvaged Live Metrics cards -- Concurrency + Model Stack, as a small
  // user-orderable drag-and-drop grid below the KPI/timeline/alerts section.
  // See docs/DESIGN_MIGRATION.md for why the other 8 cards were dropped.
  // ---------------------------------------------------------------------------
  const liveData = useLiveDashboardData();
  const { positions: livePositions, reorderCards: reorderLiveCards } =
    useCardPositions(LIVE_CARD_ORDER);
  const [activeLiveCardId, setActiveLiveCardId] = useState<CardId | null>(null);
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const [liveModalCard, setLiveModalCard] = useState<ModalCardId | null>(null);

  const openLiveModal = useCallback((card: ModalCardId) => {
    setLiveModalCard(card);
    setLiveModalOpen(true);
  }, []);

  const closeLiveModal = useCallback(() => {
    setLiveModalOpen(false);
    setLiveModalCard(null);
  }, []);

  const handleLiveDragStart = useCallback((event: DragStartEvent) => {
    setActiveLiveCardId(event.active.id as CardId);
  }, []);

  const handleLiveDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveLiveCardId(null);

      if (over && active.id !== over.id) {
        const oldIndex = livePositions.findIndex((p) => p.id === active.id);
        const newIndex = livePositions.findIndex((p) => p.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          reorderLiveCards(oldIndex, newIndex);
        }
      }
    },
    [livePositions, reorderLiveCards]
  );

  const handleLiveDragCancel = useCallback(() => {
    setActiveLiveCardId(null);
  }, []);

  const orderedLiveCardIds = useMemo<CardId[]>(() => {
    if (livePositions.length === 0) {
      return LIVE_CARD_ORDER;
    }

    const next = [...livePositions]
      .sort((a, b) => a.order - b.order)
      .map((position) => position.id)
      .filter((id): id is CardId => LIVE_CARD_ORDER.includes(id));

    const missing = LIVE_CARD_ORDER.filter((id) => !next.includes(id));
    return [...next, ...missing];
  }, [livePositions]);

  const renderLiveCard = (cardId: CardId, index: number, isOverlay = false) => {
    switch (cardId) {
      case 'concurrency':
        return (
          <ConcurrencyCard
            index={index}
            isOverlay={isOverlay}
            onClick={() => openLiveModal('concurrency')}
            concurrencyLoading={liveData.concurrencyLoading}
            concurrencyHistory={liveData.concurrencyHistory}
            totalConcurrentRequests={liveData.totalConcurrentRequests}
            concurrencyProviders={liveData.concurrencyProviders}
          />
        );
      case 'modelstack':
        return (
          <ModelTimelineCard
            index={index}
            isOverlay={isOverlay}
            onClick={() => openLiveModal('modelstack')}
            loading={liveData.modelTimelineLoading}
            modelTimeline={liveData.modelTimeline}
            liveWindowMinutes={liveData.liveWindowMinutes}
          />
        );
      default:
        return null;
    }
  };

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

        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          <ServiceAlertsCard
            cooldowns={cooldowns}
            onClearAll={handleClearAll}
            onClearSingle={handleClearSingle}
          />
          <ErrorsByProviderCard timeRange={timeRange} startDate={startDate} endDate={endDate} />
        </div>

        {/* Salvaged Live Metrics drill-in cards -- user-orderable via drag handle. */}
        <DndContext
          onDragStart={handleLiveDragStart}
          onDragEnd={handleLiveDragEnd}
          onDragCancel={handleLiveDragCancel}
        >
          <SortableContext items={orderedLiveCardIds}>
            <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
              {orderedLiveCardIds.map((cardId, index) => (
                <div key={cardId} className="min-w-0">
                  {renderLiveCard(cardId, index)}
                </div>
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeLiveCardId ? (
              <div className="w-[min(100%,720px)]">{renderLiveCard(activeLiveCardId, 0, true)}</div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </PageContainer>

      <LiveDashboardModal
        isOpen={liveModalOpen}
        onClose={closeLiveModal}
        modalCard={liveModalCard}
        data={liveData}
      />
    </div>
  );
};

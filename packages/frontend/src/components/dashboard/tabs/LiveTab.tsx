import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock, Database, RefreshCw, Signal, X, Zap } from 'lucide-react';
import {
  AreaChart,
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import {
  api,
  STAT_LABELS,
  type Cooldown,
  type Stat,
  type TodayMetrics,
  type UsageRecord,
} from '../../../lib/api';
import {
  formatCost,
  formatMs,
  formatNumber,
  formatTimeAgo,
  formatTokens,
  formatTPS,
} from '../../../lib/format';

type MinuteBucket = {
  time: string;
  requests: number;
  errors: number;
  tokens: number;
};

type PulseRow = {
  label: string;
  requests: number;
  successRate: number;
};

type ModelTimelineSeries = {
  key: string;
  label: string;
  color: string;
};

type ModelTimelineBucket = Record<string, string | number> & {
  time: string;
  requests: number;
  errors: number;
  tokens: number;
  avgTtftMs: number;
  avgTps: number;
  ttftTotal: number;
  ttftCount: number;
  tpsTotal: number;
  tpsCount: number;
};

type StreamFilter = 'all' | 'success' | 'error';

interface LiveTabProps {
  pollInterval: number;
  onPollIntervalChange: (interval: number) => void;
}

const LIVE_WINDOW_MINUTES = 5;
const LIVE_WINDOW_MS = LIVE_WINDOW_MINUTES * 60 * 1000;
const POLL_INTERVAL_MS = 10000;
const RECENT_REQUEST_LIMIT = 200;
const POLL_INTERVAL_OPTIONS = [5000, 10000, 30000] as const;
const MODEL_TIMELINE_MAX_SERIES = 5;
const MODEL_TIMELINE_COLORS = ['#3b82f6', '#14b8a6', '#8b5cf6', '#f59e0b', '#ef4444'] as const;

const PLACEHOLDER_LABELS = new Set(['unknown', 'n/a', 'na', 'none', 'null', 'undefined']);

const normalizeTelemetryLabel = (value: string | null | undefined): string => {
  const normalized = value?.trim();
  if (!normalized) {
    return '';
  }

  if (PLACEHOLDER_LABELS.has(normalized.toLowerCase())) {
    return '';
  }

  return normalized;
};

const getProviderLabel = (request: UsageRecord): string => {
  const provider = normalizeTelemetryLabel(request.provider);
  if (provider) {
    return provider;
  }

  const status = (request.responseStatus || '').toLowerCase();
  if (status && status !== 'success') {
    return 'Failed Request';
  }

  return 'Unresolved Provider';
};

const getModelLabel = (request: UsageRecord): string => {
  const model =
    normalizeTelemetryLabel(request.selectedModelName) ||
    normalizeTelemetryLabel(request.incomingModelAlias);
  if (model) {
    return model;
  }

  const status = (request.responseStatus || '').toLowerCase();
  if (status && status !== 'success') {
    return 'Failed Before Model Selection';
  }

  return 'Unresolved Model';
};

export const LiveTab: React.FC<LiveTabProps> = ({ pollInterval, onPollIntervalChange }) => {
  const [stats, setStats] = useState<Stat[]>([]);
  const [cooldowns, setCooldowns] = useState<Cooldown[]>([]);
  const [todayMetrics, setTodayMetrics] = useState<TodayMetrics>({
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    totalCost: 0,
  });
  const [logs, setLogs] = useState<UsageRecord[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [timeAgo, setTimeAgo] = useState('Just now');
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [streamFilter, setStreamFilter] = useState<StreamFilter>('all');
  const [pollIntervalMs, setPollIntervalMs] = useState(pollInterval);

  useEffect(() => {
    setPollIntervalMs(pollInterval);
  }, [pollInterval]);
  const [isVisible, setIsVisible] = useState<boolean>(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  );
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCard, setModalCard] = useState<
    'velocity' | 'provider' | 'model' | 'timeline' | 'modelstack' | 'requests' | null
  >(null);

  const openModal = (card: typeof modalCard) => {
    setModalCard(card);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalCard(null);
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    if (modalOpen) {
      window.addEventListener('keydown', handleEscape);
    }
    return () => window.removeEventListener('keydown', handleEscape);
  }, [modalOpen]);

  const loadData = async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      const [dashboardData, logData] = await Promise.all([
        api.getDashboardData('day', false),
        api.getLogs(RECENT_REQUEST_LIMIT, 0),
      ]);
      setStats(dashboardData.stats);
      setCooldowns(dashboardData.cooldowns);
      setTodayMetrics(dashboardData.todayMetrics);
      setLogs(logData.data || []);
      setLastUpdated(new Date());
      setIsConnected(true);
    } catch (e) {
      setIsConnected(false);
      console.error('Failed to load live metrics data', e);
    } finally {
      if (!silent) {
        setIsRefreshing(false);
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    if (!isVisible) {
      return;
    }

    const interval = setInterval(() => {
      void loadData(true);
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [isVisible, pollIntervalMs]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);
      if (visible) {
        void loadData(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
      setSecondsSinceUpdate(seconds);
      if (seconds < 5) {
        setTimeAgo('Just now');
        return;
      }
      setTimeAgo(formatTimeAgo(seconds));
    };

    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const liveRequests = useMemo(() => {
    const cutoff = Date.now() - LIVE_WINDOW_MS;
    return logs
      .filter((request) => {
        const requestTime = new Date(request.date).getTime();
        return Number.isFinite(requestTime) && requestTime >= cutoff;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [logs]);

  const filteredLiveRequests = useMemo(() => {
    if (streamFilter === 'all') {
      return liveRequests;
    }

    if (streamFilter === 'success') {
      return liveRequests.filter(
        (request) => (request.responseStatus || '').toLowerCase() === 'success'
      );
    }

    return liveRequests.filter(
      (request) => (request.responseStatus || '').toLowerCase() !== 'success'
    );
  }, [liveRequests, streamFilter]);

  const summary = useMemo(() => {
    return liveRequests.reduce(
      (acc, request) => {
        const isSuccess = (request.responseStatus || '').toLowerCase() === 'success';
        acc.requestCount += 1;
        if (isSuccess) {
          acc.successCount += 1;
        } else {
          acc.errorCount += 1;
        }

        acc.totalTokens +=
          Number(request.tokensInput || 0) +
          Number(request.tokensOutput || 0) +
          Number(request.tokensCached || 0) +
          Number(request.tokensCacheWrite || 0);
        acc.totalCost += Number(request.costTotal || 0);
        acc.totalLatency += Number(request.durationMs || 0);
        acc.totalTtft += Number(request.ttftMs || 0);
        return acc;
      },
      {
        requestCount: 0,
        successCount: 0,
        errorCount: 0,
        totalTokens: 0,
        totalCost: 0,
        totalLatency: 0,
        totalTtft: 0,
      }
    );
  }, [liveRequests]);

  const minuteSeries = useMemo(() => {
    const buckets = new Map<string, MinuteBucket>();
    const now = Date.now();

    for (let i = LIVE_WINDOW_MINUTES - 1; i >= 0; i--) {
      const bucketDate = new Date(now - i * 60000);
      const key = bucketDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      buckets.set(key, { time: key, requests: 0, errors: 0, tokens: 0 });
    }

    for (const request of liveRequests) {
      const key = new Date(request.date).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const bucket = buckets.get(key);
      if (!bucket) {
        continue;
      }

      bucket.requests += 1;
      if ((request.responseStatus || '').toLowerCase() !== 'success') {
        bucket.errors += 1;
      }
      bucket.tokens +=
        Number(request.tokensInput || 0) +
        Number(request.tokensOutput || 0) +
        Number(request.tokensCached || 0) +
        Number(request.tokensCacheWrite || 0);
    }

    return Array.from(buckets.values());
  }, [liveRequests]);

  const modelTimeline = useMemo(() => {
    const modelCounts = new Map<string, number>();
    for (const request of liveRequests) {
      const model = getModelLabel(request);
      modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
    }

    const topModels = Array.from(modelCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MODEL_TIMELINE_MAX_SERIES)
      .map(([label]) => label);

    const series: ModelTimelineSeries[] = topModels.map((label, index) => ({
      key: `model_${index}`,
      label,
      color: MODEL_TIMELINE_COLORS[index % MODEL_TIMELINE_COLORS.length],
    }));
    const seriesKeyByLabel = new Map(series.map((entry) => [entry.label, entry.key]));

    const buckets = new Map<string, ModelTimelineBucket>();
    const now = Date.now();

    for (let i = LIVE_WINDOW_MINUTES - 1; i >= 0; i--) {
      const bucketDate = new Date(now - i * 60000);
      const key = bucketDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const bucket: ModelTimelineBucket = {
        time: key,
        requests: 0,
        errors: 0,
        tokens: 0,
        avgTtftMs: 0,
        avgTps: 0,
        ttftTotal: 0,
        ttftCount: 0,
        tpsTotal: 0,
        tpsCount: 0,
      };

      for (const item of series) {
        bucket[item.key] = 0;
      }
      buckets.set(key, bucket);
    }

    for (const request of liveRequests) {
      const key = new Date(request.date).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const bucket = buckets.get(key);
      if (!bucket) {
        continue;
      }

      bucket.requests += 1;
      if ((request.responseStatus || '').toLowerCase() !== 'success') {
        bucket.errors += 1;
      }
      bucket.tokens +=
        Number(request.tokensInput || 0) +
        Number(request.tokensOutput || 0) +
        Number(request.tokensCached || 0) +
        Number(request.tokensCacheWrite || 0);

      const modelLabel = getModelLabel(request);
      const seriesKey = seriesKeyByLabel.get(modelLabel);
      if (seriesKey) {
        bucket[seriesKey] = Number(bucket[seriesKey] || 0) + 1;
      }

      const ttft = Number(request.ttftMs || 0);
      if (Number.isFinite(ttft) && ttft > 0) {
        bucket.ttftTotal += ttft;
        bucket.ttftCount += 1;
      }

      const tps = Number(request.tokensPerSec || 0);
      if (Number.isFinite(tps) && tps > 0) {
        bucket.tpsTotal += tps;
        bucket.tpsCount += 1;
      }
    }

    const data = Array.from(buckets.values()).map((bucket) => ({
      ...bucket,
      avgTtftMs: bucket.ttftCount > 0 ? bucket.ttftTotal / bucket.ttftCount : 0,
      avgTps: bucket.tpsCount > 0 ? bucket.tpsTotal / bucket.tpsCount : 0,
    }));

    return {
      series,
      seriesLabelMap: new Map(series.map((entry) => [entry.key, entry.label])),
      data,
    };
  }, [liveRequests]);

  const successRate =
    summary.requestCount > 0 ? (summary.successCount / summary.requestCount) * 100 : 0;
  const isStale = secondsSinceUpdate > Math.ceil((pollIntervalMs * 3) / 1000);
  const tokensPerMinute = summary.totalTokens / LIVE_WINDOW_MINUTES;
  const costPerMinute = summary.totalCost / LIVE_WINDOW_MINUTES;
  const avgLatency = summary.requestCount > 0 ? summary.totalLatency / summary.requestCount : 0;
  const avgTtft = summary.requestCount > 0 ? summary.totalTtft / summary.requestCount : 0;
  const throughputSamples = liveRequests
    .map((request) => Number(request.tokensPerSec || 0))
    .filter((tps) => Number.isFinite(tps) && tps > 0);
  const avgThroughput =
    throughputSamples.length > 0
      ? throughputSamples.reduce((acc, tps) => acc + tps, 0) / throughputSamples.length
      : 0;
  const totalRequestsValue =
    stats.find((stat) => stat.label === STAT_LABELS.REQUESTS)?.value || formatNumber(0, 0);
  const totalTokensValue =
    stats.find((stat) => stat.label === STAT_LABELS.TOKENS)?.value || formatTokens(0);
  const todayTokenTotal =
    todayMetrics.inputTokens +
    todayMetrics.outputTokens +
    todayMetrics.reasoningTokens +
    todayMetrics.cachedTokens +
    todayMetrics.cacheWriteTokens;

  const providerRows = useMemo(() => {
    const providers = new Map<
      string,
      { requests: number; success: number; totalLatency: number; totalCost: number }
    >();

    for (const request of liveRequests) {
      const provider = getProviderLabel(request);
      const row = providers.get(provider) || {
        requests: 0,
        success: 0,
        totalLatency: 0,
        totalCost: 0,
      };

      row.requests += 1;
      if ((request.responseStatus || '').toLowerCase() === 'success') {
        row.success += 1;
      }
      row.totalLatency += Number(request.durationMs || 0);
      row.totalCost += Number(request.costTotal || 0);
      providers.set(provider, row);
    }

    return Array.from(providers.entries())
      .map(([provider, row]) => ({
        provider,
        requests: row.requests,
        successRate: row.requests > 0 ? (row.success / row.requests) * 100 : 0,
        avgLatency: row.requests > 0 ? row.totalLatency / row.requests : 0,
        totalCost: row.totalCost,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 6);
  }, [liveRequests]);

  const velocitySeries = useMemo(() => {
    return minuteSeries.map((bucket, index, arr) => {
      if (index === 0) {
        return { time: bucket.time, velocity: bucket.requests };
      }

      const prev = arr[index - 1];
      return {
        time: bucket.time,
        velocity: bucket.requests - prev.requests,
      };
    });
  }, [minuteSeries]);

  const providerPulseRows = useMemo(() => {
    const rows = new Map<string, { requests: number; success: number }>();
    for (const request of liveRequests) {
      const provider = getProviderLabel(request);
      const row = rows.get(provider) || { requests: 0, success: 0 };
      row.requests += 1;
      if ((request.responseStatus || '').toLowerCase() === 'success') {
        row.success += 1;
      }
      rows.set(provider, row);
    }

    return Array.from(rows.entries())
      .map(([label, row]) => ({
        label,
        requests: row.requests,
        successRate: row.requests > 0 ? (row.success / row.requests) * 100 : 0,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 8);
  }, [liveRequests]);

  const modelPulseRows = useMemo(() => {
    const rows = new Map<string, { requests: number; success: number }>();
    for (const request of liveRequests) {
      const model = getModelLabel(request);
      const row = rows.get(model) || { requests: 0, success: 0 };
      row.requests += 1;
      if ((request.responseStatus || '').toLowerCase() === 'success') {
        row.success += 1;
      }
      rows.set(model, row);
    }

    return Array.from(rows.entries())
      .map(([label, row]) => ({
        label,
        requests: row.requests,
        successRate: row.requests > 0 ? (row.success / row.requests) * 100 : 0,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 8);
  }, [liveRequests]);

  const renderPulseList = (rows: PulseRow[], emptyText: string) => {
    if (rows.length === 0) {
      return <div className="text-text-secondary text-sm py-2">{emptyText}</div>;
    }

    return (
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {rows.map((row) => (
          <div
            key={row.label}
            className="rounded-md border border-border-glass bg-bg-glass px-3 py-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-text font-medium truncate max-w-60" title={row.label}>
                {row.label}
              </span>
              <span className="text-xs text-text-secondary">
                {formatNumber(row.requests, 0)} requests
              </span>
            </div>
            <div className="mt-1 text-xs text-text-secondary">
              Success: {row.successRate.toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    );
  };

  const groupedCooldowns = useMemo(() => {
    return cooldowns.reduce(
      (acc, cooldown) => {
        const key = `${cooldown.provider}:${cooldown.model}`;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(cooldown);
        return acc;
      },
      {} as Record<string, Cooldown[]>
    );
  }, [cooldowns]);

  const handleClearCooldowns = async () => {
    if (!confirm('Are you sure you want to clear all provider cooldowns?')) {
      return;
    }

    try {
      await api.clearCooldown();
      await loadData();
    } catch (e) {
      alert('Failed to clear cooldowns');
      console.error('Failed to clear cooldowns', e);
    }
  };

  const Modal = ({
    isOpen,
    onClose,
    title,
    children,
  }: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
  }) => {
    if (!isOpen) return null;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-6xl max-h-[90vh] overflow-auto rounded-lg border border-border-glass bg-bg-card p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-text">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-bg-hover transition-colors"
              aria-label="Close modal"
            >
              <X size={24} className="text-text-secondary" />
            </button>
          </div>
          {children}
        </div>
      </div>
    );
  };

  const getModalTitle = () => {
    switch (modalCard) {
      case 'velocity':
        return 'Request Velocity (Last 5 Minutes)';
      case 'provider':
        return 'Provider Pulse (5m)';
      case 'model':
        return 'Model Pulse (5m)';
      case 'timeline':
        return 'Live Timeline';
      case 'modelstack':
        return 'Model Stack + Runtime';
      case 'requests':
        return 'Latest Requests';
      default:
        return '';
    }
  };

  const renderModalContent = () => {
    switch (modalCard) {
      case 'velocity':
        return (
          <div className="h-[60vh]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={velocitySeries} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-glass)" />
                <XAxis dataKey="time" stroke="var(--color-text-secondary)" />
                <YAxis stroke="var(--color-text-secondary)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="velocity"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      case 'provider':
        return (
          <div className="h-[60vh]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={providerPulseRows.slice(0, 8)}
                margin={{ top: 10, right: 24, left: 0, bottom: 48 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-glass)" />
                <XAxis
                  dataKey="label"
                  stroke="var(--color-text-secondary)"
                  angle={-20}
                  textAnchor="end"
                  height={56}
                />
                <YAxis stroke="var(--color-text-secondary)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="requests" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      case 'model':
        return (
          <div className="h-[60vh]">
            {modelPulseRows.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-secondary">
                No model traffic in the selected live window.
              </div>
            ) : (
              <div className="space-y-3">
                {modelPulseRows.map((row) => (
                  <div
                    key={row.label}
                    className="rounded-md border border-border-glass bg-bg-glass px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-base text-text font-medium">{row.label}</span>
                      <span className="text-sm text-text-secondary">
                        {formatNumber(row.requests, 0)} requests
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-text-secondary">
                      Success: {row.successRate.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'timeline':
        return (
          <div className="h-[60vh]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={minuteSeries} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="liveRequests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="liveTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-glass)" />
                <XAxis dataKey="time" stroke="var(--color-text-secondary)" />
                <YAxis yAxisId="left" stroke="var(--color-text-secondary)" />
                <YAxis yAxisId="right" orientation="right" stroke="var(--color-text-secondary)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                  }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="requests"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#liveRequests)"
                  strokeWidth={2}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="errors"
                  stroke="#ef4444"
                  fillOpacity={0.15}
                  fill="#ef4444"
                  strokeWidth={1.5}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="tokens"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#liveTokens)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );
      case 'modelstack':
        return (
          <div className="h-[70vh]">
            {modelTimeline.series.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-secondary">
                No model stack data in the selected live window.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={modelTimeline.data}
                  margin={{ top: 10, right: 24, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-glass)" />
                  <XAxis dataKey="time" stroke="var(--color-text-secondary)" />
                  <YAxis yAxisId="left" stroke="var(--color-text-secondary)" />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--color-text-secondary)" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-bg-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'var(--color-text)' }}
                    formatter={(value, name) => {
                      const numeric = Number(value || 0);
                      const label = modelTimeline.seriesLabelMap.get(String(name));
                      if (label) {
                        return [formatNumber(numeric, 0), label];
                      }
                      if (name === 'avgTtftMs') {
                        return [formatMs(numeric), 'Avg TTFT'];
                      }
                      if (name === 'avgTps') {
                        return [formatTPS(numeric), 'Avg TPS'];
                      }
                      return [formatNumber(numeric, 0), String(name)];
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value) => modelTimeline.seriesLabelMap.get(String(value)) || value}
                  />
                  {modelTimeline.series.map((series) => (
                    <Bar
                      key={series.key}
                      yAxisId="left"
                      stackId="model-stack"
                      dataKey={series.key}
                      fill={series.color}
                    />
                  ))}
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avgTtftMs"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avgTps"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        );
      case 'requests':
        return (
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {filteredLiveRequests.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-secondary">
                {liveRequests.length === 0
                  ? 'No requests observed yet.'
                  : 'No requests match the current filter.'}
              </div>
            ) : (
              filteredLiveRequests.map((request) => {
                const requestTimeSeconds = Math.max(
                  0,
                  Math.floor((Date.now() - new Date(request.date).getTime()) / 1000)
                );
                const status = (request.responseStatus || 'errored').toLowerCase();
                const isSuccess = status.toLowerCase() === 'success';
                const providerLabel = getProviderLabel(request);
                const modelLabel = getModelLabel(request);
                return (
                  <div
                    key={request.requestId}
                    className="rounded-md border border-border-glass bg-bg-glass p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base text-text font-medium">{providerLabel}</span>
                        <span className="text-sm text-text-secondary">{modelLabel}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-md ${
                            isSuccess
                              ? 'text-success bg-emerald-500/15 border border-success/25'
                              : 'text-danger bg-red-500/15 border border-danger/30'
                          }`}
                        >
                          {status}
                        </span>
                      </div>
                      <span className="text-sm text-text-muted">
                        {formatTimeAgo(requestTimeSeconds)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
                      <span>ID: {request.requestId.slice(0, 8)}...</span>
                      <span>
                        Tokens:{' '}
                        {formatTokens(
                          Number(request.tokensInput || 0) +
                            Number(request.tokensOutput || 0) +
                            Number(request.tokensCached || 0) +
                            Number(request.tokensCacheWrite || 0)
                        )}
                      </span>
                      <span>Cost: {formatCost(Number(request.costTotal || 0), 6)}</span>
                      <span>Latency: {formatMs(Number(request.durationMs || 0))}</span>
                      <span>TTFT: {formatMs(Number(request.ttftMs || 0))}</span>
                      <span>TPS: {formatTPS(Number(request.tokensPerSec || 0))}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-6 transition-all duration-300">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div className="header-left">
          <h1 className="font-heading text-3xl font-bold text-text m-0 mb-2">Live Metrics</h1>
          {cooldowns.length > 0 ? (
            <Badge
              status="warning"
              secondaryText={`Last updated: ${timeAgo}`}
              style={{ minWidth: '190px' }}
            >
              System Degraded
            </Badge>
          ) : (
            <Badge
              status="connected"
              secondaryText={`Last updated: ${timeAgo}`}
              style={{ minWidth: '190px' }}
            >
              System Online
            </Badge>
          )}
        </div>

        <Badge
          status={isConnected && !isStale ? 'connected' : 'warning'}
          secondaryText={`Window: last ${LIVE_WINDOW_MINUTES}m`}
          style={{ minWidth: '210px' }}
        >
          {isConnected
            ? isStale
              ? 'Live Polling Delayed'
              : 'Live Polling Active'
            : 'Live Polling Reconnecting'}
        </Badge>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void loadData()}
          isLoading={isRefreshing}
        >
          <RefreshCw size={14} />
          Refresh Now
        </Button>
        {POLL_INTERVAL_OPTIONS.map((option) => {
          const label = `${Math.floor(option / 1000)}s`;
          return (
            <Button
              key={option}
              size="sm"
              variant={pollIntervalMs === option ? 'primary' : 'secondary'}
              onClick={() => {
                setPollIntervalMs(option);
                onPollIntervalChange(option);
              }}
            >
              Poll {label}
            </Button>
          );
        })}
        <span className="text-xs text-text-muted">
          {isVisible ? 'Tab active' : 'Tab hidden'} - data refresh resumes on focus.
        </span>
      </div>

      <div className="mb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Combined metrics card — half width */}
        <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-bg-subtle border-b border-border flex items-center gap-2">
            <Signal size={15} className="text-info" />
            <h3 className="font-heading text-sm font-semibold text-text">Metrics</h3>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border">
            {/* Overview column */}
            <div className="divide-y divide-border">
              <div className="px-3 py-1.5 bg-bg-subtle/50">
                <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                  Overview
                </span>
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-text-muted">Total Requests</span>
                <span className="text-sm font-semibold text-text tabular-nums">
                  {totalRequestsValue}
                </span>
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-text-muted">Total Tokens</span>
                <span className="text-sm font-semibold text-text tabular-nums">
                  {totalTokensValue}
                </span>
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-text-muted">Requests Today</span>
                <span className="text-sm font-semibold text-text tabular-nums">
                  {formatNumber(todayMetrics.requests, 0)}
                </span>
              </div>
              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-xs text-text-muted shrink-0">Tokens Today</span>
                <div className="text-right">
                  <span className="text-sm font-semibold text-text tabular-nums">
                    {formatTokens(todayTokenTotal)}
                  </span>
                  <div className="text-[11px] text-text-muted">
                    {[
                      `In: ${formatTokens(todayMetrics.inputTokens)}`,
                      `Out: ${formatTokens(todayMetrics.outputTokens)}`,
                      todayMetrics.reasoningTokens > 0
                        ? `Reasoning: ${formatTokens(todayMetrics.reasoningTokens)}`
                        : null,
                      todayMetrics.cachedTokens > 0
                        ? `Cached: ${formatTokens(todayMetrics.cachedTokens)}`
                        : null,
                      todayMetrics.cacheWriteTokens > 0
                        ? `Cache Write: ${formatTokens(todayMetrics.cacheWriteTokens)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  </div>
                </div>
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-text-muted">Cost Today</span>
                <span className="text-sm font-semibold text-info tabular-nums">
                  {formatCost(todayMetrics.totalCost, 4)}
                </span>
              </div>
            </div>
            {/* Live Window column */}
            <div className="divide-y divide-border">
              <div className="px-3 py-1.5 bg-bg-subtle/50">
                <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                  Live ({LIVE_WINDOW_MINUTES}m)
                </span>
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-text-muted">Requests</span>
                <span className="text-sm font-semibold text-text tabular-nums">
                  {formatNumber(summary.requestCount, 0)}
                </span>
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-text-muted">Success Rate</span>
                <div className="text-right">
                  <span className="text-sm font-semibold text-text tabular-nums">
                    {successRate.toFixed(1)}%
                  </span>
                  <div className="text-[11px] text-text-muted">
                    {summary.successCount} ok / {summary.errorCount} err
                  </div>
                </div>
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-text-muted">Tokens / Min</span>
                <span className="text-sm font-semibold text-text tabular-nums">
                  {formatTokens(tokensPerMinute)}
                </span>
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-text-muted">Cost / Min</span>
                <span className="text-sm font-semibold text-info tabular-nums">
                  {formatCost(costPerMinute, 6)}
                </span>
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-text-muted">Avg Latency</span>
                <span className="text-sm font-semibold text-text tabular-nums">
                  {formatMs(avgLatency)}
                </span>
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-text-muted">TTFT / Throughput</span>
                <div className="text-right">
                  <span className="text-sm font-semibold text-text tabular-nums">
                    {formatMs(avgTtft)}
                  </span>
                  <div className="text-[11px] text-text-muted">
                    {formatTPS(avgThroughput)} tok/s
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Service Alerts + Top Providers combined card — half width */}
        <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-bg-subtle border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle
                size={15}
                className={cooldowns.length > 0 ? 'text-warning' : 'text-text-muted'}
              />
              <h3 className="font-heading text-sm font-semibold text-text">
                Alerts &amp; Providers
              </h3>
            </div>
            {cooldowns.length > 0 && (
              <button
                onClick={handleClearCooldowns}
                className="text-[11px] text-warning hover:text-warning/80 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
          {cooldowns.length > 0 && (
            <div className="divide-y divide-border border-b border-warning/30">
              {Object.entries(groupedCooldowns).map(([key, modelCooldowns]) => {
                const [provider, model] = key.split(':');
                const maxTime = Math.max(...modelCooldowns.map((c) => c.timeRemainingMs));
                const minutes = Math.ceil(maxTime / 60000);
                const modelDisplay = model || 'all models';
                return (
                  <div key={key} className="px-3 py-2 flex items-center gap-2 bg-warning/5">
                    <AlertTriangle size={12} className="text-warning shrink-0" />
                    <span className="text-xs font-medium text-text">
                      {normalizeTelemetryLabel(provider) || 'Unknown'}
                    </span>
                    <span className="text-xs text-text-muted truncate">
                      {modelDisplay} — {minutes}m
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="divide-y divide-border">
            {providerRows.length === 0 ? (
              <div className="px-3 py-3 text-xs text-text-muted">
                No provider activity in the last {LIVE_WINDOW_MINUTES} minutes.
              </div>
            ) : (
              providerRows.map((row) => (
                <div key={row.provider} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-text">{row.provider}</span>
                    <span className="text-xs text-text-muted tabular-nums">
                      {formatNumber(row.requests, 0)} req
                    </span>
                  </div>
                  <div className="flex gap-3 mt-0.5 text-[11px] text-text-muted">
                    <span>{row.successRate.toFixed(1)}% ok</span>
                    <span>{formatMs(row.avgLatency)}</span>
                    <span className="text-info">{formatCost(row.totalCost, 6)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div
        className="grid gap-4 mb-4 flex-col lg:flex-row"
        style={{ gridTemplateColumns: '1fr 1fr' }}
      >
        <Card
          title="Request Velocity (Last 5 Minutes)"
          extra={<span className="text-xs text-text-secondary">Minute-over-minute delta</span>}
          onClick={() => openModal('velocity')}
          style={{ cursor: 'pointer' }}
          className="hover:shadow-lg hover:border-primary/30 transition-all"
        >
          {velocitySeries.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-text-secondary">
              No velocity data available
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={velocitySeries}
                  margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-glass)" />
                  <XAxis
                    dataKey="time"
                    stroke="var(--color-text-secondary)"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                  />
                  <YAxis
                    stroke="var(--color-text-secondary)"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-bg-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'var(--color-text)' }}
                    formatter={(value) => [formatNumber(Number(value || 0), 0), 'Velocity']}
                  />
                  <Line
                    type="monotone"
                    dataKey="velocity"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card
          title="Provider Pulse (5m)"
          extra={<span className="text-xs text-text-secondary">Top 8 providers</span>}
          onClick={() => openModal('provider')}
          style={{ cursor: 'pointer' }}
          className="hover:shadow-lg hover:border-primary/30 transition-all"
        >
          {providerPulseRows.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-text-secondary">
              No provider traffic in the selected live window.
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={providerPulseRows.slice(0, 6)}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-glass)" />
                  <XAxis
                    dataKey="label"
                    stroke="var(--color-text-secondary)"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis
                    stroke="var(--color-text-secondary)"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-bg-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'var(--color-text)' }}
                    formatter={(value) => [formatNumber(Number(value || 0), 0), 'Requests']}
                  />
                  <Bar dataKey="requests" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div
        className="grid gap-4 mb-4 flex-col lg:flex-row"
        style={{ gridTemplateColumns: '1fr 1fr' }}
      >
        <Card
          className="min-w-0 hover:shadow-lg hover:border-primary/30 transition-all"
          title="Live Timeline"
          extra={<Clock size={16} className="text-primary" />}
          onClick={() => openModal('timeline')}
          style={{ cursor: 'pointer' }}
        >
          {loading ? (
            <div className="h-56 flex items-center justify-center text-text-secondary">
              Loading...
            </div>
          ) : minuteSeries.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-text-secondary">
              No requests in the last {LIVE_WINDOW_MINUTES} minutes
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={minuteSeries} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="liveRequests" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.2} />
                    </linearGradient>
                    <linearGradient id="liveTokens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.2} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-glass)" />
                  <XAxis
                    dataKey="time"
                    stroke="var(--color-text-secondary)"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="var(--color-text-secondary)"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="var(--color-text-secondary)"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-bg-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'var(--color-text)' }}
                    formatter={(value, name) => {
                      if (name === 'tokens') {
                        return [formatTokens(Number(value || 0)), 'Tokens'];
                      }
                      return [
                        formatNumber(Number(value || 0), 0),
                        name === 'requests' ? 'Requests' : 'Errors',
                      ];
                    }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="requests"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#liveRequests)"
                    strokeWidth={2}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="errors"
                    stroke="#ef4444"
                    fillOpacity={0.15}
                    fill="#ef4444"
                    strokeWidth={1.5}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="tokens"
                    stroke="#10b981"
                    fillOpacity={1}
                    fill="url(#liveTokens)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card
          className="min-w-0 hover:shadow-lg hover:border-primary/30 transition-all"
          title="Model Stack"
          extra={<Clock size={16} className="text-primary" />}
          onClick={() => openModal('modelstack')}
          style={{ cursor: 'pointer' }}
        >
          {loading ? (
            <div className="h-56 flex items-center justify-center text-text-secondary">
              Loading...
            </div>
          ) : modelTimeline.series.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-text-secondary">
              No model stack data in the last {LIVE_WINDOW_MINUTES} minutes
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={modelTimeline.data}
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-glass)" />
                  <XAxis
                    dataKey="time"
                    stroke="var(--color-text-secondary)"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="var(--color-text-secondary)"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="var(--color-text-secondary)"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                    tickFormatter={(value) => formatNumber(Number(value || 0), 1)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-bg-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'var(--color-text)' }}
                    formatter={(value, name) => {
                      const numeric = Number(value || 0);
                      const label = modelTimeline.seriesLabelMap.get(String(name));
                      if (label) {
                        return [formatNumber(numeric, 0), label];
                      }
                      if (name === 'avgTtftMs') {
                        return [formatMs(numeric), 'Avg TTFT'];
                      }
                      if (name === 'avgTps') {
                        return [formatTPS(numeric), 'Avg TPS'];
                      }
                      return [formatNumber(numeric, 0), String(name)];
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value) => modelTimeline.seriesLabelMap.get(String(value)) || value}
                  />
                  {modelTimeline.series.map((series) => (
                    <Bar
                      key={series.key}
                      yAxisId="left"
                      stackId="model-stack"
                      dataKey={series.key}
                      fill={series.color}
                    />
                  ))}
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avgTtftMs"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avgTps"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card
          title="Latest Requests"
          onClick={() => openModal('requests')}
          style={{ cursor: 'pointer' }}
          className="hover:shadow-lg hover:border-primary/30 transition-all"
          extra={
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-secondary mr-1">Latest 20</span>
              <Button
                size="sm"
                variant={streamFilter === 'all' ? 'primary' : 'secondary'}
                onClick={() => setStreamFilter('all')}
              >
                All
              </Button>
              <Button
                size="sm"
                variant={streamFilter === 'success' ? 'primary' : 'secondary'}
                onClick={() => setStreamFilter('success')}
              >
                Success
              </Button>
              <Button
                size="sm"
                variant={streamFilter === 'error' ? 'primary' : 'secondary'}
                onClick={() => setStreamFilter('error')}
              >
                Errors
              </Button>
            </div>
          }
        >
          {filteredLiveRequests.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-text-secondary">
              {liveRequests.length === 0
                ? 'No requests observed yet.'
                : 'No requests match the current filter.'}
            </div>
          ) : (
            <div className="space-y-2 max-h-105 overflow-y-auto pr-1">
              {filteredLiveRequests.slice(0, 20).map((request) => {
                const requestTimeSeconds = Math.max(
                  0,
                  Math.floor((Date.now() - new Date(request.date).getTime()) / 1000)
                );
                const status = (request.responseStatus || 'errored').toLowerCase();
                const isSuccess = status.toLowerCase() === 'success';
                const providerLabel = getProviderLabel(request);
                const modelLabel = getModelLabel(request);
                return (
                  <div
                    key={request.requestId}
                    className="rounded-md border border-border-glass bg-bg-glass p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-text font-medium">{providerLabel}</span>
                        <span className="text-xs text-text-secondary">{modelLabel}</span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-md ${
                            isSuccess
                              ? 'text-success bg-emerald-500/15 border border-success/25'
                              : 'text-danger bg-red-500/15 border border-danger/30'
                          }`}
                        >
                          {status}
                        </span>
                      </div>
                      <span className="text-xs text-text-muted">
                        {formatTimeAgo(requestTimeSeconds)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                      <span>ID: {request.requestId.slice(0, 8)}...</span>
                      <span>
                        Tokens:{' '}
                        {formatTokens(
                          Number(request.tokensInput || 0) +
                            Number(request.tokensOutput || 0) +
                            Number(request.tokensCached || 0) +
                            Number(request.tokensCacheWrite || 0)
                        )}
                      </span>
                      <span>Cost: {formatCost(Number(request.costTotal || 0), 6)}</span>
                      <span>Latency: {formatMs(Number(request.durationMs || 0))}</span>
                      <span>TTFT: {formatMs(Number(request.ttftMs || 0))}</span>
                      <span>TPS: {formatTPS(Number(request.tokensPerSec || 0))}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Modal isOpen={modalOpen} onClose={closeModal} title={getModalTitle()}>
          {renderModalContent()}
        </Modal>
      </div>
    </div>
  );
};

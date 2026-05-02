import React from 'react';
import { RefreshCw } from 'lucide-react';
import { DashboardPage } from '../components/templates';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui-v2/card';
import { Button } from '../components/ui-v2/button';
import { LineChart } from '../components/charts';
import { MetricCard } from './dashboard/MetricCard';
import { RecentErrors } from './dashboard/RecentErrors';
import {
  useDashboardSummary,
  useRecentErrors,
  type TimeWindow,
} from '../hooks/queries/useDashboard';
import {
  formatCount,
  formatCountCompact,
  formatCostUsd,
  formatLatencyMs,
} from '../lib/format-design';
import { cn } from '../lib/cn';

const WINDOW_OPTIONS: { value: TimeWindow; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

const STORAGE_KEY = 'plexus.dashboard.window';

const readStoredWindow = (): TimeWindow => {
  if (typeof window === 'undefined') return '24h';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === '7d' || raw === '30d' ? raw : '24h';
};

export const Dashboard: React.FC = () => {
  const [timeWindow, setTimeWindow] = React.useState<TimeWindow>(() => readStoredWindow());

  React.useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, timeWindow);
  }, [timeWindow]);

  const summary = useDashboardSummary(timeWindow);
  const errors = useRecentErrors(5);

  const data = summary.data;
  const seriesPoints = data?.usageData ?? [];
  const totalRequests = parseInt(String(data?.stats[0]?.value ?? '0').replace(/[^\d]/g, ''), 10);
  const totalTokens = seriesPoints.reduce((acc, p) => acc + (p.tokens || 0), 0);
  const avgLatencyMs = (() => {
    const raw = data?.stats[3]?.value ?? '0';
    return parseInt(String(raw).replace(/[^\d]/g, ''), 10);
  })();
  const todayCost = data?.todayMetrics.totalCost ?? 0;

  const requestSpark = seriesPoints.slice(-24).map((p) => p.requests);
  const tokenSpark = seriesPoints.slice(-24).map((p) => p.tokens);

  return (
    <DashboardPage
      title="Dashboard"
      subtitle="Provider usage, performance, and recent errors at a glance."
      actions={
        <>
          <SegmentedWindow value={timeWindow} onChange={setTimeWindow} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => summary.refetch()}
            disabled={summary.isFetching}
            aria-label="Refresh"
          >
            <RefreshCw
              className={summary.isFetching ? 'animate-spin' : undefined}
              strokeWidth={1.75}
            />
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Requests"
          value={formatCount(totalRequests)}
          period={timeWindow}
          spark={requestSpark}
        />
        <MetricCard
          label="Tokens"
          value={formatCountCompact(totalTokens)}
          period={timeWindow}
          spark={tokenSpark}
        />
        <MetricCard label="Cost (today)" value={formatCostUsd(todayCost)} period="today" />
        <MetricCard label="Avg latency" value={formatLatencyMs(avgLatencyMs)} period={timeWindow} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request volume</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.isLoading ? (
            <div className="h-[240px] animate-pulse rounded-md bg-surface-elevated" />
          ) : (
            <LineChart
              data={seriesPoints}
              xKey="timestamp"
              series={[{ dataKey: 'requests', label: 'Requests' }]}
              formatValue={(v) => formatCount(v)}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent errors</CardTitle>
        </CardHeader>
        <CardContent>
          <RecentErrors errors={errors.data ?? []} loading={errors.isLoading} />
        </CardContent>
      </Card>
    </DashboardPage>
  );
};

const SegmentedWindow: React.FC<{
  value: TimeWindow;
  onChange: (v: TimeWindow) => void;
}> = ({ value, onChange }) => (
  <div
    role="radiogroup"
    aria-label="Time window"
    className="inline-flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5"
  >
    {WINDOW_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        type="button"
        role="radio"
        aria-checked={value === opt.value}
        onClick={() => onChange(opt.value)}
        className={cn(
          'inline-flex h-7 items-center rounded px-2.5 text-xs font-medium transition-colors',
          value === opt.value
            ? 'bg-accent-subtle text-accent'
            : 'text-foreground-muted hover:bg-surface-elevated hover:text-foreground'
        )}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

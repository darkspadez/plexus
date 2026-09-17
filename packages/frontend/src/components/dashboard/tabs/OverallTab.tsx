/**
 * @fileoverview OverallTab -- Dashboard overview for limited (api-key) users.
 *
 * This tab is only rendered for `isLimited` principals; admins have the full
 * Live / Usage / Performance tab set. It rolls the most useful per-key numbers
 * onto a single page so an api-key holder can answer "what am I allowed to use
 * and how much have I used?" without clicking between tabs.
 *
 * Data sources (all already force-scoped to the caller's key on the backend):
 *   - `getSelfMe`          → identity (key name, allowedProviders, allowedModels,
 *                             quota assignment, comment)
 *   - `getUsageSummary`    → aggregated totals plus grouped provider / model-alias
 *                             breakdowns for the selected time range, including a
 *                             custom start/end window
 *   - `getSelfQuota`       → per-quota progress for the caller's key
 *                             (`quotas[]`, most-constrained rendered first)
 *
 * Each source is fetched through its own React Query hook, so results are
 * cached and re-fetched independently. There is no polling; a refetch is
 * triggered by changing the time range (or the custom date window).
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Key, Layers, Boxes, Gauge, Activity, AlertTriangle, Users } from 'lucide-react';
import { api, type PieChartDataPoint, type QuotaStatusEntry } from '../../../lib/api';
import { formatNumber, formatTokens, formatCostIn, formatResetsIn } from '../../../lib/format';
import { useCurrency } from '../../../lib/CurrencyContext';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { QuotaProgressBar } from '../../quota/QuotaProgressBar';
import { TimeRangeSelector } from '../TimeRangeSelector';
import { Pill } from '../../chips/Pill';
import { statusForPercent, formatQuotaValue, sortMostConstrainedFirst } from '../../../lib/quota';
import type { CustomDateRange } from '../../../lib/date';
import { useSelfMe, useSelfQuota } from '../../../hooks/queries/useMyKey';

type TimeRange = 'hour' | 'day' | 'week' | 'month' | 'custom';

interface SelfInfo {
  role: 'admin' | 'limited';
  keyName?: string;
  allowedProviders?: string[];
  allowedModels?: string[];
  quotaNames?: string[];
  quotaName?: string | null;
  comment?: string | null;
}

interface SummaryStats {
  range: TimeRange;
  totalRequests: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  todayCost: number;
}

/**
 * Small helper to render a labeled metric "tile". Used throughout the token
 * summary card so each value has a consistent, glanceable layout.
 */
const Metric: React.FC<{ label: string; value: string; sub?: string }> = ({
  label,
  value,
  sub,
}) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs uppercase tracking-wide text-foreground-subtle">{label}</span>
    <span className="text-2xl font-semibold text-foreground leading-none">{value}</span>
    {sub && <span className="text-xs text-foreground-subtle">{sub}</span>}
  </div>
);

/**
 * Simple two-column list used for the provider/model breakdown cards. We
 * deliberately avoid a chart here because the Usage Analytics tab already has
 * pie charts — this tab's job is to give a dense, table-like roll-up.
 */
const BreakdownList: React.FC<{
  data: PieChartDataPoint[];
  emptyLabel: string;
  metric: 'requests' | 'tokens';
}> = ({ data, emptyLabel, metric }) => {
  if (!data.length) {
    return <EmptyState variant="fill" title={emptyLabel} />;
  }
  const total = data.reduce((sum, d) => sum + ((d[metric] as number) || 0), 0);
  const sorted = [...data].sort(
    (a, b) => ((b[metric] as number) || 0) - ((a[metric] as number) || 0)
  );
  return (
    <div className="space-y-2">
      {sorted.map((row) => {
        const value = (row[metric] as number) || 0;
        const pct = total > 0 ? (value / total) * 100 : 0;
        const display = metric === 'tokens' ? formatTokens(value) : formatNumber(value, 0);
        return (
          <div key={row.name}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground font-medium truncate" title={row.name}>
                {row.name}
              </span>
              <span className="text-foreground-subtle tabular-nums">
                {display}
                <span className="ml-2 text-xs text-foreground-subtle">({pct.toFixed(0)}%)</span>
              </span>
            </div>
            <div className="mt-1 h-1 w-full bg-surface-elevated rounded-full overflow-hidden">
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const OverallTab: React.FC = () => {
  const { currency, rate, symbol } = useCurrency();
  const [timeRange, setTimeRange] = useState<TimeRange>('day');
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange | null>(null);

  const selfMeQuery = useSelfMe();
  const selfQuotaQuery = useSelfQuota();

  const startDate = timeRange === 'custom' ? customDateRange?.start.toISOString() : undefined;
  const endDate = timeRange === 'custom' ? customDateRange?.end.toISOString() : undefined;

  // A single grouped summary call replaces separate provider/model-alias
  // fetches: `getUsageSummary` returns both the range totals and, when asked
  // for `breakdowns`, per-dimension roll-ups in the same response.
  const summaryQuery = useQuery({
    queryKey: ['usage-summary-overall', timeRange, startDate, endDate],
    queryFn: () =>
      api.getUsageSummary(timeRange, true, startDate, endDate, ['provider', 'modelAlias'], 10, [
        'directModels',
        'probe',
      ]),
    enabled: timeRange !== 'custom' || !!customDateRange,
  });

  const info = (selfMeQuery.data as SelfInfo | undefined) ?? null;
  const quotas: QuotaStatusEntry[] | null = selfQuotaQuery.isError
    ? null
    : (selfQuotaQuery.data?.quotas ?? null);
  const quotaError = selfQuotaQuery.isError;

  const providerData: PieChartDataPoint[] = (summaryQuery.data?.grouped?.provider?.items ?? []).map(
    (item) => ({
      name: item.name,
      requests: item.requests,
      tokens: item.totalTokens,
    })
  );
  const modelData: PieChartDataPoint[] = (summaryQuery.data?.grouped?.modelAlias?.items ?? [])
    .filter((item) => !item.name.startsWith('direct/'))
    .map((item) => ({
      name: item.name,
      requests: item.requests,
      tokens: item.totalTokens,
    }));

  const loading = selfMeQuery.isLoading || selfQuotaQuery.isLoading || summaryQuery.isLoading;

  const summary = useMemo<SummaryStats | null>(() => {
    const res = summaryQuery.data;
    if (!res) return null;
    const stats = res.stats;
    return {
      range: timeRange,
      totalRequests: stats.totalRequests,
      totalTokens: stats.totalTokens,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      reasoningTokens: stats.reasoningTokens,
      cachedTokens: stats.cachedTokens,
      cacheWriteTokens: stats.cacheWriteTokens,
      todayCost: res.today?.totalCost ?? 0,
    };
  }, [summaryQuery.data, timeRange]);

  const allowedProviders = info?.allowedProviders ?? [];
  const allowedModels = info?.allowedModels ?? [];

  return (
    <div className="p-3 sm:p-6 sm:pt-2 lg:p-8 lg:pt-2 transition-all duration-300 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-sans text-3xl font-bold text-foreground m-0 mb-2">Overall</h1>
          <p className="text-[15px] text-foreground-muted m-0">
            Access, usage, and quota summary for your API key.
          </p>
        </div>
        <TimeRangeSelector
          value={timeRange}
          onChange={(r) => {
            if (r !== 'all') {
              setTimeRange(r);
              if (r !== 'custom') setCustomDateRange(null);
            }
          }}
          customRange={customDateRange}
          onCustomRangeChange={setCustomDateRange}
          options={['hour', 'day', 'week', 'month', 'custom']}
        />
      </header>

      {/* -------- Row 1: Identity + Quota ------------------------------- */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}
      >
        <Card
          title="Key"
          extra={<Key size={16} className="text-foreground-subtle" />}
          className="min-w-0"
        >
          <dl className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex">
              <dt className="w-32 text-foreground-subtle">Name</dt>
              <dd className="font-mono text-foreground break-all">{info?.keyName || '—'}</dd>
            </div>
            <div className="flex">
              <dt className="w-32 text-foreground-subtle">Quota</dt>
              <dd className="text-foreground">
                {info?.quotaNames && info.quotaNames.length > 0
                  ? info.quotaNames.join(', ')
                  : info?.quotaName || 'None assigned'}
              </dd>
            </div>
            {info?.comment && (
              <div className="flex">
                <dt className="w-32 text-foreground-subtle">Comment</dt>
                <dd className="text-foreground">{info.comment}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card
          title="Quota"
          extra={<Gauge size={16} className="text-foreground-subtle" />}
          className="min-w-0"
        >
          {loading && !quotas && !quotaError ? (
            <p className="text-sm text-foreground-subtle">Loading…</p>
          ) : quotaError ? (
            <div className="flex items-start gap-2 text-sm text-warning">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                Could not load quota status. If this key has a quota assigned, its current usage is
                not shown here — try refreshing.
              </span>
            </div>
          ) : !quotas || quotas.length === 0 ? (
            <p className="text-sm text-foreground-subtle">
              No quota is assigned to this key — requests are unrestricted by quota policy.
            </p>
          ) : (
            <div className="space-y-4">
              {sortMostConstrainedFirst(quotas).map((q) => {
                const pct = q.limit > 0 ? Math.min(100, (q.currentUsage / q.limit) * 100) : 0;
                return (
                  <div key={q.name} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-foreground">{q.name}</span>
                      {q.source === 'default' && (
                        <Pill tone="neutral" size="sm" className="uppercase tracking-wider">
                          default
                        </Pill>
                      )}
                      {q.shared && (
                        <Pill tone="accent" size="sm" className="uppercase tracking-wider">
                          <Users size={10} /> shared
                        </Pill>
                      )}
                    </div>
                    <QuotaProgressBar
                      label={q.limitType}
                      value={q.currentUsage}
                      max={q.limit}
                      displayValue={`${formatQuotaValue(q.currentUsage, q.limitType)} / ${formatQuotaValue(q.limit, q.limitType)}`}
                      status={statusForPercent(pct)}
                      size="md"
                    />
                    <div className="flex items-center justify-between text-xs text-foreground-subtle">
                      <span>
                        Remaining:{' '}
                        <span className="text-foreground font-medium">
                          {formatQuotaValue(q.remaining, q.limitType)}
                        </span>
                      </span>
                      <span>Resets {formatResetsIn(q.resetsAt)}</span>
                    </div>
                    {!q.allowed && (
                      <div className="flex items-center gap-2 text-xs text-danger">
                        <AlertTriangle size={14} />
                        <span>
                          Quota exhausted — new requests will be rejected until it resets.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* -------- Row 2: Access (providers / models) -------------------- */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}
      >
        <Card
          title="Allowed providers"
          extra={<Layers size={16} className="text-foreground-subtle" />}
          className="min-w-0"
        >
          {allowedProviders.length === 0 ? (
            <p className="text-sm text-foreground-subtle">
              Any provider (unrestricted) — this key can route to every provider the gateway knows.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allowedProviders.map((p) => (
                <span
                  key={p}
                  className="px-2 py-1 text-xs font-mono rounded-md bg-surface-elevated border border-border text-foreground"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Allowed models"
          extra={<Boxes size={16} className="text-foreground-subtle" />}
          className="min-w-0"
        >
          {allowedModels.length === 0 ? (
            <p className="text-sm text-foreground-subtle">
              Any model (unrestricted) — this key can request every model alias configured on the
              gateway.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allowedModels.map((m) => (
                <span
                  key={m}
                  className="px-2 py-1 text-xs font-mono rounded-md bg-surface-elevated border border-border text-foreground"
                >
                  {m}
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* -------- Row 3: Token + request totals for selected range ------ */}
      <Card
        title={`Totals (${timeRange})`}
        extra={<Activity size={16} className="text-foreground-subtle" />}
      >
        {loading && !summary ? (
          <Skeleton height={120} className="w-full" />
        ) : !summary ? (
          <EmptyState variant="fill" title="No usage recorded in this range." />
        ) : (
          <div
            className="grid gap-6"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))' }}
          >
            <Metric label="Requests" value={formatNumber(summary.totalRequests, 0)} />
            <Metric label="Total tokens" value={formatTokens(summary.totalTokens)} />
            <Metric label="Input" value={formatTokens(summary.inputTokens)} />
            <Metric label="Output" value={formatTokens(summary.outputTokens)} />
            <Metric
              label="Cached"
              value={formatTokens(summary.cachedTokens)}
              sub="reads from cache"
            />
            <Metric
              label="Cache write"
              value={formatTokens(summary.cacheWriteTokens)}
              sub="new cache entries"
            />
            <Metric
              label="Cost (today)"
              value={formatCostIn(summary.todayCost, { currency, rate, symbol, decimals: 4 })}
              sub="attributed to this key"
            />
          </div>
        )}
      </Card>

      {/* -------- Row 4: Per-provider + per-model breakdown ------------- */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}
      >
        <Card title="Requests by provider" className="min-w-0">
          {loading && !providerData.length ? (
            <Skeleton height={180} className="w-full" />
          ) : (
            <BreakdownList
              data={providerData}
              emptyLabel="No requests recorded for any provider in this range."
              metric="requests"
            />
          )}
        </Card>

        <Card title="Tokens by provider" className="min-w-0">
          {loading && !providerData.length ? (
            <Skeleton height={180} className="w-full" />
          ) : (
            <BreakdownList
              data={providerData}
              emptyLabel="No tokens recorded for any provider in this range."
              metric="tokens"
            />
          )}
        </Card>

        <Card title="Requests by model alias" className="min-w-0">
          {loading && !modelData.length ? (
            <Skeleton height={180} className="w-full" />
          ) : (
            <BreakdownList
              data={modelData}
              emptyLabel="No requests recorded for any model alias in this range."
              metric="requests"
            />
          )}
        </Card>

        <Card title="Tokens by model alias" className="min-w-0">
          {loading && !modelData.length ? (
            <Skeleton height={180} className="w-full" />
          ) : (
            <BreakdownList
              data={modelData}
              emptyLabel="No tokens recorded for any model alias in this range."
              metric="tokens"
            />
          )}
        </Card>
      </div>
    </div>
  );
};

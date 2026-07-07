import { useMemo, useState } from 'react';
import { RefreshCw, Gauge, Wallet, Search } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuotaCheckers, useTriggerQuotaCheck } from '../hooks/queries/useQuotas';
import { Button } from '../components/ui/Button';
import { DataTable } from '../components/ui/DataTable';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import { StatusDot } from '../components/chips/StatusDot';
import type { Status } from '../lib/status-vocab';
import { formatMeterValue } from '../components/quota/MeterValue';
import { MeterHistoryModal } from '../components/quota/MeterHistoryModal';
import type { Meter, QuotaCheckerInfo } from '../types/quota';
import {
  buildQuotaTableRows,
  toVisibleRows,
  type QuotaRowSeverity,
  type QuotaTableRow,
  type VisibleQuotaTableRow,
} from './quotas/quota-table-rows';
import { cn } from '../lib/cn';

// Mirrors fromMeterStatus() in lib/status-vocab.ts for the four meter statuses,
// plus the two checker-level states that have no meter (error, pending).
// critical and exhausted intentionally share the same displayed status
// (Exceeded) — the design system doesn't distinguish them visually, only the
// internal sort rank does.
const SEVERITY_TO_STATUS: Record<QuotaRowSeverity, Status> = {
  exhausted: 'Exceeded',
  error: 'Error',
  critical: 'Exceeded',
  warning: 'Degraded',
  ok: 'Active',
  pending: 'Idle',
};

const BAR_COLOR_BY_SEVERITY: Record<QuotaRowSeverity, string> = {
  exhausted: 'bg-danger',
  error: 'bg-danger',
  critical: 'bg-danger',
  warning: 'bg-warning',
  ok: 'bg-success',
  pending: 'bg-foreground-subtle',
};

// Anti-alarm color budget: ok/pending rows stay neutral (no className), so the
// warning+ tint below actually pops instead of competing with a fully-colored
// row for every severity.
const ROW_TINT_BY_SEVERITY: Partial<Record<QuotaRowSeverity, string>> = {
  exhausted: 'border-l-2 border-l-danger bg-danger-subtle',
  error: 'border-l-2 border-l-danger bg-danger-subtle',
  critical: 'border-l-2 border-l-danger bg-danger-subtle',
  warning: 'border-l-2 border-l-warning bg-warning-subtle',
};

function periodLabel(meter: Meter): string {
  if (!meter.periodValue || !meter.periodUnit) return '';
  const cycle = meter.periodCycle === 'rolling' ? 'rolling' : 'fixed';
  const unit =
    meter.periodUnit === 'hour'
      ? 'h'
      : meter.periodUnit === 'day'
        ? 'd'
        : meter.periodUnit === 'minute'
          ? 'min'
          : meter.periodUnit === 'week'
            ? 'wk'
            : 'mo';
  return `${meter.periodValue}${unit} ${cycle}`;
}

function remainingValue(meter: Meter): number | undefined {
  if (meter.remaining !== undefined) return meter.remaining;
  if (meter.used !== undefined && meter.limit !== undefined) return meter.limit - meter.used;
  return undefined;
}

export const Quotas = () => {
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [historyTarget, setHistoryTarget] = useState<{
    quota: QuotaCheckerInfo;
    meter: Meter;
    displayName: string;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<QuotaRowSeverity | null>(null);

  const checkersQuery = useQuotaCheckers({ refetchInterval: 30_000 });
  const triggerCheckMutation = useTriggerQuotaCheck();

  const checkers: (QuotaCheckerInfo & { pending?: boolean })[] =
    checkersQuery.data?.configured ?? [];
  const displayNameMap = useMemo<Map<string, string>>(
    () => new Map((checkersQuery.data?.knownTypes ?? []).map((t) => [t.type, t.displayName])),
    [checkersQuery.data?.knownTypes]
  );
  const loading = checkersQuery.isLoading;

  const handleRefresh = (checkerId: string) => {
    setRefreshing((prev) => new Set(prev).add(checkerId));
    triggerCheckMutation.mutate(checkerId, {
      onSettled: () => {
        setRefreshing((prev) => {
          const next = new Set(prev);
          next.delete(checkerId);
          return next;
        });
      },
    });
  };

  const allRows = useMemo(
    () => buildQuotaTableRows(checkers, displayNameMap),
    [checkers, displayNameMap]
  );

  const severityCounts = useMemo(() => {
    const counts: Record<QuotaRowSeverity, number> = {
      exhausted: 0,
      error: 0,
      critical: 0,
      warning: 0,
      ok: 0,
      pending: 0,
    };
    for (const row of allRows) counts[row.severity]++;
    return counts;
  }, [allRows]);

  // "Needs attention" for the all-clear banner: anything above ok/pending
  // severity, including warning — warning rows are still amber-tinted in the
  // table body (ROW_TINT_BY_SEVERITY.warning), so the banner must not claim
  // full health while they're present.
  const needsAttentionCount =
    severityCounts.exhausted +
    severityCounts.error +
    severityCounts.critical +
    severityCounts.warning;

  // Data refetches every 30s (and after each per-checker refresh), so a
  // severity a user has filtered on can drop to a 0 count between renders —
  // at which point its chip stops rendering and there'd be no UI left to
  // clear the filter. Falling back to null the moment the count hits 0 keeps
  // the filter self-clearing instead of leaving the table stuck on an
  // unrepresentable, unclearable filter.
  const effectiveSeverityFilter =
    severityFilter && severityCounts[severityFilter] > 0 ? severityFilter : null;

  const hasActiveFilter = search.trim() !== '' || effectiveSeverityFilter !== null;

  const rows = useMemo<VisibleQuotaTableRow[]>(
    () => toVisibleRows(allRows, search, effectiveSeverityFilter),
    [allRows, search, effectiveSeverityFilter]
  );

  const toggleSeverityFilter = (severity: QuotaRowSeverity) => {
    setSeverityFilter((prev) => (prev === severity ? null : severity));
  };

  const columns = useMemo<ColumnDef<VisibleQuotaTableRow>[]>(
    () => [
      {
        id: 'provider',
        header: 'Provider',
        enableSorting: false,
        meta: { priority: 'high', mobileTitle: true },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className={cn(!r.visibleIsFirstInGroup && 'md:invisible')}>
              <div className="font-medium text-foreground">{r.displayName}</div>
              {(r.checkerType || r.oauthAccountId) && (
                <div className="text-xs text-foreground-subtle">
                  {r.checkerType}
                  {r.oauthAccountId && ` · ${r.oauthAccountId}`}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'meter',
        header: 'Meter',
        enableSorting: false,
        meta: { priority: 'high' },
        cell: ({ row }) => {
          const r = row.original;
          if (!r.meter) {
            if (r.pending) {
              return <span className="text-xs text-foreground-subtle">Pending first check...</span>;
            }
            if (r.checkerSuccess) {
              return <span className="text-xs text-foreground-subtle">No meters reported</span>;
            }
            return (
              <span className="line-clamp-1 text-xs text-foreground-subtle" title={r.checkerError}>
                {r.checkerError || 'Check failed'}
              </span>
            );
          }
          const period = periodLabel(r.meter);
          return (
            <div className="flex items-center gap-1.5">
              {r.meter.kind === 'balance' ? (
                <Wallet size={12} className="shrink-0 text-info" />
              ) : (
                <Gauge size={12} className="shrink-0 text-accent" />
              )}
              <span className="text-foreground">{r.meter.label}</span>
              {period && <span className="text-xs text-foreground-subtle">{period}</span>}
            </div>
          );
        },
      },
      {
        id: 'remaining',
        header: 'Remaining',
        enableSorting: false,
        meta: { priority: 'high', align: 'right' },
        cell: ({ row }) => {
          const m = row.original.meter;
          const value = m ? remainingValue(m) : undefined;
          if (!m || value === undefined) return <span className="text-foreground-subtle">—</span>;
          return (
            <span className="tabular-nums text-foreground">
              {formatMeterValue(value, m.unit, true)}
            </span>
          );
        },
      },
      {
        id: 'usedLimit',
        header: 'Used / Limit',
        enableSorting: false,
        meta: { priority: 'medium', align: 'right' },
        cell: ({ row }) => {
          const m = row.original.meter;
          if (!m) return <span className="text-foreground-subtle">—</span>;
          const used = m.used !== undefined ? formatMeterValue(m.used, m.unit, true) : '—';
          const limit = m.limit !== undefined ? formatMeterValue(m.limit, m.unit, true) : '—';
          return (
            <span className="tabular-nums text-xs text-foreground-muted">
              {used} / {limit}
            </span>
          );
        },
      },
      {
        id: 'usage',
        header: 'Usage',
        enableSorting: false,
        meta: { priority: 'medium' },
        cell: ({ row }) => {
          const r = row.original;
          const pct =
            r.meter && typeof r.meter.utilizationPercent === 'number'
              ? r.meter.utilizationPercent
              : null;
          if (pct === null) return <span className="text-foreground-subtle">—</span>;
          const clamped = Math.max(0, Math.min(100, pct));
          return (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full border border-border/30 bg-surface-sunken">
                <div
                  className={cn('h-full rounded-full', BAR_COLOR_BY_SEVERITY[r.severity])}
                  style={{ width: `${clamped}%` }}
                />
              </div>
              <span className="tabular-nums text-xs text-foreground-muted">
                {Math.round(clamped)}%
              </span>
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        meta: { priority: 'high' },
        cell: ({ row }) => <StatusDot status={SEVERITY_TO_STATUS[row.original.severity]} />,
      },
      {
        id: 'refresh',
        header: '',
        enableSorting: false,
        meta: { priority: 'low', widthClass: 'w-10' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRefresh(r.checkerId);
              }}
              disabled={refreshing.has(r.checkerId) || r.pending}
              aria-label="Refresh"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground-subtle transition-colors hover:bg-surface-elevated hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw size={14} className={cn(refreshing.has(r.checkerId) && 'animate-spin')} />
            </button>
          );
        },
      },
    ],
    [refreshing]
  );

  const handleRowClick = (row: QuotaTableRow) => {
    if (!row.meter) return;
    setHistoryTarget({
      quota: {
        checkerId: row.checkerId,
        checkerType: row.checkerType,
        success: row.checkerSuccess,
        error: row.checkerError,
        meters: [row.meter],
        oauthAccountId: row.oauthAccountId,
      },
      meter: row.meter,
      displayName: row.displayName,
    });
  };

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Quotas"
        subtitle="Provider balances and rate-quota allowances"
        actions={
          <Button
            variant="secondary"
            size="md"
            onClick={() => checkersQuery.refetch()}
            disabled={loading}
            leftIcon={<RefreshCw size={14} className={cn(loading && 'animate-spin')} />}
          >
            Refresh all
          </Button>
        }
      />

      <PageContainer>
        {loading && checkers.length === 0 ? (
          <div className="flex h-64 items-center justify-center gap-3">
            <RefreshCw size={20} className="animate-spin text-accent" />
            <span className="text-foreground-muted">Loading quotas...</span>
          </div>
        ) : (
          <DataTable<VisibleQuotaTableRow>
            columns={columns}
            data={rows}
            getRowId={(row) => row.rowId}
            getRowKey={(row) => row.rowId}
            onRowClick={handleRowClick}
            rowClassName={(row) => ROW_TINT_BY_SEVERITY[row.severity] ?? ''}
            emptyIcon={<Gauge />}
            emptyTitle={hasActiveFilter ? 'No matching meters' : 'No quota checkers yet'}
            emptyDescription={
              hasActiveFilter
                ? 'Try a different search term or clear the severity filter.'
                : 'Configure quota checkers in your provider settings to monitor usage.'
            }
            headerSlot={
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  {needsAttentionCount === 0 ? (
                    <span className="text-xs text-foreground-subtle">
                      All {severityCounts.ok} meters healthy
                    </span>
                  ) : (
                    (['exhausted', 'error', 'critical', 'warning', 'ok', 'pending'] as const)
                      .filter((severity) => severityCounts[severity] > 0)
                      .map((severity) => (
                        <button
                          key={severity}
                          type="button"
                          onClick={() => toggleSeverityFilter(severity)}
                          aria-pressed={effectiveSeverityFilter === severity}
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-xs transition-colors',
                            effectiveSeverityFilter === severity
                              ? 'border-accent bg-accent-subtle text-accent'
                              : 'border-border text-foreground-muted hover:bg-surface-elevated'
                          )}
                        >
                          {severityCounts[severity]} {severity}
                        </button>
                      ))
                  )}
                </div>
                <div className="relative">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-foreground-subtle"
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    aria-label="Search meters"
                    className="h-8 w-40 rounded-md border border-border bg-surface pl-7 pr-2 text-xs text-foreground placeholder:text-foreground-subtle focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>
            }
          />
        )}
        {historyTarget && (
          <MeterHistoryModal
            isOpen
            onClose={() => setHistoryTarget(null)}
            quota={historyTarget.quota}
            meter={historyTarget.meter}
            displayName={historyTarget.displayName}
          />
        )}
      </PageContainer>
    </div>
  );
};

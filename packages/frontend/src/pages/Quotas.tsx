import { useMemo, useState } from 'react';
import { RefreshCw, Gauge, Wallet, CornerDownRight } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  useQuotaCheckers,
  useTriggerQuotaCheck,
  useTriggerAllQuotaChecks,
} from '../hooks/queries/useQuotas';
import { Button } from '../components/ui/Button';
import { DataTable } from '../components/ui/DataTable';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import { formatMeterValue } from '../components/quota/MeterValue';
import { MeterHistoryModal } from '../components/quota/MeterHistoryModal';
import type { Meter, QuotaCheckerInfo } from '../types/quota';
import {
  buildQuotaTableRows,
  type QuotaRowSeverity,
  type QuotaTableRow,
} from './quotas/quota-table-rows';
import {
  SEVERITY_ACCENT_CLASS,
  SEVERITY_BAR_CLASS,
  SEVERITY_DOT_CLASS,
  SEVERITY_LABEL,
  SEVERITY_TRACK_CLASS,
} from './quotas/severity';
import {
  allowanceSubtext,
  checkedAgoLabel,
  remainingValue,
  usagePercent,
  usedLimitText,
} from './quotas/quota-format';
import { cn } from '../lib/cn';

const SeverityBadge = ({ severity }: { severity: QuotaRowSeverity }) => (
  <span className="inline-flex items-center gap-2">
    <span
      aria-hidden
      className={cn('inline-block size-2 shrink-0 rounded-full', SEVERITY_DOT_CLASS[severity])}
    />
    <span className="text-sm font-medium text-foreground">{SEVERITY_LABEL[severity]}</span>
  </span>
);

/**
 * Refresh-trigger button for one provider row — shared by the desktop
 * "refresh" column cell and the mobile card's `mobileActions` slot. Kept
 * module-level (not nested inside `Quotas`) so its component identity is
 * stable across renders instead of remounting every row's button on every
 * Quotas re-render (see DataTable.tsx's ExpanderCell comment for the same
 * concern with per-render component identity).
 */
function RowRefreshButton({
  row,
  refreshing,
  onRefresh,
}: {
  row: QuotaTableRow;
  refreshing: Set<string>;
  onRefresh: (checkerId: string) => void;
}) {
  const isRefreshing = refreshing.has(row.checkerId);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRefresh(row.checkerId);
      }}
      disabled={isRefreshing || row.pending}
      aria-label={`Refresh ${row.displayName}`}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground-subtle transition-colors hover:bg-surface-elevated hover:text-foreground disabled:opacity-50"
    >
      <RefreshCw size={14} className={cn(isRefreshing && 'animate-spin')} />
    </button>
  );
}

export const Quotas = () => {
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [historyTarget, setHistoryTarget] = useState<{
    quota: QuotaCheckerInfo;
    meter: Meter;
    displayName: string;
  } | null>(null);

  const checkersQuery = useQuotaCheckers({ refetchInterval: 30_000 });
  const triggerCheckMutation = useTriggerQuotaCheck();
  const triggerAllMutation = useTriggerAllQuotaChecks();

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

  // Pending checkers are excluded -- their per-row buttons are disabled for
  // the same reason (no configured checker to force-recheck yet).
  const handleRefreshAll = () => {
    const ids = checkers.filter((c) => !c.pending).map((c) => c.checkerId);
    if (ids.length === 0) return;
    setRefreshing((prev) => new Set([...prev, ...ids])); // every affected row spins
    triggerAllMutation.mutate(ids, {
      // Spinners clear together, not per-checker: rows don't have fresh data
      // until the single invalidation-triggered refetch lands, so clearing
      // any one row's spinner earlier would misleadingly signal freshness.
      onSettled: () =>
        setRefreshing((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        }),
    });
  };

  const rows = useMemo(
    () => buildQuotaTableRows(checkers, displayNameMap),
    [checkers, displayNameMap]
  );

  const columns = useMemo<ColumnDef<QuotaTableRow>[]>(
    () => [
      {
        id: 'provider',
        header: 'Provider',
        enableSorting: false,
        meta: { priority: 'high', mobileTitle: true },
        cell: ({ row }) => {
          const r = row.original;
          const subtextParts = [r.oauthAccountId, checkedAgoLabel(r.checkedAt)].filter(
            (p): p is string => Boolean(p)
          );
          const nameBlock = (
            <>
              <div className="truncate font-medium text-foreground" title={r.displayName}>
                {r.displayName}
              </div>
              {subtextParts.length > 0 && (
                <div className="text-xs text-foreground-subtle">{subtextParts.join(' · ')}</div>
              )}
            </>
          );
          if (!r.isFirstInGroup) {
            return (
              <div>
                {/* desktop: indent + branch connector marks "same provider, continued" */}
                <div className="hidden md:flex items-center pl-3 text-foreground-subtle">
                  <CornerDownRight size={14} className="shrink-0" aria-hidden />
                </div>
                {/* mobile: each card stays self-labeled with the provider name */}
                <div className="md:hidden">{nameBlock}</div>
              </div>
            );
          }
          return <div>{nameBlock}</div>;
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
          const subtext = allowanceSubtext(r.meter);
          return (
            <div>
              <div className="flex items-center gap-1.5">
                {r.meter.kind === 'balance' ? (
                  <Wallet size={12} className="shrink-0 text-info" />
                ) : (
                  <Gauge size={12} className="shrink-0 text-accent" />
                )}
                <span className="truncate text-foreground" title={r.meter.label}>
                  {r.meter.label}
                </span>
              </div>
              {subtext && <div className="text-xs text-foreground-subtle">{subtext}</div>}
            </div>
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
          const pct = usagePercent(r.meter);
          const usedLimit = usedLimitText(r.meter);
          return (
            <div>
              {pct === null ? (
                <span className="text-foreground-subtle">—</span>
              ) : (
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'h-1.5 w-12 shrink-0 overflow-hidden rounded-full',
                      SEVERITY_TRACK_CLASS[r.severity]
                    )}
                  >
                    <div
                      className={cn('h-full rounded-full', SEVERITY_BAR_CLASS[r.severity])}
                      style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-xs text-foreground-muted">
                    {Math.round(pct)}%
                  </span>
                </div>
              )}
              {usedLimit && (
                <div className="tabular-nums text-xs text-foreground-subtle">{usedLimit}</div>
              )}
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
          if (!m || value === undefined) {
            return <span className="text-foreground-subtle">—</span>;
          }
          return (
            <span className="text-sm font-medium tabular-nums text-foreground">
              {formatMeterValue(value, m.unit, true)}
            </span>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        meta: { priority: 'high' },
        cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
      },
      {
        id: 'refresh',
        header: '',
        enableSorting: false,
        meta: { priority: 'low', widthClass: 'w-10' },
        cell: ({ row }) => (
          <RowRefreshButton row={row.original} refreshing={refreshing} onRefresh={handleRefresh} />
        ),
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
        checkedAt: row.checkedAt,
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
            onClick={handleRefreshAll}
            disabled={triggerAllMutation.isPending || checkers.length === 0}
            leftIcon={
              <RefreshCw size={14} className={cn(triggerAllMutation.isPending && 'animate-spin')} />
            }
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
          <DataTable<QuotaTableRow>
            columns={columns}
            data={rows}
            getRowId={(row) => row.rowId}
            getRowKey={(row) => row.rowId}
            onRowClick={handleRowClick}
            rowClassName={(row) =>
              cn(
                SEVERITY_ACCENT_CLASS[row.severity],
                row.showGroupRule && 'md:border-t-2 md:border-t-border-strong'
              )
            }
            mobileActions={(row) => (
              <RowRefreshButton row={row} refreshing={refreshing} onRefresh={handleRefresh} />
            )}
            emptyIcon={<Gauge />}
            emptyTitle="No quota checkers yet"
            emptyDescription="Configure quota checkers in your provider settings to monitor usage."
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

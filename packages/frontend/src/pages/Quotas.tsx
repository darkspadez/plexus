import React from 'react';
import { Gauge, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '../components/templates';
import { Button } from '../components/ui-v2/button';
import { Skeleton } from '../components/ui-v2/skeleton';
import { Pill } from '../components/chips/Pill';
import { flattenQuotas, QuotaTable, type QuotaRow } from './quotas/QuotaTable';
import { useQuotas, useTriggerQuotaCheck } from '../hooks/queries/useQuotas';
import { MeterHistoryModal } from '../components/quota/MeterHistoryModal';
import type { Meter, QuotaCheckerInfo } from '../types/quota';

type Filter = 'all' | 'balance' | 'allowance';

interface HistoryTarget {
  quota: QuotaCheckerInfo;
  meter: Meter;
  displayName: string;
}

const TableSkeleton: React.FC = () => (
  <div className="overflow-hidden rounded-lg border border-border bg-surface">
    <div className="space-y-1 p-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  </div>
);

export const Quotas: React.FC = () => {
  const { data: quotas, isLoading, isError, refetch, isFetching } = useQuotas();
  const triggerCheck = useTriggerQuotaCheck();
  const [filter, setFilter] = React.useState<Filter>('all');
  const [refreshing, setRefreshing] = React.useState<Set<string>>(new Set());
  const [historyTarget, setHistoryTarget] = React.useState<HistoryTarget | null>(null);

  const allRows = React.useMemo(() => (quotas ? flattenQuotas(quotas) : []), [quotas]);

  const visibleRows = React.useMemo(
    () => (filter === 'all' ? allRows : allRows.filter((r) => r.meter.kind === filter)),
    [allRows, filter]
  );

  const handleRefresh = React.useCallback(
    async (checkerId: string) => {
      setRefreshing((prev) => new Set(prev).add(checkerId));
      try {
        const result = await triggerCheck.mutateAsync(checkerId);
        if (!result) toast.error('Refresh failed');
      } catch {
        toast.error('Refresh failed');
      } finally {
        setRefreshing((prev) => {
          const next = new Set(prev);
          next.delete(checkerId);
          return next;
        });
      }
    },
    [triggerCheck]
  );

  const handleRowClick = React.useCallback((row: QuotaRow) => {
    setHistoryTarget({
      quota: row.quota,
      meter: row.meter,
      displayName: row.displayName,
    });
  }, []);

  const balanceCount = allRows.filter((r) => r.meter.kind === 'balance').length;
  const allowanceCount = allRows.filter((r) => r.meter.kind === 'allowance').length;

  return (
    <ListPage
      title="Quotas"
      subtitle="Provider balances, allowances, and rate-limit headroom."
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? 'animate-spin' : undefined} strokeWidth={1.75} />
          Refresh
        </Button>
      }
      filters={
        <>
          <FilterChip
            label={`All (${allRows.length})`}
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          />
          <FilterChip
            label={`Balance (${balanceCount})`}
            active={filter === 'balance'}
            onClick={() => setFilter('balance')}
          />
          <FilterChip
            label={`Allowance (${allowanceCount})`}
            active={filter === 'allowance'}
            onClick={() => setFilter('allowance')}
          />
        </>
      }
    >
      {isError ? (
        <ErrorCard onRetry={() => refetch()} />
      ) : isLoading ? (
        <TableSkeleton />
      ) : visibleRows.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <QuotaTable
          rows={visibleRows}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onRowClick={handleRowClick}
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
    </ListPage>
  );
};

const FilterChip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={
      active
        ? 'inline-flex items-center rounded-full bg-accent-subtle px-3 py-1 text-xs font-medium text-accent'
        : 'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-foreground-muted hover:bg-surface-elevated hover:text-foreground'
    }
  >
    {label}
  </button>
);

const EmptyState: React.FC<{ filter: Filter }> = ({ filter }) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface px-6 py-16 text-center">
    <Gauge className="size-6 text-foreground-subtle" strokeWidth={1.5} />
    <h2 className="text-base font-medium text-foreground">
      {filter === 'all' ? 'No quota checkers configured' : `No ${filter} quotas`}
    </h2>
    <p className="max-w-sm text-sm text-foreground-muted">
      Configure quota checkers in your provider settings to monitor usage.
    </p>
  </div>
);

const ErrorCard: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="rounded-lg border border-danger/40 bg-danger-subtle px-4 py-3">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-danger">Failed to load quotas</p>
        <p className="mt-0.5 text-xs text-foreground-muted">
          The backend rejected the request. Check your admin key.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
    <Pill tone="danger" size="sm" className="mt-2">
      API error
    </Pill>
  </div>
);

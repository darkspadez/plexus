import { useState, useMemo } from 'react';
import { RefreshCw, Cpu, Gauge, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { useQuotaCheckers, useTriggerQuotaCheck } from '../hooks/queries/useQuotas';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import type { QuotaCheckerInfo, Meter } from '../types/quota';
import { CombinedBalancesCard } from '../components/quota/CombinedBalancesCard';
import { AllowanceMeterRow } from '../components/quota/AllowanceMeterRow';
import { MeterHistoryModal } from '../components/quota/MeterHistoryModal';
import { getCheckerDisplayName } from '../components/quota/checker-presentation';

export const Quotas = () => {
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [historyTarget, setHistoryTarget] = useState<{
    quota: QuotaCheckerInfo;
    meter: Meter;
    displayName: string;
  } | null>(null);

  const checkersQuery = useQuotaCheckers({ refetchInterval: 30_000 });
  const triggerCheckMutation = useTriggerQuotaCheck();

  const quotas: (QuotaCheckerInfo & { pending?: boolean })[] = checkersQuery.data?.configured ?? [];
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

  const balanceQuotas = useMemo(
    () => quotas.filter((q) => q.pending || q.meters.some((m) => m.kind === 'balance')),
    [quotas]
  );

  const allowanceQuotas = useMemo(
    () => quotas.filter((q) => q.pending || q.meters.some((m) => m.kind === 'allowance')),
    [quotas]
  );

  // Group allowance quotas by checkerType for display
  const allowanceGroups = useMemo(() => {
    const groups: Record<string, (QuotaCheckerInfo & { pending?: boolean })[]> = {};
    for (const quota of allowanceQuotas) {
      const key = quota.checkerType || quota.checkerId;
      if (!groups[key]) groups[key] = [];
      groups[key].push(quota);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [allowanceQuotas]);

  const renderCheckerCard = (
    quota: QuotaCheckerInfo & { pending?: boolean },
    _groupDisplayName: string
  ) => {
    const allowances = quota.meters.filter((m) => m.kind === 'allowance');

    return (
      <div
        key={quota.checkerId}
        className="relative rounded-lg border border-border bg-surface-elevated/60 p-4"
      >
        <button
          type="button"
          onClick={() => handleRefresh(quota.checkerId)}
          disabled={refreshing.has(quota.checkerId) || quota.pending}
          aria-label="Refresh"
          className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground-subtle hover:bg-surface-elevated hover:text-foreground transition-colors duration-fast disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            className={clsx((refreshing.has(quota.checkerId) || quota.pending) && 'animate-spin')}
          />
        </button>

        <div className="pr-8">
          {quota.pending ? (
            <span className="text-xs text-foreground-subtle">Pending first check...</span>
          ) : !quota.success ? (
            <div className="flex items-center gap-2 text-danger">
              <AlertTriangle size={14} />
              <span className="text-xs">Check failed</span>
              {quota.error && (
                <span className="text-xs text-foreground-subtle truncate">{quota.error}</span>
              )}
            </div>
          ) : allowances.length === 0 ? (
            <span className="text-xs text-foreground-subtle">No data yet</span>
          ) : (
            <div className="space-y-2">
              {allowances.map((meter) => (
                <AllowanceMeterRow
                  key={meter.key}
                  meter={meter}
                  onClick={() =>
                    setHistoryTarget({
                      quota,
                      meter,
                      displayName: _groupDisplayName,
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Quotas"
        subtitle="Provider balances and rate-quota allowances"
        actions={
          <Button
            variant="secondary"
            size="md"
            onClick={() => checkersQuery.refetch()}
            disabled={loading}
            leftIcon={<RefreshCw size={14} className={clsx(loading && 'animate-spin')} />}
          >
            Refresh all
          </Button>
        }
      />

      <PageContainer>
        {loading && quotas.length === 0 ? (
          <div className="flex items-center justify-center h-64 gap-3">
            <RefreshCw size={20} className="animate-spin text-accent" />
            <span className="text-foreground-muted">Loading quotas...</span>
          </div>
        ) : quotas.length === 0 ? (
          <Card>
            <EmptyState
              variant="dense"
              icon={<Gauge />}
              title="No quota checkers yet"
              description="Configure quota checkers in your provider settings to monitor usage."
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            {balanceQuotas.length > 0 && (
              <section>
                <CombinedBalancesCard
                  balanceQuotas={balanceQuotas}
                  onRefresh={handleRefresh}
                  refreshing={refreshing}
                  displayNameMap={displayNameMap}
                />
              </section>
            )}

            {allowanceGroups.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
                  <Cpu size={18} className="text-accent" />
                  <h2 className="font-sans text-h2 font-semibold text-foreground">Rate Limits</h2>
                </div>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {allowanceGroups.map(([checkerType, quotasList]) => {
                    const displayName = getCheckerDisplayName(
                      checkerType,
                      quotasList[0]?.checkerId ?? checkerType,
                      displayNameMap
                    );
                    return (
                      <div key={checkerType} className="flex flex-col gap-3">
                        <h3 className="font-sans text-xs font-semibold text-foreground-muted uppercase tracking-wider px-1 border-b border-border pb-2">
                          {displayName}
                        </h3>
                        <div className="flex flex-col gap-3">
                          {quotasList.map((quota) => renderCheckerCard(quota, displayName))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
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

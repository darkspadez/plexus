import React, { useEffect, useState } from 'react';
import { api, KeyConfig, UserQuota, QuotaStatusEntry } from '../lib/api';
import { SearchInput } from '../components/ui/SearchInput';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import { useToast } from '../contexts/ToastContext';
import { DataTable } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { Disclosure } from '../components/ui/Disclosure';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Key,
  Plus,
  Trash2,
  Edit2,
  Copy,
  RefreshCw,
  Check,
  Shield,
  AlertCircle,
  BarChart3,
  Wrench,
  Users,
  Info,
  Ban,
} from 'lucide-react';
import { SECTION_NAMES } from '../lib/nav';
import { isClipboardAvailable, copyToClipboard } from '../lib/clipboard';
import { statusForPercent, formatQuotaValue, sortMostConstrainedFirst } from '../lib/quota';
import { formatExpiry } from '../lib/format';
import { QuotaProgressBar } from '../components/quota/QuotaProgressBar';
import {
  useApiKeys,
  useKeysProviderIds,
  useKeysAliasIds,
  useDeleteKey,
  useDisableKey,
  useClearQuota,
  useRecomputeQuota,
  useDefaultQuotaNames,
} from '../hooks/queries/useKeys';
import { useUserQuotas } from '../hooks/queries/useUserQuotas';
import { Pill } from '../components/chips/Pill';
import { cn } from '../lib/cn';
import { KeySheet } from './keys/KeySheet';

// Response shape of `GET /v0/management/quota/status/:key` — kept in sync
// with `lib/api.ts`'s `getQuotaStatus` return type rather than duplicated by
// hand.
type QuotaStatusResponse = NonNullable<Awaited<ReturnType<typeof api.getQuotaStatus>>>;

/** A rolling requests/tokens def is inherently leaky (usage isn't stored
 * per-request in a recomputable way) — recompute is refused backend-side
 * for these. Mirrors `QuotaEnforcer.recomputeQuota`'s guard. */
function isLeakyRollingDef(def: UserQuota | undefined): boolean {
  if (!def) return false;
  return def.type === 'rolling' && (def.limitType === 'requests' || def.limitType === 'tokens');
}

/** The entry with the smallest remaining/limit ratio — mirrors the backend's
 * `mostConstrained` helper used for the legacy single-quota shim fields.
 * A `limit === 0` entry is treated as fully constrained (ratio 0). */
function mostConstrainedEntry(entries: QuotaStatusEntry[]): QuotaStatusEntry | null {
  if (entries.length === 0) return null;
  const ratio = (e: QuotaStatusEntry) => (e.limit > 0 ? e.remaining / e.limit : 0);
  return entries.reduce((min, c) => (ratio(c) < ratio(min) ? c : min));
}

function entryUsagePercent(entry: QuotaStatusEntry): number {
  if (!entry.limit || entry.limit === 0) return 0;
  return Math.min(100, (entry.currentUsage / entry.limit) * 100);
}

function hasScope(scope: QuotaStatusEntry['scope'] | undefined): boolean {
  if (!scope) return false;
  return Boolean(
    scope.allowedProviders?.length ||
      scope.excludedProviders?.length ||
      scope.allowedModels?.length ||
      scope.excludedModels?.length
  );
}

export const Keys = () => {
  const toast = useToast();
  const { data: keys = [] } = useApiKeys();
  const { data: quotas = {} } = useUserQuotas();
  const { data: providerIds = [] } = useKeysProviderIds();
  const { data: aliasIds = [] } = useKeysAliasIds();
  const { data: defaultQuotaNames = [] } = useDefaultQuotaNames();
  const deleteKeyMutation = useDeleteKey();
  const disableKeyMutation = useDisableKey();
  const clearQuotaMutation = useClearQuota();
  const recomputeQuotaMutation = useRecomputeQuota();

  const [quotaStatuses, setQuotaStatuses] = useState<Record<string, QuotaStatusResponse>>({});
  const [search, setSearch] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Key Sheet State
  const [isKeySheetOpen, setIsKeySheetOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<KeyConfig | null>(null);
  const [originalKeyName, setOriginalKeyName] = useState<string | null>(null);

  // Quota Detail Modal State
  const [isQuotaDetailOpen, setIsQuotaDetailOpen] = useState(false);
  const [selectedQuotaName, setSelectedQuotaName] = useState<string | null>(null);
  const [selectedQuotaStatus, setSelectedQuotaStatus] = useState<QuotaStatusResponse | null>(null);

  // Load quota status only for keys that can actually resolve quota entries:
  // keys with assigned `quotas`, or — when `default_quotas` is set — every
  // key (bare keys inherit the defaults). Returns the refreshed map so
  // callers (reset / recompute / default-quotas handlers) can reuse it for
  // the open detail modal without a second `getQuotaStatus` round trip.
  const loadQuotaStatuses = React.useCallback(async (): Promise<Record<
    string,
    QuotaStatusResponse
  > | null> => {
    try {
      const eligible = keys.filter(
        (key) => (key.quotas?.length ?? 0) > 0 || defaultQuotaNames.length > 0
      );
      const statuses: Record<string, QuotaStatusResponse> = {};
      await Promise.all(
        eligible.map(async (key) => {
          try {
            const status = await api.getQuotaStatus(key.key);
            if (status) {
              statuses[key.key] = status;
            }
          } catch (e) {
            console.error(`Failed to load quota status for ${key.key}`, e);
          }
        })
      );
      setQuotaStatuses(statuses);
      return statuses;
    } catch (e) {
      console.error('Failed to load quota statuses', e);
      return null;
    }
  }, [keys, defaultQuotaNames]);

  // Re-run whenever keys, quota definitions, or the default-quotas list
  // refresh (react-query hands back a new reference whenever any of these
  // queries actually refetch with different content, thanks to structural
  // sharing) — covers quota (re)assignment, definition edits (e.g. limit
  // changes), and default_quotas toggling in one place.
  useEffect(() => {
    loadQuotaStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, quotas, defaultQuotaNames]);

  // Key Handlers
  const handleEditKey = (key: KeyConfig) => {
    setOriginalKeyName(key.key);
    setEditingKey({ ...key });
    setIsKeySheetOpen(true);
  };

  const handleAddNewKey = () => {
    setOriginalKeyName(null);
    setEditingKey(null);
    setIsKeySheetOpen(true);
  };

  const handleDisableKey = async (key: KeyConfig) => {
    const confirmed = await toast.confirm({
      title: 'Disable key?',
      message: `Disable '${key.key}' immediately? This cannot be undone.`,
      confirmLabel: 'Disable',
      variant: 'danger',
    });
    if (!confirmed) return;
    disableKeyMutation.mutate(key.key);
  };

  const handleDeleteKey = async (keyName: string) => {
    const _ok = await toast.confirm({
      title: 'Delete key?',
      message: `Are you sure you want to delete key '${keyName}'? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!_ok) return;

    deleteKeyMutation.mutate(keyName);
  };

  const handleClearQuota = async (keyName: string, quotaName?: string) => {
    const _okr = await toast.confirm({
      title: 'Reset quota?',
      message: quotaName
        ? `Reset usage for quota '${quotaName}' on key '${keyName}'?`
        : `Reset usage for every quota attached to key '${keyName}'?`,
      confirmLabel: 'Reset',
    });
    if (!_okr) return;

    clearQuotaMutation.mutate(
      { keyName, quotaName },
      {
        onSuccess: async () => {
          // Keep the detail modal open (if open) showing fresh numbers,
          // reusing the status the refresh just fetched instead of a second
          // round trip.
          const statuses = await loadQuotaStatuses();
          if (selectedQuotaName === keyName && statuses?.[keyName]) {
            setSelectedQuotaStatus(statuses[keyName]);
          }
        },
      }
    );
  };

  const handleRecomputeQuota = (keyName: string, quotaName: string) => {
    recomputeQuotaMutation.mutate(
      { keyName, quotaName },
      {
        onSuccess: async () => {
          toast.success(`Quota '${quotaName}' recomputed`);
          const statuses = await loadQuotaStatuses();
          if (selectedQuotaName === keyName && statuses?.[keyName]) {
            setSelectedQuotaStatus(statuses[keyName]);
          }
        },
      }
    );
  };

  const handleViewQuotaStatus = (keyName: string) => {
    const status = quotaStatuses[keyName];
    if (status) {
      setSelectedQuotaName(keyName);
      setSelectedQuotaStatus(status);
      setIsQuotaDetailOpen(true);
    }
  };

  const handleCopy = async (text: string, keyId: string) => {
    if (!isClipboardAvailable()) return;
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedKey(keyId);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const filteredKeys = keys.filter(
    (k) =>
      k.key.toLowerCase().includes(search.toLowerCase()) ||
      (k.comment && k.comment.toLowerCase().includes(search.toLowerCase())) ||
      k.quotas?.some((name) => name.toLowerCase().includes(search.toLowerCase())) ||
      k.allowedModels?.some((model) => model.toLowerCase().includes(search.toLowerCase())) ||
      k.allowedProviders?.some((provider) =>
        provider.toLowerCase().includes(search.toLowerCase())
      ) ||
      k.excludedModels?.some((model) => model.toLowerCase().includes(search.toLowerCase())) ||
      k.excludedProviders?.some((provider) => provider.toLowerCase().includes(search.toLowerCase()))
  );
  const isDisabled = (key: KeyConfig) =>
    key.disabledAt !== undefined || (key.expiresAt !== undefined && key.expiresAt <= Date.now());
  const activeKeys = filteredKeys.filter((key) => !isDisabled(key));
  const disabledKeys = filteredKeys.filter(isDisabled);

  const getQuotaStatusColor = (percent: number) => {
    if (percent >= 90) return 'var(--color-danger)';
    if (percent >= 75) return 'var(--color-warning)';
    return 'var(--color-success)';
  };

  // ---------------------------------------------------------------------------
  // Active Keys — TanStack column definitions
  // ---------------------------------------------------------------------------
  const keysColumns = React.useMemo<ColumnDef<KeyConfig>[]>(
    () => [
      {
        id: 'name',
        header: 'Key Name',
        accessorKey: 'key',
        enableSorting: false,
        meta: { mobileTitle: true, priority: 'high' },
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{row.original.key}</span>
          </div>
        ),
      },
      {
        id: 'secret',
        header: 'Secret',
        meta: { priority: 'high' },
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs bg-surface-elevated px-1.5 py-0.5 rounded text-foreground-muted">
              {row.original.secret.substring(0, 5)}...
            </span>
            <button
              type="button"
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-sm transition-colors',
                'text-foreground-muted hover:bg-surface-elevated hover:text-accent'
              )}
              onClick={(e) => {
                e.stopPropagation();
                handleCopy(row.original.secret, row.original.key);
              }}
              title="Copy secret"
            >
              {copiedKey === row.original.key ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        ),
      },
      {
        id: 'quota',
        header: 'Quota',
        meta: { priority: 'medium', mobileLabel: 'Quota' },
        cell: ({ row }) => {
          const quotaNames =
            row.original.quotas && row.original.quotas.length > 0 ? row.original.quotas : null;
          const usingDefaults = !quotaNames && defaultQuotaNames.length > 0;

          if (quotaNames) {
            return (
              <div className="flex flex-wrap items-center gap-1">
                {quotaNames.map((n) => (
                  <Pill key={n} tone="accent" size="sm">
                    <Shield size={11} />
                    {n}
                  </Pill>
                ))}
              </div>
            );
          }
          if (usingDefaults) {
            return (
              <div className="flex flex-wrap items-center gap-1">
                {defaultQuotaNames.map((n) => (
                  <Pill key={n} tone="neutral" size="sm">
                    {n}
                  </Pill>
                ))}
                <Pill tone="neutral" size="sm">
                  default
                </Pill>
              </div>
            );
          }
          return <span className="text-foreground-muted text-xs">-</span>;
        },
      },
      {
        id: 'expiry',
        header: 'Expiry',
        meta: { priority: 'medium', mobileLabel: 'Expiry' },
        cell: ({ row }) => {
          const { expiresAt } = row.original;
          if (expiresAt === undefined) {
            return <span className="text-foreground-muted text-xs">-</span>;
          }
          return (
            <span className="text-xs text-foreground-muted">Expires {formatExpiry(expiresAt)}</span>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        meta: { priority: 'medium', mobileLabel: 'Status' },
        cell: ({ row }) => {
          const status = quotaStatuses[row.original.key];
          const primary = status ? mostConstrainedEntry(status.quotas) : null;
          const usagePercent = primary ? entryUsagePercent(primary) : 0;
          const quotaNames =
            row.original.quotas && row.original.quotas.length > 0 ? row.original.quotas : null;
          const usingDefaults = !quotaNames && defaultQuotaNames.length > 0;

          if (primary) {
            return (
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: getQuotaStatusColor(usagePercent) }}
                  />
                  <span className="text-xs tabular-nums text-foreground">
                    {formatQuotaValue(primary.currentUsage, primary.limitType)} /{' '}
                    {formatQuotaValue(primary.limit, primary.limitType)}
                  </span>
                  {status && status.quotas.length > 1 && (
                    <span className="text-[11px] text-foreground-muted">
                      (+{status.quotas.length - 1})
                    </span>
                  )}
                  <button
                    type="button"
                    className="text-foreground-muted hover:text-accent p-0.5 rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewQuotaStatus(row.original.key);
                    }}
                    title="View details"
                  >
                    <BarChart3 size={13} />
                  </button>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${usagePercent}%`,
                      backgroundColor: getQuotaStatusColor(usagePercent),
                    }}
                  />
                </div>
              </div>
            );
          }
          if (quotaNames || usingDefaults) {
            return <span className="text-xs text-foreground-muted">Loading...</span>;
          }
          return <span className="text-xs text-foreground-muted">-</span>;
        },
      },
      {
        id: 'actions',
        header: '',
        meta: { align: 'right', priority: 'high' },
        cell: ({ row }) => {
          const quotaNames =
            row.original.quotas && row.original.quotas.length > 0 ? row.original.quotas : null;
          const usingDefaults = !quotaNames && defaultQuotaNames.length > 0;
          return (
            <div className="inline-flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${row.original.key}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditKey(row.original);
                }}
              >
                <Edit2 size={14} strokeWidth={1.75} />
              </Button>
              {(quotaNames || usingDefaults) && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Reset quota for ${row.original.key}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClearQuota(row.original.key);
                  }}
                  title="Reset quota"
                >
                  <RefreshCw size={14} strokeWidth={1.75} />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="text-foreground-muted hover:text-danger hover:bg-danger-subtle"
                aria-label={`Disable ${row.original.key}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDisableKey(row.original);
                }}
                title="Disable key"
              >
                <Ban size={14} strokeWidth={1.75} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-foreground-muted hover:text-danger hover:bg-danger-subtle"
                aria-label={`Delete ${row.original.key}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteKey(row.original.key);
                }}
              >
                <Trash2 size={14} strokeWidth={1.75} />
              </Button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quotaStatuses, copiedKey, defaultQuotaNames]
  );

  // ---------------------------------------------------------------------------
  // Disabled Keys — TanStack column definitions (read-only; revealed via the
  // "Show disabled" disclosure below the active-keys table)
  // ---------------------------------------------------------------------------
  const disabledKeysColumns = React.useMemo<ColumnDef<KeyConfig>[]>(
    () => [
      {
        id: 'name',
        header: 'Key Name',
        accessorKey: 'key',
        enableSorting: false,
        meta: { mobileTitle: true, priority: 'high' },
        cell: ({ row }) => (
          <span className="font-medium text-foreground-muted">{row.original.key}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { priority: 'high', mobileLabel: 'Status' },
        cell: ({ row }) => {
          const expired = row.original.disabledAt === undefined;
          return (
            <Badge status={expired ? 'danger' : 'neutral'} noDot>
              {expired ? 'Expired' : 'Disabled'}
            </Badge>
          );
        },
      },
      {
        id: 'since',
        header: 'Since',
        meta: { priority: 'medium', mobileLabel: 'Since' },
        cell: ({ row }) => {
          const timestamp = row.original.disabledAt ?? row.original.expiresAt;
          return (
            <span className="text-xs text-foreground-muted">
              {timestamp !== undefined ? formatExpiry(timestamp) : '-'}
            </span>
          );
        },
      },
      {
        id: 'comment',
        header: 'Comment',
        meta: { priority: 'low', mobileLabel: 'Comment' },
        cell: ({ row }) => (
          <span className="text-xs text-foreground-muted">{row.original.comment || '-'}</span>
        ),
      },
    ],
    []
  );

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={SECTION_NAMES['/keys']}
        subtitle="API keys issued for downstream consumers"
        actions={
          <>
            <div className="w-full sm:w-64">
              <SearchInput value={search} onChange={setSearch} placeholder="Search keys…" />
            </div>
            <Button leftIcon={<Plus size={14} />} onClick={handleAddNewKey} size="md">
              Create key
            </Button>
          </>
        }
      />

      <PageContainer>
        <DataTable<KeyConfig>
          className="mb-6"
          title={`Active Keys (${activeKeys.length})`}
          columns={keysColumns}
          data={activeKeys}
          getRowKey={(row) => row.key}
          emptyTitle={search ? 'No keys found' : 'No keys yet'}
          emptyDescription={
            search
              ? 'Try a different search term.'
              : 'Create an API key to let a client call the gateway.'
          }
          emptyIcon={<Key />}
          emptyAction={
            search ? undefined : (
              <Button leftIcon={<Plus size={14} />} onClick={handleAddNewKey}>
                Create key
              </Button>
            )
          }
          mobileActions={(row) => {
            const quotaNames = row.quotas && row.quotas.length > 0 ? row.quotas : null;
            const usingDefaults = !quotaNames && defaultQuotaNames.length > 0;
            return (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${row.key}`}
                  onClick={() => handleEditKey(row)}
                >
                  <Edit2 size={14} strokeWidth={1.75} />
                </Button>
                {(quotaNames || usingDefaults) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Reset quota for ${row.key}`}
                    onClick={() => handleClearQuota(row.key)}
                    title="Reset quota"
                  >
                    <RefreshCw size={14} strokeWidth={1.75} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-foreground-muted hover:text-danger hover:bg-danger-subtle"
                  aria-label={`Disable ${row.key}`}
                  onClick={() => handleDisableKey(row)}
                  title="Disable key"
                >
                  <Ban size={14} strokeWidth={1.75} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-foreground-muted hover:text-danger hover:bg-danger-subtle"
                  aria-label={`Delete ${row.key}`}
                  onClick={() => handleDeleteKey(row.key)}
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </Button>
              </>
            );
          }}
        />

        {/* Disabled / expired keys — collapsed by default, dimmed rows. */}
        <Disclosure
          title={`Show disabled (${disabledKeys.length})`}
          defaultOpen={false}
          className="mb-6"
        >
          <DataTable<KeyConfig>
            columns={disabledKeysColumns}
            data={disabledKeys}
            getRowKey={(row) => row.key}
            rowClassName={() => 'opacity-60'}
            emptyTitle="No disabled keys"
            emptyDescription="Disabled or expired keys will appear here."
          />
        </Disclosure>

        {/* Key Sheet */}
        <KeySheet
          open={isKeySheetOpen}
          onOpenChange={setIsKeySheetOpen}
          editingKeyName={originalKeyName}
          initial={editingKey}
          providerIds={providerIds}
          aliasIds={aliasIds}
          quotas={quotas}
        />

        {/* Quota Detail Modal */}
        <Modal
          isOpen={isQuotaDetailOpen}
          onClose={() => setIsQuotaDetailOpen(false)}
          title={`Quota Status: ${selectedQuotaName}`}
          size="md"
          footer={
            <>
              <Button variant="ghost" onClick={() => setIsQuotaDetailOpen(false)}>
                Close
              </Button>
              {selectedQuotaStatus && selectedQuotaStatus.quotas.length > 0 && (
                <Button
                  onClick={() => handleClearQuota(selectedQuotaStatus.key)}
                  variant="secondary"
                >
                  Reset All
                </Button>
              )}
            </>
          }
        >
          {selectedQuotaStatus && (
            <div className="flex flex-col gap-4">
              {selectedQuotaStatus.quotas.length === 0 ? (
                <EmptyState
                  variant="dense"
                  icon={<AlertCircle />}
                  title="No quotas assigned"
                  description="No quota assigned to this key, and no default quotas are configured."
                />
              ) : (
                sortMostConstrainedFirst(selectedQuotaStatus.quotas).map((entry) => {
                  const def = quotas[entry.name];
                  const leaky = isLeakyRollingDef(def);
                  const pct = entryUsagePercent(entry);
                  const recomputing =
                    recomputeQuotaMutation.isPending &&
                    recomputeQuotaMutation.variables?.quotaName === entry.name;
                  return (
                    <div
                      key={entry.name}
                      className="flex flex-col gap-2 p-3 bg-surface-elevated rounded-md border border-border"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          {entry.allowed ? (
                            <Check className="text-success shrink-0" size={16} />
                          ) : (
                            <AlertCircle className="text-danger shrink-0" size={16} />
                          )}
                          <span className="font-medium text-foreground truncate">{entry.name}</span>
                          {entry.source === 'default' && (
                            <Pill tone="neutral" size="sm">
                              default
                            </Pill>
                          )}
                          {entry.shared && (
                            <Pill tone="accent" size="sm">
                              <Users size={10} /> shared
                            </Pill>
                          )}
                          {hasScope(entry.scope) && (
                            <Pill tone="neutral" size="sm">
                              scoped
                            </Pill>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleClearQuota(selectedQuotaStatus.key, entry.name)}
                            aria-label={`Reset ${entry.name}`}
                            title="Reset usage"
                          >
                            <RefreshCw size={14} />
                          </Button>
                          <span
                            title={
                              leaky
                                ? 'Recompute is unavailable for rolling requests/tokens quotas — their usage cannot be reconstructed from historical data.'
                                : 'Recompute usage from historical request logs'
                            }
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                handleRecomputeQuota(selectedQuotaStatus.key, entry.name)
                              }
                              disabled={leaky || recomputing}
                              aria-label={`Recompute ${entry.name}`}
                            >
                              {leaky ? <Info size={14} /> : <Wrench size={14} />}
                            </Button>
                          </span>
                        </div>
                      </div>

                      <QuotaProgressBar
                        label={`${entry.limitType}${entry.global ? '' : ' (scoped)'}`}
                        value={entry.currentUsage}
                        max={entry.limit}
                        displayValue={`${formatQuotaValue(entry.currentUsage, entry.limitType)} / ${formatQuotaValue(entry.limit, entry.limitType)}`}
                        status={statusForPercent(pct)}
                        size="md"
                      />

                      <div className="flex items-center justify-between text-xs text-foreground-muted">
                        <span>
                          Remaining:{' '}
                          <span className="text-foreground font-medium">
                            {formatQuotaValue(entry.remaining, entry.limitType)}
                          </span>
                        </span>
                        <span>Resets {new Date(entry.resetsAt).toLocaleString()}</span>
                      </div>

                      {entry.warnAt !== undefined && (
                        <p className="text-[11px] text-foreground-muted">
                          Warns at {Math.round(entry.warnAt * 100)}% usage
                        </p>
                      )}

                      {!entry.allowed && (
                        <div className="flex items-center gap-2 text-xs text-danger">
                          <AlertCircle size={12} />
                          <span>Exhausted — requests using this quota are being rejected.</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </Modal>
      </PageContainer>
    </div>
  );
};

import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  BarChart3,
  Ban,
  Check,
  Copy,
  Edit2,
  Key,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
} from 'lucide-react';
import type { KeyConfig } from '../../lib/api';
import type { CurrencyCode } from '../../lib/currency';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { Disclosure } from '../../components/ui/Disclosure';
import { Badge } from '../../components/ui/Badge';
import { Pill } from '../../components/chips';
import { formatQuotaValue, mostConstrained } from '../../lib/quota';
import { formatExpiry } from '../../lib/format';
import { cn } from '../../lib/cn';
import { entryUsagePercent, getQuotaStatusColor } from './helpers';
import type { QuotaStatusResponse } from './types';

interface KeyListsProps {
  activeKeys: KeyConfig[];
  disabledKeys: KeyConfig[];
  defaultQuotaNames: string[];
  quotaStatuses: Record<string, QuotaStatusResponse>;
  copiedKey: string | null;
  currency: CurrencyCode;
  rate: number;
  symbol: string;
  showDisabledKeys: boolean;
  onSetShowDisabledKeys: (show: boolean) => void;
  onEditKey: (key: KeyConfig) => void;
  onDisableKey: (key: KeyConfig) => void;
  onDeleteKey: (keyName: string) => void;
  onCopy: (text: string, keyId: string) => void;
  onViewQuotaStatus: (keyName: string) => void;
  onClearQuota: (keyName: string) => void;
  onAddNewKey: () => void;
  search: string;
}

// Hoisted to module scope — a `cell` closure defined inside a component body
// remounts the DOM node every render (see the perf-trap note in
// `DataTable.tsx`).
const rowActions = (
  key: KeyConfig,
  props: Pick<
    KeyListsProps,
    'defaultQuotaNames' | 'onEditKey' | 'onDisableKey' | 'onDeleteKey' | 'onClearQuota'
  >
) => {
  const quotaNames = key.quotas && key.quotas.length > 0 ? key.quotas : null;
  const usingDefaults = !quotaNames && props.defaultQuotaNames.length > 0;
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Edit ${key.key}`}
        onClick={(e) => {
          e?.stopPropagation();
          props.onEditKey(key);
        }}
      >
        <Edit2 size={14} strokeWidth={1.75} />
      </Button>
      {(quotaNames || usingDefaults) && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Reset quota for ${key.key}`}
          onClick={(e) => {
            e?.stopPropagation();
            props.onClearQuota(key.key);
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
        aria-label={`Disable ${key.key}`}
        onClick={(e) => {
          e?.stopPropagation();
          props.onDisableKey(key);
        }}
        title="Disable key"
      >
        <Ban size={14} strokeWidth={1.75} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="text-foreground-muted hover:text-danger hover:bg-danger-subtle"
        aria-label={`Delete ${key.key}`}
        onClick={(e) => {
          e?.stopPropagation();
          props.onDeleteKey(key.key);
        }}
      >
        <Trash2 size={14} strokeWidth={1.75} />
      </Button>
    </>
  );
};

export const KeyLists = ({
  activeKeys,
  disabledKeys,
  defaultQuotaNames,
  quotaStatuses,
  copiedKey,
  currency,
  rate,
  symbol,
  showDisabledKeys,
  onSetShowDisabledKeys,
  onEditKey,
  onDisableKey,
  onDeleteKey,
  onCopy,
  onViewQuotaStatus,
  onClearQuota,
  onAddNewKey,
  search,
}: KeyListsProps) => {
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
                onCopy(row.original.secret, row.original.key);
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
          const primary = status ? mostConstrained(status.quotas) : null;
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
                    {formatQuotaValue(primary.currentUsage, primary.limitType, {
                      currency,
                      rate,
                      symbol,
                    })}{' '}
                    /{' '}
                    {formatQuotaValue(primary.limit, primary.limitType, {
                      currency,
                      rate,
                      symbol,
                    })}
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
                      onViewQuotaStatus(row.original.key);
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
        cell: ({ row }) => (
          <div className="inline-flex items-center justify-end gap-1">
            {rowActions(row.original, {
              defaultQuotaNames,
              onEditKey,
              onDisableKey,
              onDeleteKey,
              onClearQuota,
            })}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quotaStatuses, copiedKey, defaultQuotaNames, currency, rate, symbol]
  );

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
    <>
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
            <Button leftIcon={<Plus size={14} />} onClick={onAddNewKey}>
              Create key
            </Button>
          )
        }
        mobileActions={(row) => (
          <>
            {rowActions(row, {
              defaultQuotaNames,
              onEditKey,
              onDisableKey,
              onDeleteKey,
              onClearQuota,
            })}
          </>
        )}
      />

      {/* Disabled / expired keys — collapsed by default, dimmed rows. */}
      <Disclosure
        title={`Show disabled (${disabledKeys.length})`}
        open={showDisabledKeys}
        onOpenChange={onSetShowDisabledKeys}
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
    </>
  );
};

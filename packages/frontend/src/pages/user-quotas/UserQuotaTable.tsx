/**
 * UserQuotaTable — list of per-user rate-limit configs on the shared DataTable.
 *
 * Uses the canonical `DataTable` (TanStack-backed) so it matches every other
 * table in the app (header casing, row height, hover, dividers, mobile cards).
 * Edit/Delete live in an actions column on desktop and in the mobile card's
 * action slot via `mobileActions`.
 */
import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Edit2, Trash2, Users } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Pill } from '../../components/chips/Pill';
import { DataTable } from '../../components/ui/DataTable';
import { formatCost, formatTokens, formatNumber } from '../../lib/format';
import { defHasScope } from './user-quota-schema';
import type { UserQuota } from '../../lib/api';

export interface UserQuotaRow {
  name: string;
  quota: UserQuota;
}

interface Props {
  rows: UserQuotaRow[];
  onEdit: (row: UserQuotaRow) => void;
  onDelete: (row: UserQuotaRow) => void;
  /**
   * Quota name -> number of keys currently referencing it. When provided,
   * renders a "Keys Using" column (before Actions) — ported from the Keys
   * page's old "User Quotas" tab. When omitted, the column set is exactly
   * the original five (no quota-usage feature), byte-identical output.
   */
  keysUsingCounts?: Record<string, number>;
}

const EMPTY_CELL = '—';

const formatLimit = (q: UserQuota): string => {
  switch (q.limitType) {
    case 'cost':
      return formatCost(q.limit);
    case 'tokens':
      return formatTokens(q.limit);
    case 'requests':
    default:
      return formatNumber(q.limit);
  }
};

export const UserQuotaTable: React.FC<Props> = ({ rows, onEdit, onDelete, keysUsingCounts }) => {
  const columns: ColumnDef<UserQuotaRow>[] = React.useMemo(() => {
    const cols: ColumnDef<UserQuotaRow>[] = [
      {
        id: 'name',
        header: 'Name',
        accessorKey: 'name',
        meta: { priority: 'high', mobileTitle: true },
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-sm font-medium text-foreground">
              {row.original.name}
            </span>
            {row.original.quota.shared && (
              <Pill tone="accent" size="sm">
                <Users size={10} /> shared
              </Pill>
            )}
            {defHasScope(row.original.quota) && (
              <Pill tone="neutral" size="sm">
                scoped
              </Pill>
            )}
          </div>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        meta: { priority: 'high' },
        cell: ({ row }) => (
          <Pill tone="neutral" size="sm" className="capitalize">
            {row.original.quota.type}
          </Pill>
        ),
      },
      {
        id: 'limitType',
        header: 'Limit type',
        meta: { priority: 'medium' },
        cell: ({ row }) => (
          <span className="text-xs capitalize text-foreground-muted">
            {row.original.quota.limitType}
          </span>
        ),
      },
      {
        id: 'limit',
        header: 'Limit',
        meta: { priority: 'high', align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-foreground">
            {formatLimit(row.original.quota)}
          </span>
        ),
      },
      {
        id: 'window',
        header: 'Window',
        meta: { priority: 'medium' },
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-foreground-muted">
            {row.original.quota.duration || EMPTY_CELL}
          </span>
        ),
      },
    ];

    // Ported from Keys.tsx's old "User Quotas" tab column of the same name —
    // same count + Pill tone/pluralization treatment, sourced from the
    // precomputed map instead of a live `keys` closure.
    if (keysUsingCounts) {
      cols.push({
        id: 'keysUsing',
        header: 'Keys Using',
        meta: { priority: 'medium' },
        cell: ({ row }) => {
          const count = keysUsingCounts[row.original.name] ?? 0;
          return (
            <Pill tone={count > 0 ? 'accent' : 'neutral'} size="sm">
              {count} key{count !== 1 ? 's' : ''}
            </Pill>
          );
        },
      });
    }

    cols.push({
      id: 'actions',
      header: '',
      meta: { priority: 'low', align: 'right' },
      cell: ({ row }) => (
        <div className="inline-flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${row.original.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(row.original);
            }}
          >
            <Edit2 size={14} strokeWidth={1.75} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-foreground-muted hover:text-danger hover:bg-danger-subtle"
            aria-label={`Delete ${row.original.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(row.original);
            }}
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </Button>
        </div>
      ),
    });

    return cols;
  }, [onEdit, onDelete, keysUsingCounts]);

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowKey={(r) => r.name}
      mobileActions={(row) => (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${row.name}`}
            onClick={() => onEdit(row)}
          >
            <Edit2 size={14} strokeWidth={1.75} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-foreground-muted hover:text-danger hover:bg-danger-subtle"
            aria-label={`Delete ${row.name}`}
            onClick={() => onDelete(row)}
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </Button>
        </>
      )}
    />
  );
};

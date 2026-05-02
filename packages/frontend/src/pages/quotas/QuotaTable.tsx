import React from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { RefreshCw } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui-v2/table';
import { Button } from '../../components/ui-v2/button';
import { StatusPill } from '../../components/chips';
import { Pill } from '../../components/chips/Pill';
import { fromMeterStatus, type Status } from '../../lib/status-vocab';
import { formatTokens, EMPTY_CELL } from '../../lib/format-design';
import type { Meter, QuotaCheckerInfo } from '../../types/quota';
import { QuotaProgressBar } from './QuotaProgressBar';
import { getCheckerDisplayName } from '../../components/quota/checker-presentation';

export interface QuotaRow {
  id: string;
  meter: Meter;
  quota: QuotaCheckerInfo;
  displayName: string;
}

interface QuotaTableProps {
  rows: QuotaRow[];
  refreshing: Set<string>;
  onRefresh: (checkerId: string) => void;
  onRowClick?: (row: QuotaRow) => void;
}

const formatPercent = (n: number | 'unknown' | 'not_applicable'): string => {
  if (typeof n !== 'number') return EMPTY_CELL;
  return `${Math.round(n)}%`;
};

const formatLimit = (m: Meter): string => {
  if (m.limit == null) return EMPTY_CELL;
  return `${formatTokens(m.limit)}${m.unit ? ` ${m.unit}` : ''}`;
};

const formatUsed = (m: Meter): string => {
  const v = m.kind === 'balance' ? m.remaining : m.used;
  if (v == null) return EMPTY_CELL;
  return `${formatTokens(v)}${m.unit ? ` ${m.unit}` : ''}`;
};

const formatWindow = (m: Meter): string => {
  if (m.periodValue && m.periodUnit) {
    return `${m.periodValue}${m.periodUnit}`;
  }
  if (m.periodCycle) return m.periodCycle;
  return EMPTY_CELL;
};

const formatResets = (m: Meter): string => {
  if (!m.resetsAt) return EMPTY_CELL;
  const t = new Date(m.resetsAt);
  if (Number.isNaN(t.getTime())) return EMPTY_CELL;
  return t.toLocaleString();
};

export const QuotaTable: React.FC<QuotaTableProps> = ({
  rows,
  refreshing,
  onRefresh,
  onRowClick,
}) => {
  const columns = React.useMemo<ColumnDef<QuotaRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{row.original.meter.label}</span>
            <span className="text-[11px] text-foreground-subtle">{row.original.displayName}</span>
          </div>
        ),
      },
      {
        id: 'kind',
        header: 'Type',
        cell: ({ row }) => (
          <Pill tone="neutral" size="sm">
            {row.original.meter.kind === 'balance' ? 'Balance' : 'Allowance'}
          </Pill>
        ),
      },
      {
        id: 'limit',
        header: 'Limit',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-foreground">
            {formatLimit(row.original.meter)}
          </span>
        ),
      },
      {
        id: 'window',
        header: 'Window',
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-foreground-muted">
            {formatWindow(row.original.meter)}
          </span>
        ),
      },
      {
        id: 'used',
        header: 'Used',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const m = row.original.meter;
          const pct = typeof m.utilizationPercent === 'number' ? m.utilizationPercent : 0;
          return (
            <div className="flex min-w-[140px] flex-col items-end gap-1">
              <span className="font-mono text-xs tabular-nums text-foreground">
                {formatUsed(m)}
                <span className="ml-2 text-foreground-subtle">
                  {formatPercent(m.utilizationPercent)}
                </span>
              </span>
              <QuotaProgressBar percent={pct} />
            </div>
          );
        },
      },
      {
        id: 'resets',
        header: 'Resets',
        cell: ({ row }) => (
          <span className="text-xs text-foreground-muted">{formatResets(row.original.meter)}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          let status: Status;
          if (!row.original.quota.success) status = 'Error';
          else status = fromMeterStatus(row.original.meter.status);
          return <StatusPill status={status} />;
        },
      },
      {
        id: 'actions',
        header: '',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const checkerId = row.original.quota.checkerId;
          const isRefreshing = refreshing.has(checkerId);
          return (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Refresh ${row.original.displayName}`}
              disabled={isRefreshing}
              onClick={(e) => {
                e.stopPropagation();
                onRefresh(checkerId);
              }}
              className="h-7 w-7 p-0"
            >
              <RefreshCw
                className={cn('size-3.5', isRefreshing && 'animate-spin')}
                strokeWidth={1.75}
              />
            </Button>
          );
        },
      },
    ],
    [refreshing, onRefresh]
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="border-b border-border bg-surface hover:bg-surface">
              {hg.headers.map((h) => {
                const align = (h.column.columnDef.meta as { align?: string } | undefined)?.align;
                return (
                  <TableHead
                    key={h.id}
                    className={cn(
                      'h-8 text-[10px] font-medium uppercase tracking-wider text-foreground-muted',
                      align === 'right' && 'text-right'
                    )}
                  >
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn(
                'border-b border-border last:border-b-0 hover:bg-surface-elevated',
                onRowClick && 'cursor-pointer'
              )}
              onClick={() => onRowClick?.(row.original)}
              style={{ height: 'var(--row-height, 40px)' }}
            >
              {row.getVisibleCells().map((cell) => {
                const align = (cell.column.columnDef.meta as { align?: string } | undefined)?.align;
                return (
                  <TableCell
                    key={cell.id}
                    className={cn('py-2', align === 'right' && 'text-right')}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

/** Flatten the nested API response into table rows. */
export const flattenQuotas = (quotas: QuotaCheckerInfo[]): QuotaRow[] => {
  const out: QuotaRow[] = [];
  for (const q of quotas) {
    const displayName = getCheckerDisplayName(q.checkerType ?? q.checkerId, q.checkerId);
    if (q.meters.length === 0) continue;
    for (const meter of q.meters) {
      out.push({
        id: `${q.checkerId}::${meter.key}`,
        meter,
        quota: q,
        displayName,
      });
    }
  }
  return out;
};

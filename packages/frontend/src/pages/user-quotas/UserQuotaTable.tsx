import React from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { Edit2, Trash2 } from 'lucide-react';
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
import { Pill } from '../../components/chips/Pill';
import { formatCount, formatCostUsd, formatTokens, EMPTY_CELL } from '../../lib/format-design';
import type { UserQuota } from '../../lib/api';

export interface UserQuotaRow {
  name: string;
  quota: UserQuota;
}

interface Props {
  rows: UserQuotaRow[];
  onEdit: (row: UserQuotaRow) => void;
  onDelete: (row: UserQuotaRow) => void;
}

const formatLimit = (q: UserQuota): string => {
  switch (q.limitType) {
    case 'cost':
      return formatCostUsd(q.limit);
    case 'tokens':
      return formatTokens(q.limit);
    case 'requests':
    default:
      return formatCount(q.limit);
  }
};

export const UserQuotaTable: React.FC<Props> = ({ rows, onEdit, onDelete }) => {
  const columns = React.useMemo<ColumnDef<UserQuotaRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium text-foreground">{row.original.name}</span>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <Pill tone="neutral" size="sm" className="capitalize">
            {row.original.quota.type}
          </Pill>
        ),
      },
      {
        id: 'limitType',
        header: 'Limit type',
        cell: ({ row }) => (
          <span className="text-xs capitalize text-foreground-muted">
            {row.original.quota.limitType}
          </span>
        ),
      },
      {
        id: 'limit',
        header: 'Limit',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-foreground">
            {formatLimit(row.original.quota)}
          </span>
        ),
      },
      {
        id: 'window',
        header: 'Window',
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-foreground-muted">
            {row.original.quota.duration || EMPTY_CELL}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="inline-flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label={`Edit ${row.original.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(row.original);
              }}
            >
              <Edit2 strokeWidth={1.75} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-foreground-muted hover:text-danger"
              aria-label={`Delete ${row.original.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(row.original);
              }}
            >
              <Trash2 strokeWidth={1.75} />
            </Button>
          </div>
        ),
      },
    ],
    [onEdit, onDelete]
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
              className="border-b border-border last:border-b-0 hover:bg-surface-elevated"
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

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
import { EMPTY_CELL } from '../../lib/format-design';
import type { KeyConfig } from '../../lib/api';

interface Props {
  rows: KeyConfig[];
  onEdit: (key: KeyConfig) => void;
  onDelete: (key: KeyConfig) => void;
}

const formatPrefix = (secret: string): string => {
  if (!secret) return EMPTY_CELL;
  return `${secret.slice(0, 6)}…${secret.slice(-3)}`;
};

export const KeyTable: React.FC<Props> = ({ rows, onEdit, onDelete }) => {
  const columns = React.useMemo<ColumnDef<KeyConfig>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{row.original.key}</span>
            {row.original.comment && (
              <span className="truncate text-[11px] text-foreground-subtle">
                {row.original.comment}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'prefix',
        header: 'Prefix',
        cell: ({ row }) => (
          <code className="font-mono text-xs text-foreground-muted">
            {formatPrefix(row.original.secret)}
          </code>
        ),
      },
      {
        id: 'quota',
        header: 'Quota',
        cell: ({ row }) =>
          row.original.quota ? (
            <Pill size="sm" tone="accent">
              {row.original.quota}
            </Pill>
          ) : (
            <span className="text-foreground-subtle">{EMPTY_CELL}</span>
          ),
      },
      {
        id: 'allowed',
        header: 'Restrictions',
        cell: ({ row }) => {
          const aps = row.original.allowedProviders ?? [];
          const ams = row.original.allowedModels ?? [];
          const xps = row.original.excludedProviders ?? [];
          const xms = row.original.excludedModels ?? [];
          const total = aps.length + ams.length + xps.length + xms.length;
          if (total === 0) {
            return <span className="text-[11px] text-foreground-subtle">Unrestricted</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {aps.length > 0 && (
                <Pill size="sm" tone="success">
                  +{aps.length} prov
                </Pill>
              )}
              {ams.length > 0 && (
                <Pill size="sm" tone="success">
                  +{ams.length} model
                </Pill>
              )}
              {xps.length > 0 && (
                <Pill size="sm" tone="warning">
                  −{xps.length} prov
                </Pill>
              )}
              {xms.length > 0 && (
                <Pill size="sm" tone="warning">
                  −{xms.length} model
                </Pill>
              )}
            </div>
          );
        },
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
              aria-label={`Edit ${row.original.key}`}
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
              aria-label={`Delete ${row.original.key}`}
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

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
import { Switch } from '../../components/ui-v2/switch';
import { StatusPill } from '../../components/chips/StatusPill';
import { EMPTY_CELL } from '../../lib/format-design';
import type { McpServer } from '../../lib/api';

export interface McpServerRow {
  name: string;
  server: McpServer;
  headerCount: number;
}

interface Props {
  rows: McpServerRow[];
  onEdit: (row: McpServerRow) => void;
  onDelete: (row: McpServerRow) => void;
  onToggle: (row: McpServerRow, next: boolean) => void;
}

export const McpServerTable: React.FC<Props> = ({ rows, onEdit, onDelete, onToggle }) => {
  const columns = React.useMemo<ColumnDef<McpServerRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium text-foreground">{row.original.name}</span>
        ),
      },
      {
        id: 'url',
        header: 'Upstream URL',
        cell: ({ row }) => (
          <span
            className="block max-w-[420px] truncate font-mono text-xs text-foreground-muted"
            title={row.original.server.upstream_url}
          >
            {row.original.server.upstream_url || EMPTY_CELL}
          </span>
        ),
      },
      {
        id: 'headers',
        header: 'Headers',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-foreground-muted">
            {row.original.headerCount}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusPill status={row.original.server.enabled ? 'Active' : 'Disabled'} />
        ),
      },
      {
        id: 'enabled',
        header: 'Enabled',
        cell: ({ row }) => (
          <Switch
            checked={row.original.server.enabled}
            onCheckedChange={(next) => onToggle(row.original, next)}
            aria-label={`Toggle ${row.original.name}`}
          />
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
    [onEdit, onDelete, onToggle]
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

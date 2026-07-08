import { Edit2, Trash2, Server } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import { DataTable } from '../ui/DataTable';
import type { Provider } from '../../lib/api';

interface Props {
  providers: Provider[];
  getQuotaDisplay: (provider: Provider) => React.ReactNode;
  onEdit: (provider: Provider) => void;
  onToggleEnabled: (provider: Provider, newState: boolean) => void;
  onDelete: (provider: Provider) => void;
  emptyAction?: React.ReactNode;
}

const countModels = (p: Provider): number => {
  if (!p.models) return 0;
  if (Array.isArray(p.models)) return p.models.length;
  if (typeof p.models === 'object') return Object.keys(p.models).length;
  return 0;
};

export function ProviderList({
  providers,
  getQuotaDisplay,
  onEdit,
  onToggleEnabled,
  onDelete,
  emptyAction,
}: Props) {
  const columns: ColumnDef<Provider>[] = [
    {
      id: 'id',
      header: 'Name / ID',
      meta: { priority: 'high', mobileTitle: true },
      cell: ({ row }) => {
        const p = row.original;
        // Provider.name falls back to the id when no display name is set
        // (api.ts maps `display_name || key`), so only treat it as a display
        // name when it's actually distinct from the id.
        const displayName = p.name?.trim();
        const hasDistinctName = !!displayName && displayName !== p.id;
        return (
          <div className="flex items-center gap-2">
            <Edit2 size={12} className="shrink-0 text-foreground-subtle" />
            <span className="font-semibold text-foreground">{hasDistinctName ? p.name : p.id}</span>
            {hasDistinctName && <span className="text-xs text-foreground-muted">( {p.id} )</span>}
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      meta: { priority: 'medium' },
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={p.enabled !== false}
              onChange={(val) => onToggleEnabled(p, val)}
              size="sm"
            />
          </div>
        );
      },
    },
    {
      id: 'models',
      header: 'Models',
      meta: { priority: 'medium' },
      cell: ({ row }) => countModels(row.original),
    },
    {
      id: 'quota',
      header: 'Quota/Balance',
      meta: { priority: 'medium' },
      cell: ({ row }) => getQuotaDisplay(row.original) ?? '-',
    },
    {
      id: 'actions',
      header: 'Actions',
      meta: { priority: 'low', align: 'right' },
      cell: ({ row }) => (
        <div className="inline-flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="text-foreground-muted hover:text-foreground"
            aria-label={`Edit ${row.original.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(row.original);
            }}
          >
            <Edit2 size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-foreground-muted hover:text-danger hover:bg-danger-subtle"
            aria-label={`Delete ${row.original.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(row.original);
            }}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={providers}
      getRowKey={(p) => p.id}
      onRowClick={onEdit}
      emptyTitle="No providers yet"
      emptyDescription="Add an upstream provider to start routing traffic."
      emptyIcon={<Server />}
      emptyAction={emptyAction}
      mobileActions={(p) => (
        <>
          <Button
            size="sm"
            variant="ghost"
            className="text-foreground-muted hover:text-foreground"
            aria-label={`Edit ${p.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(p);
            }}
          >
            <Edit2 size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-foreground-muted hover:text-danger hover:bg-danger-subtle"
            aria-label={`Delete ${p.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(p);
            }}
          >
            <Trash2 size={14} />
          </Button>
        </>
      )}
    />
  );
}

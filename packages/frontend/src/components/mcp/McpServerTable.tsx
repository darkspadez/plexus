import { Copy, Edit2, KeyRound, PlugZap, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { DataTable } from '../ui/DataTable';
import { Switch } from '../ui/Switch';
import type { McpServer } from '../../lib/api';

interface McpServerTableProps {
  servers: Record<string, McpServer>;
  serverNames: string[];
  mcpEnabled: boolean;
  onEdit: (serverName: string) => void;
  onManageKeys: (serverName: string) => void;
  onToggleEnabled: (serverName: string, newState: boolean) => void | Promise<void>;
  onToggleMcpEnabled: (enabled: boolean) => void | Promise<void>;
  onDelete: (serverName: string) => void | Promise<void>;
  mcpPathForServer: (serverName: string) => string;
  onCopyMcpPath: (path: string) => void | Promise<void>;
}

/** Row model for the servers table: the pinned Plexus Management entry + configured servers. */
type McpServerRow = { kind: 'management' } | { kind: 'server'; name: string };

export function McpServerTable({
  servers,
  serverNames,
  mcpEnabled,
  onEdit,
  onManageKeys,
  onToggleEnabled,
  onToggleMcpEnabled,
  onDelete,
  mcpPathForServer,
  onCopyMcpPath,
}: McpServerTableProps) {
  const rows: McpServerRow[] = [
    { kind: 'management' },
    ...serverNames.map((name) => ({ kind: 'server' as const, name })),
  ];

  const columns: ColumnDef<McpServerRow>[] = [
    {
      id: 'name',
      header: 'Name',
      meta: { priority: 'high', mobileTitle: true },
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === 'management') {
          return <span className="font-medium text-foreground">Plexus Management</span>;
        }
        return (
          <div className="flex items-center gap-2">
            <Edit2 size={12} className="opacity-50" />
            <span className="font-medium text-foreground">{r.name}</span>
          </div>
        );
      },
    },
    {
      id: 'upstream',
      header: 'Upstream',
      meta: { priority: 'medium' },
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === 'management') {
          return <span className="text-xs text-foreground-muted">—</span>;
        }
        const server = servers[r.name];
        return (
          <div className="max-w-[400px] truncate text-sm text-foreground">
            {server.mode === 'local_http'
              ? `${server.launcher} ${server.package} → 127.0.0.1:${server.port}${server.path || '/mcp'}`
              : server.upstream_url}
          </div>
        );
      },
    },
    {
      id: 'path',
      header: 'Path',
      meta: { priority: 'medium' },
      cell: ({ row }) => {
        const r = row.original;
        const path = r.kind === 'management' ? '/mcp/plexus' : mcpPathForServer(r.name);
        return (
          <div
            className="flex items-center gap-2 whitespace-nowrap"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="font-mono text-xs text-foreground">{path}</span>
            <button
              type="button"
              onClick={() => onCopyMcpPath(path)}
              className="rounded p-1 text-foreground-muted hover:bg-surface-elevated hover:text-foreground"
              title="Copy path"
              aria-label={`Copy ${path}`}
            >
              <Copy size={13} />
            </button>
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      meta: { priority: 'medium' },
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === 'management') {
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Switch checked={mcpEnabled} onChange={onToggleMcpEnabled} size="sm" />
            </div>
          );
        }
        const server = servers[r.name];
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={server.enabled !== false}
              onChange={(val) => onToggleEnabled(r.name, val)}
              size="sm"
            />
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      meta: { priority: 'low', align: 'right' },
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === 'management') return null;
        const server = servers[r.name];
        return (
          <div className="flex items-center justify-end gap-1">
            {server?.mode !== 'local_http' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onManageKeys(r.name);
                }}
                className="text-foreground-muted hover:text-foreground"
                title="Manage load-balanced keys"
                aria-label={`Manage keys for ${r.name}`}
              >
                <KeyRound size={14} />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(r.name);
              }}
              className="text-foreground-muted hover:text-danger hover:bg-danger-subtle"
              aria-label={`Delete ${r.name}`}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <Card title="MCP Servers" flush>
      <DataTable<McpServerRow>
        columns={columns}
        data={rows}
        getRowKey={(r) => (r.kind === 'management' ? '__management__' : r.name)}
        onRowClick={(r) => {
          if (r.kind === 'server') onEdit(r.name);
        }}
        rowClassName={(r) =>
          r.kind === 'management'
            ? 'bg-accent/5 border-accent/20 cursor-default hover:bg-accent/5 hover:border-accent/20'
            : ''
        }
        emptyIcon={<PlugZap />}
        emptyTitle="No MCP servers yet"
        emptyDescription="Add a server to expose its tools through the gateway."
        mobileActions={(r) =>
          r.kind === 'server' ? (
            <>
              {servers[r.name]?.mode !== 'local_http' && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onManageKeys(r.name);
                  }}
                  className="text-foreground-muted"
                  aria-label={`Manage keys for ${r.name}`}
                >
                  <KeyRound size={14} />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(r.name);
                }}
                className="text-danger"
                aria-label={`Delete ${r.name}`}
              >
                <Trash2 size={14} />
              </Button>
            </>
          ) : null
        }
      />
    </Card>
  );
}

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, McpServer, McpLogRecord } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { SearchInput } from '../components/ui/SearchInput';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import { useToast } from '../contexts/ToastContext';
import { DataTable } from '../components/ui/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Plus,
  Trash2,
  Edit2,
  AlertTriangle,
  CheckCircle,
  Zap,
  ZapOff,
  Download,
  Copy,
  PlugZap,
} from 'lucide-react';
import { McpServerSheet } from './mcp/McpServerSheet';
import { Switch } from '../components/ui/Switch';
import { cn } from '../lib/cn';
import {
  useMcpServers,
  useMcpEnabled,
  useMcpLogs,
  useDeleteMcpServer,
  useToggleMcpEnabled,
  useDeleteMcpLog,
  useDeleteAllMcpLogs,
  MCP_SERVERS_KEY,
} from '../hooks/queries/useMcp';
import { formatMs } from '../lib/format';
import { isClipboardAvailable, copyToClipboard } from '../lib/clipboard';
import { SECTION_NAMES } from '../lib/nav';
import plexusAdminSkill from '../../../../.agents/skills/plexus-management/SKILL.md' with {
  type: 'text',
};

/** Row model for the servers DataTable: the pinned Plexus Management entry + configured servers. */
type McpServerRow = { kind: 'management' } | { kind: 'server'; name: string };

export const McpPage: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();

  // --- TanStack Query data ---
  const { data: servers = {}, isLoading } = useMcpServers();
  const { data: mcpEnabledData } = useMcpEnabled();
  const mcpEnabled = mcpEnabledData?.enabled ?? true;

  // Logs query state (controlled externally so user can paginate/search)
  const [logsQueryOffset, setLogsQueryOffset] = useState(0);
  const [logsActiveFilters, setLogsActiveFilters] = useState({ serverName: '', apiKey: '' });
  const { data: logsData, isLoading: logsLoading } = useMcpLogs(
    20,
    logsQueryOffset,
    logsActiveFilters
  );
  const logs: McpLogRecord[] = logsData?.data ?? [];
  const logsTotal = Number(logsData?.total) || 0;

  // Mutations
  const deleteMcpServerMutation = useDeleteMcpServer();
  const toggleMcpEnabledMutation = useToggleMcpEnabled();
  const deleteMcpLogMutation = useDeleteMcpLog();
  const deleteAllMcpLogsMutation = useDeleteAllMcpLogs();

  const [isServerSheetOpen, setIsServerSheetOpen] = useState(false);
  const [editingServerName, setEditingServerName] = useState<string | null>(null);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);

  // Logs UI state (input filters before submitting search)
  const [logsFilters, setLogsFilters] = useState({ serverName: '', apiKey: '' });
  const logsLimit = 20;

  // Delete logs modal state
  const [isDeleteLogsModalOpen, setIsDeleteLogsModalOpen] = useState(false);
  const [deleteLogsMode, setDeleteLogsMode] = useState<'all' | 'older'>('older');
  const [olderThanDays, setOlderThanDays] = useState(7);

  // Single log delete state
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [isSingleDeleteModalOpen, setIsSingleDeleteModalOpen] = useState(false);

  const isDeletingLogs = deleteMcpLogMutation.isPending || deleteAllMcpLogsMutation.isPending;

  const handleLogSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLogsQueryOffset(0);
    setLogsActiveFilters({ ...logsFilters });
  };

  const handleDeleteAllLogs = () => {
    setIsDeleteLogsModalOpen(true);
  };

  const confirmDeleteAllLogs = async () => {
    const olderThan = deleteLogsMode === 'older' ? olderThanDays : undefined;
    deleteAllMcpLogsMutation.mutate(olderThan, {
      onSuccess: () => {
        setLogsQueryOffset(0);
        setIsDeleteLogsModalOpen(false);
      },
    });
  };

  const handleDeleteLog = (requestId: string) => {
    setSelectedLogId(requestId);
    setIsSingleDeleteModalOpen(true);
  };

  const confirmDeleteSingleLog = async () => {
    if (!selectedLogId) return;
    deleteMcpLogMutation.mutate(selectedLogId, {
      onSuccess: () => {
        setIsSingleDeleteModalOpen(false);
        setSelectedLogId(null);
      },
    });
  };

  const handleAddNew = () => {
    setEditingServerName(null);
    setEditingServer(null);
    setIsServerSheetOpen(true);
  };

  const handleEdit = (serverName: string) => {
    const server = servers[serverName];
    if (!server) return;
    setEditingServerName(serverName);
    setEditingServer({ ...server });
    setIsServerSheetOpen(true);
  };

  const handleDelete = async (serverName: string) => {
    const ok = await toast.confirm({
      title: 'Delete MCP server?',
      message: `Are you sure you want to delete the MCP server "${serverName}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    deleteMcpServerMutation.mutate(serverName, {
      onSuccess: () => toast.success(`Deleted ${serverName}`),
    });
  };

  const handleToggleEnabled = async (serverName: string, newState: boolean) => {
    const server = servers[serverName];
    if (!server) return;

    try {
      await api.saveMcpServer(serverName, {
        ...server,
        enabled: newState,
      });
      await queryClient.invalidateQueries({ queryKey: MCP_SERVERS_KEY });
    } catch (e) {
      console.error('Toggle error', e);
      toast.error(`Failed to update MCP server: ${e}`);
    }
  };

  const handleToggleMcpEnabled = (enabled: boolean) => {
    toggleMcpEnabledMutation.mutate(enabled, {
      onSuccess: () => toast.success(`MCP server ${enabled ? 'enabled' : 'disabled'}`),
      onError: (e: any) => toast.error('Failed to update MCP server state', e.message),
    });
  };

  const serverNames = Object.keys(servers);
  const logsCurrentPage = Math.floor(logsQueryOffset / logsLimit);

  const mcpPathForServer = (name: string) => `/mcp/${name}`;

  const handleCopyMcpPath = async (path: string) => {
    if (!isClipboardAvailable()) {
      toast.error('Copy requires HTTPS connection');
      return;
    }
    const success = await copyToClipboard(path);
    if (success) {
      toast.success(`Copied ${path}`);
    } else {
      toast.error('Failed to copy path');
    }
  };

  // --- Servers table (shared DataTable) ---
  const mcpServerRows: McpServerRow[] = [
    { kind: 'management' },
    ...serverNames.map((name) => ({ kind: 'server' as const, name })),
  ];

  const mcpServerColumns: ColumnDef<McpServerRow>[] = [
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
            <span className="font-medium">{r.name}</span>
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
          <div className="max-w-[400px] truncate text-sm">
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
            <span className="font-mono text-xs">{path}</span>
            <button
              type="button"
              onClick={() => handleCopyMcpPath(path)}
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
              <Switch
                checked={mcpEnabled}
                onChange={(val) => handleToggleMcpEnabled(val)}
                size="sm"
              />
            </div>
          );
        }
        const server = servers[r.name];
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={server.enabled !== false}
              onChange={(val) => handleToggleEnabled(r.name, val)}
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
        return (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(r.name);
            }}
            className="text-foreground-muted hover:text-danger hover:bg-danger-subtle"
          >
            <Trash2 size={14} />
          </Button>
        );
      },
    },
  ];

  const handleCopySkill = async () => {
    const canCopy = isClipboardAvailable();
    if (!canCopy) {
      toast.error('Copy requires HTTPS connection');
      return;
    }
    const success = await copyToClipboard(plexusAdminSkill);
    if (success) {
      toast.success('Skill copied to clipboard');
    } else {
      toast.error('Failed to copy to clipboard');
    }
  };

  const triggerDownload = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSkill = () => {
    triggerDownload(plexusAdminSkill, 'SKILL.md', 'text/markdown');
  };

  // ---------------------------------------------------------------------------
  // MCP Logs — TanStack column definitions
  // ---------------------------------------------------------------------------
  const logsColumns = React.useMemo<ColumnDef<McpLogRecord>[]>(
    () => [
      {
        id: 'date',
        header: 'Date',
        meta: { priority: 'high', mobileTitle: true },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-foreground">
              {new Date(row.original.created_at).toLocaleTimeString()}
            </span>
            <span className="text-[11px] text-foreground-muted">
              {new Date(row.original.created_at).toISOString().split('T')[0]}
            </span>
          </div>
        ),
      },
      {
        id: 'key',
        header: 'Key',
        meta: { priority: 'high', mobileLabel: 'Key' },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{row.original.api_key || '-'}</span>
            {row.original.attribution && (
              <span className="text-[11px] text-foreground-muted">{row.original.attribution}</span>
            )}
          </div>
        ),
      },
      {
        id: 'server',
        header: 'Server',
        meta: { priority: 'high', mobileLabel: 'Server' },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{row.original.server_name}</span>
            <span
              className="text-[11px] text-foreground-muted truncate max-w-[200px] block"
              title={row.original.upstream_url}
            >
              {row.original.upstream_url}
            </span>
          </div>
        ),
      },
      {
        id: 'method',
        header: 'Method',
        meta: { priority: 'medium', mobileLabel: 'Method' },
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span
              className={cn(
                'text-xs font-semibold',
                row.original.method === 'GET'
                  ? 'text-info'
                  : row.original.method === 'POST'
                    ? 'text-success'
                    : 'text-danger'
              )}
            >
              {row.original.method}
            </span>
            <div className="flex items-center gap-1">
              {row.original.is_streamed ? (
                <Zap size={11} className="text-info" />
              ) : (
                <ZapOff size={11} className="text-foreground-muted" />
              )}
              <span className="text-[10px] text-foreground-muted">
                {row.original.is_streamed ? 'streamed' : 'buffered'}
              </span>
            </div>
          </div>
        ),
      },
      {
        id: 'rpc',
        header: 'RPC Method',
        meta: { priority: 'medium', mobileLabel: 'RPC' },
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-xs text-foreground">
              {row.original.jsonrpc_method || <span className="text-foreground-muted">-</span>}
            </span>
            {row.original.tool_name && (
              <span className="font-mono text-xs text-info" title={row.original.tool_name}>
                {row.original.tool_name}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'duration',
        header: 'Duration',
        meta: { priority: 'low', mobileLabel: 'Duration', align: 'right' },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-foreground">
            {row.original.duration_ms != null ? formatMs(row.original.duration_ms) : '-'}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { priority: 'high', mobileLabel: 'Status' },
        cell: ({ row }) => {
          const log = row.original;
          const isError = !!log.error_code;
          const isSuccess =
            log.response_status != null && log.response_status >= 200 && log.response_status < 300;

          return (
            <div className="flex flex-col gap-1">
              <div
                className={cn(
                  'inline-flex items-center justify-center gap-1.5 py-1 px-2 rounded-xl text-xs font-medium border',
                  isError || !isSuccess
                    ? 'text-danger border-danger/30 bg-danger-subtle'
                    : 'text-success border-success/30 bg-success-subtle'
                )}
                style={{ width: '52px' }}
              >
                {isError ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}
                <span className="font-semibold">{log.response_status ?? '?'}</span>
              </div>
              {log.error_message && (
                <span
                  className="text-danger text-[11px] block truncate max-w-[160px]"
                  title={log.error_message}
                >
                  {log.error_message}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'delete',
        header: '',
        meta: { priority: 'high', align: 'right' },
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteLog(row.original.request_id);
            }}
            className="text-foreground-muted p-1 rounded cursor-pointer transition-colors hover:bg-danger-subtle hover:text-danger"
            title="Delete log"
          >
            <Trash2 size={14} />
          </button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-full">
        <PageHeader
          title={SECTION_NAMES['/mcp']}
          subtitle="Model Context Protocol connections and the Plexus admin skill"
        />
        <PageContainer>
          <div className="flex flex-col gap-4">
            <Skeleton height={44} className="w-full" />
            <Skeleton height={220} className="w-full" />
            <Skeleton height={220} className="w-full" />
          </div>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={SECTION_NAMES['/mcp']}
        subtitle="Model Context Protocol connections and the Plexus admin skill"
        actions={
          <>
            <Button variant="secondary" size="md" onClick={handleCopySkill}>
              Plexus Admin Skill
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={handleDownloadSkill}
              title="Download as file"
              aria-label="Download Plexus Admin skill"
            >
              <Download size={14} />
            </Button>
            <Button leftIcon={<Plus size={14} />} onClick={handleAddNew} size="md">
              Add server
            </Button>
          </>
        }
      />
      <PageContainer>
        <div className="flex flex-col gap-6">
          {/* Servers table */}
          <DataTable<McpServerRow>
            title="MCP Servers"
            columns={mcpServerColumns}
            data={mcpServerRows}
            getRowKey={(r) => (r.kind === 'management' ? '__management__' : r.name)}
            onRowClick={(r) => {
              if (r.kind === 'server') handleEdit(r.name);
            }}
            rowClassName={(r) =>
              r.kind === 'management'
                ? 'bg-accent/5 border-accent/20 cursor-default hover:bg-accent/5 hover:border-accent/20'
                : ''
            }
            emptyTitle="No MCP servers yet"
            emptyDescription="Add a server to expose its tools through the gateway."
            emptyIcon={<PlugZap />}
            emptyAction={
              <Button leftIcon={<Plus size={14} />} onClick={handleAddNew}>
                Add server
              </Button>
            }
            mobileActions={(r) =>
              r.kind === 'server' ? (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(r.name);
                  }}
                  className="text-danger"
                  aria-label={`Delete ${r.name}`}
                >
                  <Trash2 size={14} />
                </Button>
              ) : null
            }
          />

          {/* ── Usage Logs table ── */}
          <DataTable<McpLogRecord>
            title="MCP Usage Logs"
            headerSlot={
              <form onSubmit={handleLogSearch} className="flex flex-wrap items-end gap-2 p-3">
                <div className="w-full sm:w-56">
                  <SearchInput
                    placeholder="Filter by Server..."
                    value={logsFilters.serverName}
                    onChange={(v) => setLogsFilters({ ...logsFilters, serverName: v })}
                  />
                </div>
                <div className="w-full sm:w-56">
                  <SearchInput
                    placeholder="Filter by Key..."
                    value={logsFilters.apiKey}
                    onChange={(v) => setLogsFilters({ ...logsFilters, apiKey: v })}
                  />
                </div>
                <Button type="submit" variant="primary" size="md">
                  Search
                </Button>
                <Button
                  onClick={handleDeleteAllLogs}
                  variant="danger"
                  size="md"
                  leftIcon={<Trash2 size={14} />}
                  disabled={logs.length === 0}
                  type="button"
                >
                  Delete All
                </Button>
              </form>
            }
            columns={logsColumns}
            data={logs}
            loading={logsLoading}
            getRowKey={(row) => row.request_id}
            emptyTitle={
              logsActiveFilters.serverName || logsActiveFilters.apiKey
                ? 'No MCP logs found'
                : 'No MCP logs yet'
            }
            emptyDescription={
              logsActiveFilters.serverName || logsActiveFilters.apiKey
                ? 'Try adjusting your search filters.'
                : 'Tool calls through configured servers appear here.'
            }
            emptyIcon={<PlugZap />}
            breakpoint="lg"
            pagination={{
              page: logsCurrentPage,
              pageSize: logsLimit,
              total: logsTotal,
              onPageChange: (page) => setLogsQueryOffset(page * logsLimit),
            }}
            mobileActions={(row) => (
              <button
                type="button"
                onClick={() => handleDeleteLog(row.request_id)}
                className="text-foreground-muted p-1 rounded cursor-pointer transition-colors hover:bg-danger-subtle hover:text-danger"
                aria-label="Delete MCP log"
              >
                <Trash2 size={14} />
              </button>
            )}
          />

          {/* ── Server Edit/Add Sheet ── */}
          <McpServerSheet
            open={isServerSheetOpen}
            onOpenChange={setIsServerSheetOpen}
            editingServerName={editingServerName}
            initial={editingServer}
            servers={servers}
          />

          {/* ── Delete All Logs Modal ── */}
          <Modal
            isOpen={isDeleteLogsModalOpen}
            onClose={() => setIsDeleteLogsModalOpen(false)}
            title="Confirm Deletion"
            footer={
              <>
                <Button variant="secondary" onClick={() => setIsDeleteLogsModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={confirmDeleteAllLogs} disabled={isDeletingLogs}>
                  {isDeletingLogs ? 'Deleting...' : 'Delete Logs'}
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-4">
              <p>Select which MCP logs you would like to delete:</p>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="radio"
                  id="mcp-delete-older"
                  name="deleteLogsMode"
                  checked={deleteLogsMode === 'older'}
                  onChange={() => setDeleteLogsMode('older')}
                />
                <label htmlFor="mcp-delete-older">Delete logs older than</label>
                <Input
                  type="number"
                  min="1"
                  value={olderThanDays}
                  onChange={(e) => setOlderThanDays(parseInt(e.target.value) || 1)}
                  style={{ width: '60px', padding: '4px 8px' }}
                  disabled={deleteLogsMode !== 'older'}
                />
                <span>days</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="mcp-delete-all"
                  name="deleteLogsMode"
                  checked={deleteLogsMode === 'all'}
                  onChange={() => setDeleteLogsMode('all')}
                />
                <label htmlFor="mcp-delete-all" className="text-danger">
                  Delete ALL logs (Cannot be undone)
                </label>
              </div>
            </div>
          </Modal>

          {/* ── Single Log Delete Modal ── */}
          <Modal
            isOpen={isSingleDeleteModalOpen}
            onClose={() => setIsSingleDeleteModalOpen(false)}
            title="Confirm Deletion"
            footer={
              <>
                <Button variant="secondary" onClick={() => setIsSingleDeleteModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={confirmDeleteSingleLog} disabled={isDeletingLogs}>
                  {isDeletingLogs ? 'Deleting...' : 'Delete Log'}
                </Button>
              </>
            }
          >
            <p>Are you sure you want to delete this MCP log entry?</p>
          </Modal>
        </div>
      </PageContainer>
    </div>
  );
};

export default McpPage;

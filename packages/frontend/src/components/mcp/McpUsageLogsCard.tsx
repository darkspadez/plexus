import React from 'react';
import { AlertTriangle, CheckCircle, PlugZap, Trash2, Zap, ZapOff } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '../ui/Button';
import { DataTable } from '../ui/DataTable';
import { SearchInput } from '../ui/SearchInput';
import { cn } from '../../lib/cn';
import type { McpLogRecord } from '../../lib/api';
import { formatMs } from '../../lib/format';

export interface McpLogsFilters {
  serverName: string;
  apiKey: string;
}

interface McpUsageLogsCardProps {
  logs: McpLogRecord[];
  logsTotal: number;
  logsLoading: boolean;
  logsLimit: number;
  logsOffset: number;
  logsFilters: McpLogsFilters;
  onFiltersChange: (filters: McpLogsFilters) => void;
  onSearch: (event: React.FormEvent<HTMLFormElement>) => void;
  onDeleteAll: () => void;
  onDeleteLog: (requestId: string) => void;
  onOffsetChange: (offset: number) => void;
}

export function McpUsageLogsCard({
  logs,
  logsTotal,
  logsLoading,
  logsLimit,
  logsOffset,
  logsFilters,
  onFiltersChange,
  onSearch,
  onDeleteAll,
  onDeleteLog,
  onOffsetChange,
}: McpUsageLogsCardProps) {
  const currentPage = Math.floor(logsOffset / logsLimit);

  const columns = React.useMemo<ColumnDef<McpLogRecord>[]>(
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
              className="block max-w-[200px] truncate text-[11px] text-foreground-muted"
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
                  'inline-flex w-[52px] items-center justify-center gap-1.5 rounded-xl border px-2 py-1 text-xs font-medium',
                  isError || !isSuccess
                    ? 'border-danger/30 bg-danger-subtle text-danger'
                    : 'border-success/30 bg-success-subtle text-success'
                )}
              >
                {isError ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}
                <span className="font-semibold">{log.response_status ?? '?'}</span>
              </div>
              {log.error_message && (
                <span
                  className="block max-w-[160px] truncate text-[11px] text-danger"
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
              onDeleteLog(row.original.request_id);
            }}
            className="cursor-pointer rounded p-1 text-foreground-muted transition-colors hover:bg-danger-subtle hover:text-danger"
            title="Delete log"
            aria-label="Delete MCP log"
          >
            <Trash2 size={14} />
          </button>
        ),
      },
    ],
    [onDeleteLog]
  );

  return (
    <DataTable<McpLogRecord>
      title="MCP Usage Logs"
      headerSlot={
        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-2 p-3">
          <div className="w-full sm:w-56">
            <SearchInput
              placeholder="Filter by Server..."
              value={logsFilters.serverName}
              onChange={(v) => onFiltersChange({ ...logsFilters, serverName: v })}
            />
          </div>
          <div className="w-full sm:w-56">
            <SearchInput
              placeholder="Filter by Key..."
              value={logsFilters.apiKey}
              onChange={(v) => onFiltersChange({ ...logsFilters, apiKey: v })}
            />
          </div>
          <Button type="submit" variant="primary" size="md">
            Search
          </Button>
          <Button
            onClick={onDeleteAll}
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
      columns={columns}
      data={logs}
      loading={logsLoading}
      getRowKey={(row) => row.request_id}
      emptyTitle={
        logsFilters.serverName || logsFilters.apiKey ? 'No MCP logs found' : 'No MCP logs yet'
      }
      emptyDescription={
        logsFilters.serverName || logsFilters.apiKey
          ? 'Try adjusting your search filters.'
          : 'Tool calls through configured servers appear here.'
      }
      emptyIcon={<PlugZap />}
      breakpoint="lg"
      pagination={{
        page: currentPage,
        pageSize: logsLimit,
        total: logsTotal,
        onPageChange: (page) => onOffsetChange(page * logsLimit),
      }}
      mobileActions={(row) => (
        <button
          type="button"
          onClick={() => onDeleteLog(row.request_id)}
          className="cursor-pointer rounded p-1 text-foreground-muted transition-colors hover:bg-danger-subtle hover:text-danger"
          aria-label="Delete MCP log"
        >
          <Trash2 size={14} />
        </button>
      )}
    />
  );
}

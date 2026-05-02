import React from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../../components/ui-v2/button';
import { Skeleton } from '../../components/ui-v2/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui-v2/table';
import { Pill } from '../../components/chips/Pill';
import { formatLatencyMs, formatRequestId, EMPTY_CELL } from '../../lib/format-design';
import { useMcpLogs } from '../../hooks/queries/useMcp';
import type { McpLogRecord } from '../../lib/api';

const PAGE_SIZE = 20;

const formatRelative = (ms: number | string | undefined): string => {
  if (ms == null) return EMPTY_CELL;
  const t = typeof ms === 'string' ? new Date(ms).getTime() : ms;
  if (!Number.isFinite(t)) return EMPTY_CELL;
  const elapsed = Date.now() - t;
  if (elapsed < 60_000) return 'just now';
  if (elapsed < 3_600_000) return `${Math.round(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.round(elapsed / 3_600_000)}h ago`;
  return `${Math.round(elapsed / 86_400_000)}d ago`;
};

const statusToneFor = (status: number | null): 'success' | 'warning' | 'danger' | 'neutral' => {
  if (status == null) return 'neutral';
  if (status >= 500) return 'danger';
  if (status >= 400) return 'warning';
  if (status >= 200 && status < 300) return 'success';
  return 'neutral';
};

export const McpLogsPanel: React.FC = () => {
  const [page, setPage] = React.useState(0);
  const { data, isLoading, isError, refetch, isFetching } = useMcpLogs(page, {}, PAGE_SIZE);

  const records: McpLogRecord[] = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-foreground">Recent invocations</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Last {PAGE_SIZE} MCP requests across all servers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-foreground-subtle">
            {total > 0
              ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`
              : '—'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh"
          >
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} strokeWidth={1.75} />
          </Button>
        </div>
      </div>

      {isError ? (
        <div className="rounded-lg border border-danger/40 bg-danger-subtle px-4 py-3">
          <p className="text-sm font-medium text-danger">Failed to load MCP logs</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : isLoading && records.length === 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-surface p-3">
          <div className="space-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">No MCP requests yet</p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Once a client calls a configured MCP server, the request shows up here.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border bg-surface hover:bg-surface">
                  <TableHead className="h-8 text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
                    Time
                  </TableHead>
                  <TableHead className="h-8 text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
                    Status
                  </TableHead>
                  <TableHead className="h-8 text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
                    Server
                  </TableHead>
                  <TableHead className="h-8 text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
                    Method
                  </TableHead>
                  <TableHead className="h-8 text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
                    Tool
                  </TableHead>
                  <TableHead className="h-8 text-right text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
                    Latency
                  </TableHead>
                  <TableHead className="h-8 text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
                    ID
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow
                    key={record.request_id}
                    className={cn(
                      'border-b border-border last:border-b-0 hover:bg-surface-elevated'
                    )}
                    style={{ height: 'var(--row-height, 40px)' }}
                  >
                    <TableCell className="py-1.5">
                      <span
                        className="font-mono text-[11px] tabular-nums text-foreground-muted"
                        title={record.created_at}
                      >
                        {formatRelative(record.start_time)}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Pill size="sm" tone={statusToneFor(record.response_status)}>
                        {record.response_status ?? EMPTY_CELL}
                      </Pill>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className="font-mono text-xs text-foreground">
                        {record.server_name}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className="font-mono text-[11px] text-foreground-muted">
                        {record.method}
                        {record.jsonrpc_method && (
                          <span className="text-foreground-subtle"> · {record.jsonrpc_method}</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      {record.tool_name ? (
                        <span className="font-mono text-[11px] text-foreground">
                          {record.tool_name}
                        </span>
                      ) : (
                        <span className="text-foreground-subtle">{EMPTY_CELL}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 text-right">
                      <span className="font-mono text-[11px] tabular-nums text-foreground">
                        {record.duration_ms != null
                          ? formatLatencyMs(record.duration_ms)
                          : EMPTY_CELL}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className="font-mono text-[11px] tabular-nums text-foreground-subtle">
                        {formatRequestId(record.request_id)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft strokeWidth={1.75} /> Newer
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total}
            >
              Older <ChevronRight strokeWidth={1.75} />
            </Button>
          </div>
        </>
      )}
    </section>
  );
};

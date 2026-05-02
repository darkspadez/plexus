import React from 'react';
import { Plug, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '../components/templates';
import { Button } from '../components/ui-v2/button';
import { EmptyState } from '../components/ui-v2/empty-state';
import { Skeleton } from '../components/ui-v2/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui-v2/alert-dialog';
import { Pill } from '../components/chips/Pill';
import { useMcpServers, useDeleteMcpServer, useSaveMcpServer } from '../hooks/queries/useMcp';
import type { McpServer } from '../lib/api';
import { McpServerTable, type McpServerRow } from './mcp/McpServerTable';
import { McpServerSheet } from './mcp/McpServerSheet';
import { McpLogsPanel } from './mcp/McpLogsPanel';

export const McpPage: React.FC = () => {
  const { data, isLoading, isError, refetch, isFetching } = useMcpServers();
  const save = useSaveMcpServer();
  const remove = useDeleteMcpServer();

  const [editing, setEditing] = React.useState<{
    name: string | null;
    initial: McpServer | null;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<McpServerRow | null>(null);

  const rows: McpServerRow[] = React.useMemo(() => {
    if (!data) return [];
    return Object.entries(data)
      .map(([name, server]) => ({
        name,
        server,
        headerCount: Object.keys(server.headers ?? {}).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const handleToggle = async (row: McpServerRow, next: boolean) => {
    try {
      await save.mutateAsync({
        name: row.name,
        server: { ...row.server, enabled: next },
      });
    } catch (e) {
      toast.error(`Failed to update: ${(e as Error).message}`);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.name);
      toast.success(`Deleted ${pendingDelete.name}`);
      setPendingDelete(null);
    } catch (e) {
      toast.error(`Failed to delete: ${(e as Error).message}`);
    }
  };

  return (
    <ListPage
      title="MCP Servers"
      subtitle="Configure Model Context Protocol upstream servers."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} strokeWidth={1.75} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setEditing({ name: null, initial: null })}>
            <Plus strokeWidth={1.75} />
            Add server
          </Button>
        </>
      }
    >
      {isError ? (
        <div className="rounded-lg border border-danger/40 bg-danger-subtle px-4 py-3">
          <p className="text-sm font-medium text-danger">Failed to load MCP servers</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : isLoading ? (
        <div className="overflow-hidden rounded-lg border border-border bg-surface p-3">
          <div className="space-y-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No MCP servers configured"
          description="Add an upstream Model Context Protocol server to expose its tools to configured providers."
        >
          <Button onClick={() => setEditing({ name: null, initial: null })}>
            <Plus strokeWidth={1.75} /> Add server
          </Button>
          <Pill size="sm" tone="neutral">
            See setup guide
          </Pill>
        </EmptyState>
      ) : (
        <>
          <McpServerTable
            rows={rows}
            onEdit={(row) => setEditing({ name: row.name, initial: row.server })}
            onDelete={setPendingDelete}
            onToggle={handleToggle}
          />
          <McpLogsPanel />
        </>
      )}

      <McpServerSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        editingName={editing?.name ?? null}
        initial={editing?.initial ?? null}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete MCP server?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  Delete <code className="font-mono text-foreground">{pendingDelete.name}</code>?
                  Any clients pointed at it will receive errors.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListPage>
  );
};

export default McpPage;

import React from 'react';
import { Key as KeyIcon, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '../components/templates';
import { Button } from '../components/ui-v2/button';
import { EmptyState } from '../components/ui-v2/empty-state';
import { Skeleton } from '../components/ui-v2/skeleton';
import { SearchInput } from '../components/ui-v2/search-input';
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
import { useKeys, useDeleteKey } from '../hooks/queries/useKeys';
import { KeyTable } from './keys/KeyTable';
import { KeySheet } from './keys/KeySheet';
import type { KeyConfig } from '../lib/api';

export const Keys: React.FC = () => {
  const { data, isLoading, isError, refetch, isFetching } = useKeys();
  const remove = useDeleteKey();
  const [search, setSearch] = React.useState('');
  const [editing, setEditing] = React.useState<KeyConfig | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = React.useState<KeyConfig | null>(null);

  const filtered = React.useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (k) =>
        k.key.toLowerCase().includes(q) ||
        (k.comment ?? '').toLowerCase().includes(q) ||
        (k.quota ?? '').toLowerCase().includes(q)
    );
  }, [data, search]);

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.key);
      toast.success(`Deleted ${pendingDelete.key}`);
      setPendingDelete(null);
    } catch (e) {
      toast.error(`Failed to delete: ${(e as Error).message}`);
    }
  };

  return (
    <ListPage
      title="API Keys"
      subtitle="Manage credentials and per-key access controls."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} strokeWidth={1.75} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setEditing(null)}>
            <Plus strokeWidth={1.75} />
            Add Key
          </Button>
        </>
      }
      filters={
        (data?.length ?? 0) > 0 ? (
          <SearchInput
            placeholder="Search keys, comments, quotas…"
            value={search}
            onChange={setSearch}
            className="max-w-sm"
          />
        ) : undefined
      }
    >
      {isError ? (
        <div className="rounded-lg border border-danger/40 bg-danger-subtle px-4 py-3">
          <p className="text-sm font-medium text-danger">Failed to load keys</p>
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
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={KeyIcon}
          title={search ? 'No matching keys' : 'No API keys yet'}
          description="API keys grant scoped access to providers, models, and quotas. The secret is shown only once at creation."
        >
          {search ? (
            <Button onClick={() => setSearch('')}>Clear search</Button>
          ) : (
            <Button onClick={() => setEditing(null)}>
              <Plus strokeWidth={1.75} /> Add Key
            </Button>
          )}
        </EmptyState>
      ) : (
        <KeyTable rows={filtered} onEdit={(k) => setEditing(k)} onDelete={setPendingDelete} />
      )}

      <KeySheet
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        editing={editing ?? null}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API key?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  Delete <code className="font-mono text-foreground">{pendingDelete.key}</code>? Any
                  clients using its secret will receive 401 errors. Historical logs and traces
                  (indexed by key name) are preserved.
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

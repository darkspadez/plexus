import React from 'react';
import { Plus, RefreshCw, Shield } from 'lucide-react';
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
import { useUserQuotas, useDeleteUserQuota } from '../hooks/queries/useUserQuotas';
import type { UserQuota } from '../lib/api';
import { UserQuotaTable, type UserQuotaRow } from './user-quotas/UserQuotaTable';
import { UserQuotaSheet } from './user-quotas/UserQuotaSheet';

export const UserQuotas: React.FC = () => {
  const { data, isLoading, isError, refetch, isFetching } = useUserQuotas();
  const remove = useDeleteUserQuota();

  const [editing, setEditing] = React.useState<{
    name: string | null;
    initial: UserQuota | null;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<UserQuotaRow | null>(null);

  const rows: UserQuotaRow[] = React.useMemo(() => {
    if (!data) return [];
    return Object.entries(data)
      .map(([name, quota]) => ({ name, quota }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

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
      title="User Quotas"
      subtitle="Rate-limit per-key usage by request count, token count, or cost."
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh"
          >
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} strokeWidth={1.75} />
          </Button>
          <Button size="sm" onClick={() => setEditing({ name: null, initial: null })}>
            <Plus strokeWidth={1.75} />
            Add quota
          </Button>
        </>
      }
    >
      {isError ? (
        <div className="rounded-lg border border-danger/40 bg-danger-subtle px-4 py-3">
          <p className="text-sm font-medium text-danger">Failed to load user quotas</p>
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
          icon={Shield}
          title="No user quotas configured"
          description="Define a quota here, then attach it to one or more API keys from the Keys page."
        >
          <Button onClick={() => setEditing({ name: null, initial: null })}>
            <Plus strokeWidth={1.75} /> Add quota
          </Button>
        </EmptyState>
      ) : (
        <UserQuotaTable
          rows={rows}
          onEdit={(row) => setEditing({ name: row.name, initial: row.quota })}
          onDelete={setPendingDelete}
        />
      )}

      <UserQuotaSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        editingName={editing?.name ?? null}
        initial={editing?.initial ?? null}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user quota?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  Delete <code className="font-mono text-foreground">{pendingDelete.name}</code>?
                  Any API keys still pointing at it will fall back to unrestricted usage.
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

/**
 * UserQuotas — list page for per-user rate-limit configurations.
 *
 * Phase 4 tracer-bullet page demonstrating the canonical patterns:
 *   - TanStack Query data + mutations (useUserQuotas, useDeleteUserQuota)
 *   - Sheet form in <Modal size="md"> (UserQuotaSheet)
 *   - TanStack Table with mobile-card fallback (UserQuotaTable)
 *   - Confirm dialog via <Modal size="sm"> for destructive actions
 *   - Loading skeletons, empty state, error banner
 *   - Admin-gated (route-level guard in App.tsx)
 */
import React from 'react';
import { Plus, RefreshCw, Shield } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TagSelect } from '../components/ui/TagSelect';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import { useUserQuotas, useDeleteUserQuota } from '../hooks/queries/useUserQuotas';
import {
  useApiKeys,
  useKeysProviderIds,
  useKeysAllModelNames,
  useDefaultQuotaNames,
  useSetDefaultQuotas,
} from '../hooks/queries/useKeys';
import { useToast } from '../contexts/ToastContext';
import { UserQuotaTable, type UserQuotaRow } from './user-quotas/UserQuotaTable';
import { UserQuotaSheet } from './user-quotas/UserQuotaSheet';
import type { UserQuota } from '../lib/api';

export const UserQuotas: React.FC = () => {
  const { data, isLoading, isError, refetch, isFetching } = useUserQuotas();
  const remove = useDeleteUserQuota();
  const { success: toastSuccess } = useToast();
  // Scope-restriction options for the sheet's Allowed/Excluded Providers and
  // Models TagSelects — same source hooks the Keys page uses.
  const { data: providerIds = [] } = useKeysProviderIds();
  const { data: allModelNames = [] } = useKeysAllModelNames();
  // Keys list (for the "Keys Using" column) + system-wide default-quotas
  // (for the "Default quotas" card) — moved here from the Keys page, same
  // source hooks.
  const { data: keys = [] } = useApiKeys();
  const { data: defaultQuotaNames = [] } = useDefaultQuotaNames();
  const setDefaultQuotasMutation = useSetDefaultQuotas();

  // Sheet state — null = closed; { name: null } = create; { name: string } = edit
  const [editing, setEditing] = React.useState<{
    name: string | null;
    initial: UserQuota | null;
  } | null>(null);

  // Delete confirm state
  const [pendingDelete, setPendingDelete] = React.useState<UserQuotaRow | null>(null);

  // Derive sorted rows from the record map
  const rows: UserQuotaRow[] = React.useMemo(() => {
    if (!data) return [];
    return Object.entries(data)
      .map(([name, quota]) => ({ name, quota }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  // Quota name -> number of keys referencing it — moved from Keys.tsx's old
  // "Keys Using" column derivation (same `k.quotas?.includes(name)` check).
  const keysUsingCounts: Record<string, number> = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.name] = keys.filter((k) => k.quotas?.includes(row.name)).length;
    }
    return counts;
  }, [rows, keys]);

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    // Use mutate (not mutateAsync) — onError in the hook handles error UX.
    remove.mutate(pendingDelete.name, {
      onSuccess: () => {
        toastSuccess(`Deleted ${pendingDelete!.name}`);
        setPendingDelete(null);
      },
    });
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="User Quotas"
        subtitle="Rate-limit per-key usage by request count, token count, or cost."
        actions={
          <>
            <Button
              variant="secondary"
              size="md"
              onClick={() => refetch()}
              disabled={isFetching}
              leftIcon={<RefreshCw size={13} className={isFetching ? 'animate-spin' : undefined} />}
            >
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              size="md"
              onClick={() => setEditing({ name: null, initial: null })}
              leftIcon={<Plus size={14} />}
            >
              Add Quota
            </Button>
          </>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Body                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <PageContainer className="flex flex-col gap-6">
        {/* Error banner */}
        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger-subtle px-4 py-3">
            <p className="text-sm font-medium text-danger">Failed to load user quotas</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {/* Loading skeletons */}
        {!isError && isLoading && (
          <div className="overflow-hidden rounded-lg border border-border bg-surface p-3">
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height={40} className="w-full" />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isError && !isLoading && rows.length === 0 && (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState
              variant="dense"
              icon={<Shield />}
              title="No user quotas yet"
              description="Define a quota here, then attach it to one or more API keys from the Keys page."
              action={
                <Button
                  onClick={() => setEditing({ name: null, initial: null })}
                  leftIcon={<Plus size={14} />}
                >
                  Add Quota
                </Button>
              }
            />
          </div>
        )}

        {/* Table (desktop + mobile cards) */}
        {!isError && !isLoading && rows.length > 0 && (
          <UserQuotaTable
            rows={rows}
            onEdit={(row) => setEditing({ name: row.name, initial: row.quota })}
            onDelete={setPendingDelete}
            keysUsingCounts={keysUsingCounts}
          />
        )}

        {/* Default quotas — moved here from the Keys page */}
        <Card title="Default quotas">
          <p className="text-xs text-foreground-muted mb-3">
            Applied to any key with no quotas of its own (non-stacking — a key&apos;s own{' '}
            <code>quotas</code> always wins over this fallback when set).
          </p>
          <TagSelect
            placeholder="No default quotas — select one or more..."
            options={Object.keys(data ?? {}).sort()}
            selected={defaultQuotaNames}
            onChange={(names) => setDefaultQuotasMutation.mutate(names)}
          />
          {setDefaultQuotasMutation.isPending && (
            <p className="mt-2 text-xs text-foreground-muted">Saving…</p>
          )}
        </Card>
      </PageContainer>

      {/* ------------------------------------------------------------------ */}
      {/* Create / Edit sheet                                                  */}
      {/* ------------------------------------------------------------------ */}
      <UserQuotaSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        editingName={editing?.name ?? null}
        initial={editing?.initial ?? null}
        providerIds={providerIds}
        allModelNames={allModelNames}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Delete confirm dialog                                                */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete user quota?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete} isLoading={remove.isPending}>
              Delete
            </Button>
          </>
        }
      >
        {pendingDelete && (
          <p className="text-sm text-foreground-muted">
            Delete{' '}
            <code className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-foreground text-xs">
              {pendingDelete.name}
            </code>
            ? Any API keys still pointing at it will fall back to unrestricted usage.
          </p>
        )}
      </Modal>
    </div>
  );
};

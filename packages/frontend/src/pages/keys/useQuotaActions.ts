import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useClearQuota, useRecomputeQuota } from '../../hooks/queries/useKeys';
import type { LoadQuotaStatuses, QuotaStatusResponse } from './types';

interface UseQuotaActionsOptions {
  quotaStatuses: Record<string, QuotaStatusResponse>;
  loadQuotaStatuses: LoadQuotaStatuses;
}

/**
 * Per-key quota *status* actions (view / reset / recompute usage).
 *
 * Quota *definition* CRUD (create/edit/delete a quota, default-quotas
 * assignment) lives on the dedicated `/user-quotas` page (`UserQuotas.tsx`,
 * `useUserQuotas`/`useSetDefaultQuotas`) — moved there in the design refresh,
 * so it is intentionally not duplicated here.
 */
export function useQuotaActions({ quotaStatuses, loadQuotaStatuses }: UseQuotaActionsOptions) {
  const toast = useToast();
  const clearQuotaMutation = useClearQuota();
  const recomputeQuotaMutation = useRecomputeQuota();

  const [isQuotaDetailOpen, setIsQuotaDetailOpen] = useState(false);
  const [selectedQuotaName, setSelectedQuotaName] = useState<string | null>(null);
  const [selectedQuotaStatus, setSelectedQuotaStatus] = useState<QuotaStatusResponse | null>(null);

  const handleClearQuota = async (keyName: string, quotaName?: string) => {
    const confirmed = await toast.confirm({
      title: 'Reset quota?',
      message: quotaName
        ? `Reset usage for quota '${quotaName}' on key '${keyName}'?`
        : `Reset usage for every quota attached to key '${keyName}'?`,
      confirmLabel: 'Reset',
    });
    if (!confirmed) return;

    clearQuotaMutation.mutate(
      { keyName, quotaName },
      {
        onSuccess: async () => {
          // Keep the detail modal open (if open) showing fresh numbers,
          // reusing the status the refresh just fetched instead of a second
          // round trip.
          const statuses = await loadQuotaStatuses();
          if (selectedQuotaName === keyName && statuses?.[keyName]) {
            setSelectedQuotaStatus(statuses[keyName]);
          }
        },
      }
    );
  };

  const handleRecomputeQuota = (keyName: string, quotaName: string) => {
    recomputeQuotaMutation.mutate(
      { keyName, quotaName },
      {
        onSuccess: async () => {
          toast.success(`Quota '${quotaName}' recomputed`);
          const statuses = await loadQuotaStatuses();
          if (selectedQuotaName === keyName && statuses?.[keyName]) {
            setSelectedQuotaStatus(statuses[keyName]);
          }
        },
      }
    );
  };

  const handleViewQuotaStatus = (keyName: string) => {
    const status = quotaStatuses[keyName];
    if (status) {
      setSelectedQuotaName(keyName);
      setSelectedQuotaStatus(status);
      setIsQuotaDetailOpen(true);
    }
  };

  return {
    isQuotaDetailOpen,
    setIsQuotaDetailOpen,
    selectedQuotaName,
    selectedQuotaStatus,
    recomputingQuota: recomputeQuotaMutation.isPending
      ? (recomputeQuotaMutation.variables?.quotaName ?? null)
      : null,
    handleClearQuota,
    handleRecomputeQuota,
    handleViewQuotaStatus,
  };
}

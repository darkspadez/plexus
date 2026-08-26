import { useState, type Dispatch, type SetStateAction } from 'react';
import { api, type UserQuota } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { EMPTY_QUOTA } from './constants';
import type { EditableQuota, QuotaStatusResponse } from './types';

interface UseQuotaActionsOptions {
  readonly quotaStatuses: Record<string, QuotaStatusResponse>;
  readonly defaultQuotaNames: string[];
  readonly setDefaultQuotaNames: Dispatch<SetStateAction<string[]>>;
  readonly loadData: () => Promise<Record<string, QuotaStatusResponse> | null>;
}

export const useQuotaActions = ({
  quotaStatuses,
  defaultQuotaNames,
  setDefaultQuotaNames,
  loadData,
}: UseQuotaActionsOptions) => {
  const toast = useToast();
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [editingQuota, setEditingQuota] = useState<EditableQuota>(EMPTY_QUOTA);
  const [originalQuotaName, setOriginalQuotaName] = useState<string | null>(null);
  const [isSavingQuota, setIsSavingQuota] = useState(false);
  const [isQuotaDetailOpen, setIsQuotaDetailOpen] = useState(false);
  const [selectedQuotaName, setSelectedQuotaName] = useState<string | null>(null);
  const [selectedQuotaStatus, setSelectedQuotaStatus] = useState<QuotaStatusResponse | null>(null);
  const [recomputingQuota, setRecomputingQuota] = useState<string | null>(null);

  const editQuota = (name: string, quota: UserQuota) => {
    setOriginalQuotaName(name);
    setEditingQuota({ name, ...quota });
    setIsQuotaModalOpen(true);
  };

  const addQuota = () => {
    setOriginalQuotaName(null);
    setEditingQuota({ ...EMPTY_QUOTA });
    setIsQuotaModalOpen(true);
  };

  const saveQuota = async () => {
    if (!editingQuota.name) return;
    if (editingQuota.type === 'rolling' && !editingQuota.duration) {
      toast.error('Rolling quotas require a duration');
      return;
    }
    if (
      editingQuota.warnAt !== undefined &&
      (editingQuota.warnAt <= 0 || editingQuota.warnAt >= 1)
    ) {
      toast.error('Warn threshold must be between 0% and 100% (exclusive)');
      return;
    }
    setIsSavingQuota(true);
    try {
      const { name, allowedProviders, excludedProviders, allowedModels, excludedModels, ...rest } =
        editingQuota;
      const quotaData: UserQuota = {
        ...rest,
        ...(allowedProviders?.length ? { allowedProviders } : {}),
        ...(excludedProviders?.length ? { excludedProviders } : {}),
        ...(allowedModels?.length ? { allowedModels } : {}),
        ...(excludedModels?.length ? { excludedModels } : {}),
      };
      if (originalQuotaName && originalQuotaName !== name) {
        await api.deleteUserQuota(originalQuotaName);
      }
      await api.saveUserQuota(name, quotaData);
      await loadData();
      setIsQuotaModalOpen(false);
    } catch (error) {
      console.error('Failed to save quota', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save quota');
    } finally {
      setIsSavingQuota(false);
    }
  };

  const deleteQuota = async (name: string) => {
    const confirmed = await toast.confirm({
      title: 'Delete quota?',
      message: `Are you sure you want to delete quota '${name}'? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteUserQuota(name);
      await loadData();
    } catch (error) {
      console.error('Failed to delete quota', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete quota');
    }
  };

  const clearQuota = async (keyName: string, quotaName?: string) => {
    const confirmed = await toast.confirm({
      title: 'Reset quota?',
      message: quotaName
        ? `Reset usage for quota '${quotaName}' on key '${keyName}'?`
        : `Reset usage for every quota attached to key '${keyName}'?`,
      confirmLabel: 'Reset',
    });
    if (!confirmed) return;
    try {
      await api.clearQuota(keyName, quotaName);
      const statuses = await loadData();
      if (selectedQuotaName === keyName && statuses?.[keyName]) {
        setSelectedQuotaStatus(statuses[keyName]);
      }
    } catch (error) {
      console.error('Failed to clear quota', error);
      toast.error(error instanceof Error ? error.message : 'Failed to clear quota');
    }
  };

  const recomputeQuota = async (keyName: string, quotaName: string) => {
    setRecomputingQuota(quotaName);
    try {
      await api.recomputeQuota(keyName, quotaName);
      toast.success(`Quota '${quotaName}' recomputed`);
      const statuses = await loadData();
      if (selectedQuotaName === keyName && statuses?.[keyName]) {
        setSelectedQuotaStatus(statuses[keyName]);
      }
    } catch (error) {
      console.error('Failed to recompute quota', error);
      toast.error(error instanceof Error ? error.message : 'Failed to recompute quota');
    } finally {
      setRecomputingQuota(null);
    }
  };

  const saveDefaultQuotas = async (names: string[]) => {
    setIsSavingDefaults(true);
    const previous = defaultQuotaNames;
    setDefaultQuotaNames(names);
    try {
      await api.setDefaultQuotas(names);
      await loadData();
    } catch (error) {
      console.error('Failed to save default quotas', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save default quotas');
      setDefaultQuotaNames(previous);
    } finally {
      setIsSavingDefaults(false);
    }
  };

  const viewQuotaStatus = (keyName: string) => {
    const status = quotaStatuses[keyName];
    if (!status) return;
    setSelectedQuotaName(keyName);
    setSelectedQuotaStatus(status);
    setIsQuotaDetailOpen(true);
  };

  return {
    isSavingDefaults,
    isQuotaModalOpen,
    closeQuotaModal: () => setIsQuotaModalOpen(false),
    editingQuota,
    setEditingQuota,
    originalQuotaName,
    isSavingQuota,
    isQuotaDetailOpen,
    closeQuotaDetail: () => setIsQuotaDetailOpen(false),
    selectedQuotaName,
    selectedQuotaStatus,
    recomputingQuota,
    editQuota,
    addQuota,
    saveQuota,
    deleteQuota,
    clearQuota,
    recomputeQuota,
    saveDefaultQuotas,
    viewQuotaStatus,
  };
};

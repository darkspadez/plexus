import { useState } from 'react';
import {
  createKey,
  deleteKey,
  disableKey,
  rotateKey,
  updateKey,
  type EditableKeyConfig,
  type KeyConfig,
  type OneTimeSecret,
} from '../../lib/api/keys';
import { useToast } from '../../contexts/ToastContext';
import { EMPTY_KEY } from './constants';
import type { ExpiryUnit, QuotaStatusResponse } from './types';

interface UseKeyActionsOptions {
  readonly loadData: () => Promise<Record<string, QuotaStatusResponse> | null>;
}

export const useKeyActions = ({ loadData }: UseKeyActionsOptions) => {
  const toast = useToast();
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<EditableKeyConfig>(EMPTY_KEY);
  const [originalKeyName, setOriginalKeyName] = useState<string | null>(null);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [expiryAmount, setExpiryAmount] = useState('');
  const [expiryUnit, setExpiryUnit] = useState<ExpiryUnit>('days');
  const [isRotating, setIsRotating] = useState(false);
  const [oneTimeSecret, setOneTimeSecret] = useState<OneTimeSecret | null>(null);

  const editKey = (key: KeyConfig) => {
    setOriginalKeyName(key.key);
    setEditingKey({ ...key });
    setExpiryAmount('');
    setIsKeyModalOpen(true);
  };

  const addKey = () => {
    setOriginalKeyName(null);
    setEditingKey({ ...EMPTY_KEY, allowedIps: ['0.0.0.0/0', '::/0'] });
    setExpiryAmount('');
    setExpiryUnit('days');
    setIsKeyModalOpen(true);
  };

  const save = async () => {
    if (!editingKey.key) return;
    const amount = Number(expiryAmount);
    if (!originalKeyName && expiryAmount && (!Number.isInteger(amount) || amount <= 0)) {
      toast.error('Expiry must be a positive whole number');
      return;
    }
    const minutesPerUnit = { minutes: 1, hours: 60, days: 1_440 } as const;
    const keyToSave =
      !originalKeyName && expiryAmount
        ? { ...editingKey, expiresInMinutes: amount * minutesPerUnit[expiryUnit] }
        : editingKey;
    setIsSavingKey(true);
    try {
      const generated = originalKeyName ? null : await createKey(keyToSave);
      if (originalKeyName) await updateKey(keyToSave);
      setIsKeyModalOpen(false);
      if (generated) setOneTimeSecret(generated);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save key');
    } finally {
      setIsSavingKey(false);
    }
  };

  const rotate = async () => {
    if (!originalKeyName) return;
    const confirmed = await toast.confirm({
      title: 'Rotate secret?',
      message: `Rotate the secret for '${originalKeyName}'? The current secret will stop working immediately.`,
      confirmLabel: 'Rotate secret',
      variant: 'danger',
    });
    if (!confirmed) return;

    setIsRotating(true);
    try {
      const generated = await rotateKey(originalKeyName);
      setIsKeyModalOpen(false);
      setOneTimeSecret(generated);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rotate secret');
    } finally {
      setIsRotating(false);
    }
  };

  const disable = async (key: KeyConfig) => {
    const confirmed = await toast.confirm({
      title: 'Disable key?',
      message: `Disable '${key.key}' immediately? This cannot be undone.`,
      confirmLabel: 'Disable',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await disableKey(key.key);
      await loadData();
      toast.success(`Key '${key.key}' disabled`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to disable key');
    }
  };

  const remove = async (keyName: string) => {
    const confirmed = await toast.confirm({
      title: 'Delete key?',
      message: `Are you sure you want to delete key '${keyName}'? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteKey(keyName);
      await loadData();
    } catch (error) {
      toast.error('Failed to delete key');
    }
  };

  return {
    isKeyModalOpen,
    closeKeyModal: () => setIsKeyModalOpen(false),
    editingKey,
    setEditingKey,
    originalKeyName,
    isSavingKey,
    expiryAmount,
    setExpiryAmount,
    expiryUnit,
    setExpiryUnit,
    isRotating,
    oneTimeSecret,
    editKey,
    addKey,
    saveKey: save,
    rotateKey: rotate,
    disableKey: disable,
    deleteKey: remove,
    closeOneTimeSecret: () => setOneTimeSecret(null),
  };
};

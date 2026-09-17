import { useState } from 'react';
import type { KeyConfig } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { copyToClipboard, isClipboardAvailable } from '../../lib/clipboard';
import { useDeleteKey, useDisableKey } from '../../hooks/queries/useKeys';

/**
 * Key list/lifecycle actions for the Keys page.
 *
 * Create/edit itself lives in `KeySheet` (react-hook-form + zod, calls
 * `api.saveKey()` and invalidates the `useApiKeys` query directly) — this
 * hook only owns which key is open in the sheet, plus the actions that act
 * on an existing key from the list (disable / delete / copy secret).
 */
export function useKeyActions() {
  const toast = useToast();
  const deleteKeyMutation = useDeleteKey();
  const disableKeyMutation = useDisableKey();

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isKeySheetOpen, setIsKeySheetOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<KeyConfig | null>(null);
  const [originalKeyName, setOriginalKeyName] = useState<string | null>(null);

  const handleEditKey = (key: KeyConfig) => {
    setOriginalKeyName(key.key);
    setEditingKey({ ...key });
    setIsKeySheetOpen(true);
  };

  const handleAddNewKey = () => {
    setOriginalKeyName(null);
    setEditingKey(null);
    setIsKeySheetOpen(true);
  };

  const handleDisableKey = async (key: KeyConfig) => {
    const confirmed = await toast.confirm({
      title: 'Disable key?',
      message: `Disable '${key.key}' immediately? This cannot be undone.`,
      confirmLabel: 'Disable',
      variant: 'danger',
    });
    if (!confirmed) return;
    disableKeyMutation.mutate(key.key);
  };

  const handleDeleteKey = async (keyName: string) => {
    const confirmed = await toast.confirm({
      title: 'Delete key?',
      message: `Are you sure you want to delete key '${keyName}'? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    deleteKeyMutation.mutate(keyName);
  };

  const handleCopy = async (text: string, keyId: string) => {
    if (!isClipboardAvailable()) return;
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedKey(keyId);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  return {
    copiedKey,
    isKeySheetOpen,
    setIsKeySheetOpen,
    editingKey,
    originalKeyName,
    handleEditKey,
    handleAddNewKey,
    handleDisableKey,
    handleDeleteKey,
    handleCopy,
  };
}

import { useState, type Dispatch, type SetStateAction } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import type { UserQuota } from '../../lib/api';
import type { EditableKeyConfig } from '../../lib/api/keys';
import { formatExpiry } from './keyUtils';
import { KeyAccessFields } from './KeyAccessFields';
import type { ExpiryUnit } from './types';

interface KeyEditorModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly editingKey: EditableKeyConfig;
  readonly setEditingKey: Dispatch<SetStateAction<EditableKeyConfig>>;
  readonly originalKeyName: string | null;
  readonly isSaving: boolean;
  readonly expiryAmount: string;
  readonly setExpiryAmount: Dispatch<SetStateAction<string>>;
  readonly expiryUnit: ExpiryUnit;
  readonly setExpiryUnit: Dispatch<SetStateAction<ExpiryUnit>>;
  readonly aliasIds: string[];
  readonly providerIds: string[];
  readonly quotas: Readonly<Record<string, UserQuota>>;
  readonly isRotating: boolean;
  readonly onRotate: () => void;
  readonly onSave: () => void;
}

export const KeyEditorModal = ({
  isOpen,
  onClose,
  editingKey,
  setEditingKey,
  originalKeyName,
  isSaving,
  expiryAmount,
  setExpiryAmount,
  expiryUnit,
  setExpiryUnit,
  aliasIds,
  providerIds,
  quotas,
  isRotating,
  onRotate,
  onSave,
}: KeyEditorModalProps) => {
  const [expiryError, setExpiryError] = useState<string | null>(null);

  const handleClose = () => {
    setExpiryError(null);
    onClose();
  };

  const handleSave = () => {
    const amount = Number(expiryAmount);
    if (!originalKeyName && expiryAmount && (!Number.isInteger(amount) || amount <= 0)) {
      setExpiryError('Expiry must be a positive whole number');
      return;
    }
    setExpiryError(null);
    onSave();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={originalKeyName ? 'Edit Key' : 'Add Key'}
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} isLoading={isSaving} disabled={!editingKey.key}>
            Save Key
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="flex flex-col gap-2">
          <Input
            label="Key Name (ID)"
            value={editingKey.key}
            onChange={(event) => setEditingKey({ ...editingKey, key: event.target.value })}
            placeholder="e.g. production-app-1"
            disabled={Boolean(originalKeyName)}
          />
          <p className="text-xs text-text-muted">
            {originalKeyName
              ? 'Key ID cannot be changed once created.'
              : 'A unique identifier for this key.'}
          </p>
        </div>
        {originalKeyName && (
          <div className="rounded-md border border-border-glass bg-bg-subtle p-3">
            <div className="text-xs font-medium text-text-secondary">Credential fingerprint</div>
            <code className="mt-1 block text-sm text-text">
              sha256:{editingKey.fingerprint ?? 'unavailable'}
            </code>
            <p className="mt-2 text-xs text-text-muted">
              The secret cannot be viewed or recovered. Rotation is the only recovery if it is lost,
              and immediately invalidates the current secret.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full sm:w-auto"
              leftIcon={<RotateCw size={14} />}
              onClick={onRotate}
              isLoading={isRotating}
            >
              Rotate secret
            </Button>
          </div>
        )}
        <Input
          label="Comment"
          value={editingKey.comment || ''}
          onChange={(event) => setEditingKey({ ...editingKey, comment: event.target.value })}
          placeholder="Optional description..."
        />
        {originalKeyName ? (
          editingKey.expiresAt && (
            <div className="rounded-md border border-border-glass bg-bg-subtle p-3 text-sm text-text-secondary">
              <div>Expires: {formatExpiry(editingKey.expiresAt)}</div>
              <p className="mt-1 text-xs text-text-muted">
                Expiry cannot be changed after creation.
              </p>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2">
            <label className="font-body text-[13px] font-medium text-text-secondary">
              Expiry (optional)
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                step={1}
                value={expiryAmount}
                onChange={(event) => {
                  setExpiryAmount(event.target.value);
                  setExpiryError(null);
                }}
                placeholder="Never expires"
                aria-describedby={expiryError ? 'key-expiry-error' : undefined}
                aria-invalid={expiryError !== null}
                className={expiryError ? 'border-danger' : undefined}
              />
              <select
                className="rounded-md border border-border-glass bg-bg-subtle px-3 text-sm text-text"
                value={expiryUnit}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'minutes' || value === 'hours' || value === 'days')
                    setExpiryUnit(value);
                }}
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
            {expiryError && (
              <p id="key-expiry-error" role="alert" className="text-xs text-danger">
                {expiryError}
              </p>
            )}
            <p className="text-xs text-text-muted">
              Once set, a time-bound key cannot be extended or re-enabled.
            </p>
          </div>
        )}
        <KeyAccessFields
          editingKey={editingKey}
          setEditingKey={setEditingKey}
          aliasIds={aliasIds}
          providerIds={providerIds}
          quotas={quotas}
        />
      </div>
    </Modal>
  );
};

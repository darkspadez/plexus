import type { Dispatch, SetStateAction } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Switch } from '../../components/ui/Switch';
import { QuotaScopeFields } from './QuotaScopeFields';
import type { EditableQuota } from './types';

interface QuotaEditorModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly quota: EditableQuota;
  readonly setQuota: Dispatch<SetStateAction<EditableQuota>>;
  readonly originalName: string | null;
  readonly isSaving: boolean;
  readonly providerIds: string[];
  readonly modelNames: string[];
  readonly onSave: () => void;
}

export const QuotaEditorModal = ({
  isOpen,
  onClose,
  quota,
  setQuota,
  originalName,
  isSaving,
  providerIds,
  modelNames,
  onSave,
}: QuotaEditorModalProps) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={originalName ? 'Edit Quota' : 'Add Quota'}
    size="md"
    footer={
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onSave} isLoading={isSaving} disabled={!quota.name}>
          Save Quota
        </Button>
      </div>
    }
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="flex flex-col gap-2">
        <Input
          label="Quota Name"
          value={quota.name}
          onChange={(event) => setQuota({ ...quota, name: event.target.value })}
          placeholder="e.g. daily-1000"
          disabled={Boolean(originalName)}
        />
        <p className="text-xs text-text-muted">
          {originalName
            ? 'Quota name cannot be changed once created.'
            : 'A unique identifier for this quota. Use lowercase letters, numbers, hyphens.'}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label className="font-body text-[13px] font-medium text-text-secondary">Quota Type</label>
        <select
          className="w-full px-3 py-2 bg-bg-subtle border border-border-glass rounded-md font-body text-sm text-text focus:border-primary focus:outline-none"
          value={quota.type}
          onChange={(event) => {
            const value = event.target.value;
            if (
              value === 'rolling' ||
              value === 'daily' ||
              value === 'weekly' ||
              value === 'monthly'
            ) {
              setQuota({ ...quota, type: value });
            }
          }}
        >
          <option value="rolling">Rolling Window</option>
          <option value="daily">Daily (UTC)</option>
          <option value="weekly">Weekly (UTC)</option>
          <option value="monthly">Monthly (UTC)</option>
        </select>
        <p className="text-xs text-text-muted">
          {quota.type === 'rolling' && 'Limits usage over a sliding time window'}
          {quota.type === 'daily' && 'Resets at midnight UTC each day'}
          {quota.type === 'weekly' && 'Resets at midnight UTC on Monday'}
          {quota.type === 'monthly' && 'Resets at midnight UTC on the 1st of each month'}
        </p>
      </div>
      {quota.type === 'rolling' && (
        <div className="flex flex-col gap-2">
          <Input
            label="Duration"
            value={quota.duration || ''}
            onChange={(event) => setQuota({ ...quota, duration: event.target.value })}
            placeholder="e.g. 1h, 30m, 1d"
          />
          <p className="text-xs text-text-muted">
            Duration of the rolling window (e.g., 1h, 30m, 2h30m, 1d)
          </p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <label className="font-body text-[13px] font-medium text-text-secondary">Limit Type</label>
        <select
          className="w-full px-3 py-2 bg-bg-subtle border border-border-glass rounded-md font-body text-sm text-text focus:border-primary focus:outline-none"
          value={quota.limitType}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'requests' || value === 'tokens' || value === 'cost') {
              setQuota({ ...quota, limitType: value });
            }
          }}
        >
          <option value="requests">Requests</option>
          <option value="tokens">Tokens</option>
          <option value="cost">Cost ($)</option>
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Input
          label="Limit"
          type="number"
          value={quota.limit}
          onChange={(event) => setQuota({ ...quota, limit: parseInt(event.target.value) || 0 })}
          placeholder="1000"
        />
        <p className="text-xs text-text-muted">
          Maximum {quota.limitType === 'cost' ? 'cost ($)' : quota.limitType} allowed
        </p>
      </div>
      <div className="flex items-start justify-between gap-4 rounded-md border border-border-glass bg-bg-subtle p-3">
        <div className="min-w-0 flex-1">
          <div className="font-body text-[13px] font-medium text-text-secondary">Shared bucket</div>
          <p className="mt-1 text-xs text-text-muted">
            Pool usage across every key that references this quota into a single counter, instead of
            tracking each key independently.
          </p>
        </div>
        <Switch
          checked={Boolean(quota.shared)}
          onChange={(shared) => setQuota({ ...quota, shared })}
          aria-label="Toggle shared quota bucket"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Input
          label="Warn threshold (optional)"
          type="number"
          min={1}
          max={99}
          value={quota.warnAt !== undefined ? Math.round(quota.warnAt * 100) : ''}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === '') {
              setQuota({ ...quota, warnAt: undefined });
              return;
            }
            const percent = parseInt(raw, 10);
            if (!Number.isNaN(percent))
              setQuota({ ...quota, warnAt: Math.min(99, Math.max(1, percent)) / 100 });
          }}
          placeholder="e.g. 80"
        />
        <p className="text-xs text-text-muted">
          Percent of the limit at which to flag usage as approaching exhaustion. Leave empty to
          disable early-warning.
        </p>
      </div>
      <QuotaScopeFields
        quota={quota}
        setQuota={setQuota}
        providerIds={providerIds}
        modelNames={modelNames}
      />
    </div>
  </Modal>
);

import { AlertCircle } from 'lucide-react';
import { QuotaStatusCard } from '../../components/quota';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import type { UserQuota } from '../../lib/api';
import { sortMostConstrainedFirst } from '../../lib/quota';
import { isLeakyRollingDef } from './keyUtils';
import type { QuotaStatusResponse } from './types';

interface QuotaDetailModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly keyName: string | null;
  readonly status: QuotaStatusResponse | null;
  readonly quotas: Readonly<Record<string, UserQuota>>;
  readonly recomputingQuota: string | null;
  readonly onClear: (keyName: string, quotaName?: string) => void;
  readonly onRecompute: (keyName: string, quotaName: string) => void;
}

export const QuotaDetailModal = ({
  isOpen,
  onClose,
  keyName,
  status,
  quotas,
  recomputingQuota,
  onClear,
  onRecompute,
}: QuotaDetailModalProps) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={`Quota Status: ${keyName}`}
    size="md"
    footer={
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        {status && status.quotas.length > 0 && (
          <Button onClick={() => onClear(status.key)} variant="secondary">
            Reset All
          </Button>
        )}
      </div>
    }
  >
    {status && (
      <div className="flex flex-col gap-4">
        {status.quotas.length === 0 ? (
          <div className="flex items-center gap-3 p-3 bg-bg-subtle rounded-md">
            <AlertCircle className="text-text-muted" size={20} />
            <p className="text-sm text-text-secondary">
              No quota assigned to this key, and no default quotas are configured.
            </p>
          </div>
        ) : (
          sortMostConstrainedFirst(status.quotas).map((entry) => (
            <QuotaStatusCard
              key={entry.name}
              entry={entry}
              variant="detailed"
              onReset={(name) => onClear(status.key, name)}
              onRecompute={(name) => onRecompute(status.key, name)}
              recomputeLeaky={isLeakyRollingDef(quotas[entry.name])}
              recomputing={recomputingQuota === entry.name}
            />
          ))
        )}
      </div>
    )}
  </Modal>
);

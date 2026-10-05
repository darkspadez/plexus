import { AlertCircle, Check, Info, RefreshCw, Users, Wrench } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pill } from '../../components/chips';
import { QuotaProgressBar } from '../../components/quota/QuotaProgressBar';
import { formatQuotaValue, sortMostConstrainedFirst, statusForPercent } from '../../lib/quota';
import type { CurrencyCode } from '../../lib/currency';
import type { UserQuota } from '../../lib/api';
import { entryUsagePercent, hasScope, isLeakyRollingDef } from './helpers';
import type { QuotaStatusResponse } from './types';

interface QuotaStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedQuotaName: string | null;
  selectedQuotaStatus: QuotaStatusResponse | null;
  quotas: Record<string, UserQuota>;
  recomputingQuota: string | null;
  currency: CurrencyCode;
  rate: number;
  symbol: string;
  onClearQuota: (keyName: string, quotaName?: string) => void;
  onRecomputeQuota: (keyName: string, quotaName: string) => void;
}

export const QuotaStatusModal = ({
  isOpen,
  onClose,
  selectedQuotaName,
  selectedQuotaStatus,
  quotas,
  recomputingQuota,
  currency,
  rate,
  symbol,
  onClearQuota,
  onRecomputeQuota,
}: QuotaStatusModalProps) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={`Quota Status: ${selectedQuotaName}`}
    size="md"
    footer={
      <>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        {selectedQuotaStatus && selectedQuotaStatus.quotas.length > 0 && (
          <Button onClick={() => onClearQuota(selectedQuotaStatus.key)} variant="outline">
            Reset All
          </Button>
        )}
      </>
    }
  >
    {selectedQuotaStatus && (
      <div className="flex flex-col gap-4">
        {selectedQuotaStatus.quotas.length === 0 ? (
          <EmptyState
            variant="dense"
            icon={<AlertCircle />}
            title="No quotas assigned"
            description="No quota assigned to this key, and no default quotas are configured."
          />
        ) : (
          sortMostConstrainedFirst(selectedQuotaStatus.quotas).map((entry) => {
            const def = quotas[entry.name];
            const leaky = isLeakyRollingDef(def);
            const pct = entryUsagePercent(entry);
            const recomputing = recomputingQuota === entry.name;
            return (
              <div
                key={entry.name}
                className="flex flex-col gap-2 p-3 bg-surface-elevated rounded-md border border-border"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    {entry.allowed ? (
                      <Check className="text-success-text shrink-0" size="1rem" />
                    ) : (
                      <AlertCircle className="text-danger-text shrink-0" size="1rem" />
                    )}
                    <span className="font-medium text-foreground truncate">{entry.name}</span>
                    {entry.source === 'default' && (
                      <Pill tone="neutral" size="sm">
                        default
                      </Pill>
                    )}
                    {entry.shared && (
                      <Pill tone="primary" size="sm">
                        <Users size="0.625rem" /> shared
                      </Pill>
                    )}
                    {hasScope(entry.scope) && (
                      <Pill tone="neutral" size="sm">
                        scoped
                      </Pill>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onClearQuota(selectedQuotaStatus.key, entry.name)}
                      aria-label={`Reset ${entry.name}`}
                      title="Reset usage"
                    >
                      <RefreshCw size="0.875rem" />
                    </Button>
                    <span
                      title={
                        leaky
                          ? 'Recompute is unavailable for rolling requests/tokens quotas — their usage cannot be reconstructed from historical data.'
                          : 'Recompute usage from historical request logs'
                      }
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onRecomputeQuota(selectedQuotaStatus.key, entry.name)}
                        disabled={leaky || recomputing}
                        aria-label={`Recompute ${entry.name}`}
                      >
                        {leaky ? <Info size="0.875rem" /> : <Wrench size="0.875rem" />}
                      </Button>
                    </span>
                  </div>
                </div>

                <QuotaProgressBar
                  label={`${entry.limitType}${entry.global ? '' : ' (scoped)'}`}
                  value={entry.currentUsage}
                  max={entry.limit}
                  displayValue={`${formatQuotaValue(entry.currentUsage, entry.limitType, { currency, rate, symbol })} / ${formatQuotaValue(entry.limit, entry.limitType, { currency, rate, symbol })}`}
                  status={statusForPercent(pct)}
                  size="md"
                />

                <div className="flex items-center justify-between text-xs text-foreground-muted">
                  <span>
                    Remaining:{' '}
                    <span className="text-foreground font-medium">
                      {formatQuotaValue(entry.remaining, entry.limitType, {
                        currency,
                        rate,
                        symbol,
                      })}
                    </span>
                  </span>
                  <span>Resets {new Date(entry.resetsAt).toLocaleString()}</span>
                </div>

                {entry.warnAt !== undefined && (
                  <p className="text-label text-foreground-muted">
                    Warns at {Math.round(entry.warnAt * 100)}% usage
                  </p>
                )}

                {!entry.allowed && (
                  <div className="flex items-center gap-2 text-xs text-danger-text">
                    <AlertCircle size="0.75rem" />
                    <span>Exhausted — requests using this quota are being rejected.</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    )}
  </Modal>
);

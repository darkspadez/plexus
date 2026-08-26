import { Ban, BarChart3, Edit2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { QuotaChip } from '../../components/quota';
import { formatQuotaValue, mostConstrained, quotaUsagePercent } from '../../lib/quota';
import type { KeyConfig } from '../../lib/api/keys';
import type { KeyPolicyPreview } from '../../lib/api/keySecurity';
import { KeyStatusBadge } from './KeyStatusBadge';
import { keySecurityStatus } from './keySecurityUtils';
import { getQuotaStatusColor } from './keyUtils';
import type { QuotaStatusResponse } from './types';

interface KeyMobileListProps {
  readonly keys: readonly KeyConfig[];
  readonly quotaStatuses: Readonly<Record<string, QuotaStatusResponse>>;
  readonly defaultQuotaNames: readonly string[];
  readonly policies: Readonly<Record<string, KeyPolicyPreview>>;
  readonly onEdit: (key: KeyConfig) => void;
  readonly onDisable: (key: KeyConfig) => void;
  readonly onDelete: (keyName: string) => void;
  readonly onViewQuota: (keyName: string) => void;
  readonly onClearQuota: (keyName: string) => void;
  readonly onSecurity: (key: KeyConfig) => void;
}

export const KeyMobileList = ({
  keys,
  quotaStatuses,
  defaultQuotaNames,
  policies,
  onEdit,
  onDisable,
  onDelete,
  onViewQuota,
  onClearQuota,
  onSecurity,
}: KeyMobileListProps) => (
  <div className="space-y-3 md:hidden">
    {keys.length === 0 ? (
      <div className="py-10 text-center text-sm text-text-muted">No keys found</div>
    ) : (
      keys.map((key) => {
        const status = quotaStatuses[key.key];
        const primary = status ? mostConstrained(status.quotas) : null;
        const usagePercent = primary ? quotaUsagePercent(primary) : 0;
        const quotaNames = key.quotas?.length ? key.quotas : null;
        const usingDefaults = !quotaNames && defaultQuotaNames.length > 0;
        const securityStatus = keySecurityStatus(key, policies[key.key]);
        return (
          <article key={key.key} className="rounded-md border border-border-glass bg-bg-subtle p-3">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => onEdit(key)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <div className="truncate font-heading text-sm font-semibold text-text">
                    {key.key}
                  </div>
                  <KeyStatusBadge status={securityStatus} />
                </div>
                {key.comment && (
                  <div className="mt-1 truncate text-xs text-text-muted">{key.comment}</div>
                )}
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onSecurity(key)}
                  aria-label={`Manage security for ${key.key}`}
                >
                  <ShieldCheck size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(key)}
                  aria-label={`Edit ${key.key}`}
                >
                  <Edit2 size={14} />
                </Button>
                {key.expiresAt && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDisable(key)}
                    className="text-danger"
                    aria-label={`Disable ${key.key}`}
                    title="Disable key"
                  >
                    <Ban size={14} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(key.key)}
                  className="text-danger"
                  aria-label={`Delete ${key.key}`}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div className="min-w-0 rounded border border-border-glass bg-bg-glass px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-text-muted">
                  Fingerprint
                </div>
                <code className="mt-1 block truncate font-mono text-text">
                  sha256:{key.fingerprint}
                </code>
              </div>
              <div className="min-w-0 rounded border border-border-glass bg-bg-glass px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-text-muted">Quota</div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {quotaNames ? (
                    quotaNames.map((name) => <QuotaChip key={name}>{name}</QuotaChip>)
                  ) : usingDefaults ? (
                    <>
                      {defaultQuotaNames.map((name) => (
                        <QuotaChip key={name} tone="muted">
                          {name}
                        </QuotaChip>
                      ))}
                      <QuotaChip tone="muted">default</QuotaChip>
                    </>
                  ) : (
                    <span className="text-text-secondary">-</span>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 rounded border border-border-glass bg-bg-glass px-2 py-2">
              {primary ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-text-muted truncate">{primary.name}</span>
                    <span className="font-medium text-text">
                      {formatQuotaValue(primary.currentUsage, primary.limitType)} /{' '}
                      {formatQuotaValue(primary.limit, primary.limitType)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-bg-hover">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${usagePercent}%`,
                        backgroundColor: getQuotaStatusColor(usagePercent),
                      }}
                    />
                  </div>
                  {status && status.quotas.length > 1 && (
                    <p className="text-[11px] text-text-muted">
                      +{status.quotas.length - 1} more quota
                      {status.quotas.length - 1 !== 1 ? 's' : ''}
                    </p>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewQuota(key.key)}
                      leftIcon={<BarChart3 size={14} />}
                    >
                      Details
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onClearQuota(key.key)}
                      leftIcon={<RefreshCw size={14} />}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-text-muted">
                  {quotaNames || usingDefaults ? 'Loading quota status...' : 'No quota assigned'}
                </div>
              )}
            </div>
          </article>
        );
      })
    )}
  </div>
);

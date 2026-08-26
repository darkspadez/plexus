import { Ban, BarChart3, Edit2, RefreshCw, Shield, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { QuotaChip } from '../../components/quota';
import { formatQuotaValue, mostConstrained, quotaUsagePercent } from '../../lib/quota';
import type { KeyConfig } from '../../lib/api/keys';
import type { KeyPolicyPreview } from '../../lib/api/keySecurity';
import { KeyStatusBadge } from './KeyStatusBadge';
import { keySecurityStatus } from './keySecurityUtils';
import { getQuotaStatusColor } from './keyUtils';
import type { QuotaStatusResponse } from './types';

interface KeyTableProps {
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

export const KeyTable = ({
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
}: KeyTableProps) => (
  <div className="hidden overflow-x-auto md:block">
    <table className="w-full border-collapse font-body text-[13px]">
      <thead>
        <tr>
          <th
            className="px-4 py-3 text-left border-b border-border-glass bg-bg-hover font-semibold text-text-secondary text-[11px] uppercase tracking-wider"
            style={{ paddingLeft: '24px' }}
          >
            Key Name
          </th>
          <th className="px-4 py-3 text-left border-b border-border-glass bg-bg-hover font-semibold text-text-secondary text-[11px] uppercase tracking-wider">
            Fingerprint
          </th>
          <th className="px-4 py-3 text-left border-b border-border-glass bg-bg-hover font-semibold text-text-secondary text-[11px] uppercase tracking-wider">
            Quota
          </th>
          <th className="px-4 py-3 text-left border-b border-border-glass bg-bg-hover font-semibold text-text-secondary text-[11px] uppercase tracking-wider">
            Status
          </th>
          <th
            className="px-4 py-3 text-left border-b border-border-glass bg-bg-hover font-semibold text-text-secondary text-[11px] uppercase tracking-wider"
            style={{ paddingRight: '24px', textAlign: 'right' }}
          >
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        {keys.map((key) => {
          const status = quotaStatuses[key.key];
          const primary = status ? mostConstrained(status.quotas) : null;
          const usagePercent = primary ? quotaUsagePercent(primary) : 0;
          const quotaNames = key.quotas?.length ? key.quotas : null;
          const usingDefaults = !quotaNames && defaultQuotaNames.length > 0;
          const securityStatus = keySecurityStatus(key, policies[key.key]);
          return (
            <tr key={key.key} className="hover:bg-bg-hover">
              <td
                className="px-4 py-3 text-left border-b border-border-glass text-text"
                style={{ fontWeight: 600, paddingLeft: '24px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{key.key}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-left border-b border-border-glass text-text">
                <code className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-xs text-text">
                  sha256:{key.fingerprint}
                </code>
              </td>
              <td className="px-4 py-3 text-left border-b border-border-glass text-text">
                {quotaNames ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {quotaNames.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-primary/10 text-primary"
                      >
                        <Shield size={12} />
                        {name}
                      </span>
                    ))}
                  </div>
                ) : usingDefaults ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {defaultQuotaNames.map((name) => (
                      <QuotaChip key={name} tone="muted">
                        {name}
                      </QuotaChip>
                    ))}
                    <QuotaChip tone="muted">default</QuotaChip>
                  </div>
                ) : (
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>-</span>
                )}
              </td>
              <td className="px-4 py-3 text-left border-b border-border-glass text-text">
                <div className="flex flex-col items-start gap-1.5">
                  <KeyStatusBadge status={securityStatus} />
                  {primary ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: getQuotaStatusColor(usagePercent),
                        }}
                      />
                      <span style={{ fontSize: '12px' }}>
                        {formatQuotaValue(primary.currentUsage, primary.limitType)} /{' '}
                        {formatQuotaValue(primary.limit, primary.limitType)}
                      </span>
                      {status && status.quotas.length > 1 && (
                        <span className="text-[11px] text-text-muted">
                          (+{status.quotas.length - 1})
                        </span>
                      )}
                      <button
                        className="bg-transparent border-0 text-text-muted p-1 rounded-sm cursor-pointer hover:text-primary"
                        onClick={() => onViewQuota(key.key)}
                        title="View details"
                        aria-label={`View quota details for ${key.key}`}
                      >
                        <BarChart3 size={14} />
                      </button>
                    </div>
                  ) : quotaNames || usingDefaults ? (
                    <span className="text-xs text-text-muted">Loading quota…</span>
                  ) : null}
                </div>
              </td>
              <td
                className="px-4 py-3 text-left border-b border-border-glass text-text"
                style={{ paddingRight: '24px', textAlign: 'right' }}
              >
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSecurity(key)}
                    aria-label={`Manage security for ${key.key}`}
                    title="Manage security"
                  >
                    <ShieldCheck size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(key)}
                    aria-label={`Edit ${key.key}`}
                  >
                    <Edit2 size={14} />
                  </Button>
                  {key.expiresAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDisable(key)}
                      title="Disable key"
                      aria-label={`Disable ${key.key}`}
                      style={{ color: 'var(--color-danger)' }}
                    >
                      <Ban size={14} />
                    </Button>
                  )}
                  {(quotaNames || usingDefaults) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onClearQuota(key.key)}
                      title="Reset quota"
                      aria-label={`Reset quota for ${key.key}`}
                    >
                      <RefreshCw size={14} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(key.key)}
                    aria-label={`Delete ${key.key}`}
                    style={{ color: 'var(--color-danger)' }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </td>
            </tr>
          );
        })}
        {keys.length === 0 && (
          <tr>
            <td colSpan={5} className="text-center text-text-muted p-12">
              No keys found
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

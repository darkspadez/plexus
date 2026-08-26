import { Edit2, Trash2, Users } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { QuotaChip, hasScope } from '../../components/quota';
import { formatCost, formatNumber } from '../../lib/format';
import type { UserQuota } from '../../lib/api';
import type { KeyConfig } from '../../lib/api/keys';

interface QuotaMobileListProps {
  readonly quotas: readonly (readonly [string, UserQuota])[];
  readonly allQuotaCount: number;
  readonly keys: readonly KeyConfig[];
  readonly onEdit: (name: string, quota: UserQuota) => void;
  readonly onDelete: (name: string) => void;
}

export const QuotaMobileList = ({
  quotas,
  allQuotaCount,
  keys,
  onEdit,
  onDelete,
}: QuotaMobileListProps) => (
  <div className="space-y-3 md:hidden">
    {quotas.length === 0 ? (
      <div className="py-10 text-center text-sm text-text-muted">
        {allQuotaCount === 0 ? 'No quotas defined yet' : 'No quotas found'}
      </div>
    ) : (
      quotas.map(([name, quota]) => {
        const keysUsingQuota = keys.filter((key) => key.quotas?.includes(name)).length;
        return (
          <article key={name} className="rounded-md border border-border-glass bg-bg-subtle p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-heading text-sm font-semibold text-text">
                    {name}
                  </span>
                  {quota.shared && (
                    <QuotaChip>
                      <Users size={10} /> shared
                    </QuotaChip>
                  )}
                  {hasScope(quota) && <QuotaChip tone="muted">scoped</QuotaChip>}
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  {quota.type}
                  {quota.type === 'rolling' && quota.duration ? ` (${quota.duration})` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(name, quota)}
                  aria-label={`Edit ${name}`}
                >
                  <Edit2 size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(name)}
                  className="text-danger"
                  aria-label={`Delete ${name}`}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="min-w-0 rounded border border-border-glass bg-bg-glass px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-text-muted">Limit</div>
                <div className="truncate font-mono text-text">
                  {quota.limitType === 'cost'
                    ? `${formatCost(quota.limit, 5)} ${quota.limitType}`
                    : `${formatNumber(quota.limit)} ${quota.limitType}`}
                </div>
              </div>
              <div className="min-w-0 rounded border border-border-glass bg-bg-glass px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-text-muted">Keys</div>
                <div className="truncate font-medium text-text-secondary">
                  {keysUsingQuota} key{keysUsingQuota !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          </article>
        );
      })
    )}
  </div>
);

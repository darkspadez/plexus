import { Edit2, Trash2, Users } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { QuotaChip, hasScope } from '../../components/quota';
import { formatCost, formatNumber } from '../../lib/format';
import type { UserQuota } from '../../lib/api';
import type { KeyConfig } from '../../lib/api/keys';

interface QuotaTableProps {
  readonly quotas: readonly (readonly [string, UserQuota])[];
  readonly allQuotaCount: number;
  readonly keys: readonly KeyConfig[];
  readonly onEdit: (name: string, quota: UserQuota) => void;
  readonly onDelete: (name: string) => void;
}

export const QuotaTable = ({ quotas, allQuotaCount, keys, onEdit, onDelete }: QuotaTableProps) => (
  <div className="hidden overflow-x-auto md:block">
    <table className="w-full border-collapse font-body text-[13px]">
      <thead>
        <tr>
          <th
            className="px-4 py-3 text-left border-b border-border-glass bg-bg-hover font-semibold text-text-secondary text-[11px] uppercase tracking-wider"
            style={{ paddingLeft: '24px' }}
          >
            Name
          </th>
          <th className="px-4 py-3 text-left border-b border-border-glass bg-bg-hover font-semibold text-text-secondary text-[11px] uppercase tracking-wider">
            Type
          </th>
          <th className="px-4 py-3 text-left border-b border-border-glass bg-bg-hover font-semibold text-text-secondary text-[11px] uppercase tracking-wider">
            Limit
          </th>
          <th className="px-4 py-3 text-left border-b border-border-glass bg-bg-hover font-semibold text-text-secondary text-[11px] uppercase tracking-wider">
            Keys Using
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
        {quotas.map(([name, quota]) => {
          const keysUsingQuota = keys.filter((key) => key.quotas?.includes(name)).length;
          return (
            <tr key={name} className="hover:bg-bg-hover">
              <td
                className="px-4 py-3 text-left border-b border-border-glass text-text"
                style={{ fontWeight: 600, paddingLeft: '24px' }}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span>{name}</span>
                  {quota.shared && (
                    <QuotaChip>
                      <Users size={10} /> shared
                    </QuotaChip>
                  )}
                  {hasScope(quota) && <QuotaChip tone="muted">scoped</QuotaChip>}
                </div>
              </td>
              <td className="px-4 py-3 text-left border-b border-border-glass text-text">
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-bg-subtle text-text-secondary">
                  {quota.type}
                  {quota.type === 'rolling' && quota.duration && (
                    <span className="text-text-muted">({quota.duration})</span>
                  )}
                </span>
              </td>
              <td className="px-4 py-3 text-left border-b border-border-glass text-text">
                <span className="font-mono text-xs">
                  {quota.limitType === 'cost'
                    ? `${formatCost(quota.limit, 5)} ${quota.limitType}`
                    : `${formatNumber(quota.limit)} ${quota.limitType}`}
                </span>
              </td>
              <td className="px-4 py-3 text-left border-b border-border-glass text-text">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md ${keysUsingQuota > 0 ? 'bg-primary/10 text-primary' : 'bg-bg-subtle text-text-muted'}`}
                >
                  {keysUsingQuota} key{keysUsingQuota !== 1 ? 's' : ''}
                </span>
              </td>
              <td
                className="px-4 py-3 text-left border-b border-border-glass text-text"
                style={{ paddingRight: '24px', textAlign: 'right' }}
              >
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <Button variant="ghost" size="sm" onClick={() => onEdit(name, quota)}>
                    <Edit2 size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(name)}
                    style={{ color: 'var(--color-danger)' }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </td>
            </tr>
          );
        })}
        {quotas.length === 0 && (
          <tr>
            <td colSpan={5} className="text-center text-text-muted p-12">
              {allQuotaCount === 0 ? 'No quotas defined yet' : 'No quotas found'}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

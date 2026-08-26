import { Card } from '../../components/ui/Card';
import { TagSelect } from '../../components/ui/TagSelect';
import type { UserQuota } from '../../lib/api';
import type { KeyConfig } from '../../lib/api/keys';
import { QuotaMobileList } from './QuotaMobileList';
import { QuotaTable } from './QuotaTable';

interface QuotaTabProps {
  readonly keys: readonly KeyConfig[];
  readonly quotas: Readonly<Record<string, UserQuota>>;
  readonly filteredQuotas: readonly (readonly [string, UserQuota])[];
  readonly defaultQuotaNames: string[];
  readonly isSavingDefaults: boolean;
  readonly onSaveDefaults: (names: string[]) => void;
  readonly onEdit: (name: string, quota: UserQuota) => void;
  readonly onDelete: (name: string) => void;
}

export const QuotaTab = ({
  keys,
  quotas,
  filteredQuotas,
  defaultQuotaNames,
  isSavingDefaults,
  onSaveDefaults,
  onEdit,
  onDelete,
}: QuotaTabProps) => (
  <>
    <Card title="Default quotas" className="mb-6">
      <p className="text-xs text-text-muted mb-3">
        Applied to any key with no quotas of its own (non-stacking — a key's own <code>quotas</code>{' '}
        always wins over this fallback when set).
      </p>
      <TagSelect
        placeholder="No default quotas — select one or more..."
        options={Object.keys(quotas).sort()}
        selected={defaultQuotaNames}
        onChange={onSaveDefaults}
      />
      {isSavingDefaults && <p className="mt-2 text-xs text-text-muted">Saving…</p>}
    </Card>
    <Card title="User Quotas" className="mb-6">
      <QuotaMobileList
        quotas={filteredQuotas}
        allQuotaCount={Object.keys(quotas).length}
        keys={keys}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      <QuotaTable
        quotas={filteredQuotas}
        allQuotaCount={Object.keys(quotas).length}
        keys={keys}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </Card>
  </>
);

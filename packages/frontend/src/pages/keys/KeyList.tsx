import { Card } from '../../components/ui/Card';
import type { KeyConfig } from '../../lib/api/keys';
import type { KeyPolicyPreview } from '../../lib/api/keySecurity';
import { KeyMobileList } from './KeyMobileList';
import { KeyTable } from './KeyTable';
import type { QuotaStatusResponse } from './types';

interface KeyListProps {
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

export const KeyList = (props: KeyListProps) => (
  <Card title="Active Keys" className="mb-6">
    <KeyMobileList {...props} />
    <KeyTable {...props} />
  </Card>
);

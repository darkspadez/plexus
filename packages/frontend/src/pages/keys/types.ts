import type { KeyConfig, UserQuota } from '../../lib/api';
import { api } from '../../lib/api';

// Response shape of `GET /v0/management/quota/status/:key` — kept in sync
// with `lib/api.ts`'s `getQuotaStatus` return type rather than duplicated by
// hand.
export type QuotaStatusResponse = NonNullable<Awaited<ReturnType<typeof api.getQuotaStatus>>>;

export type LoadQuotaStatuses = () => Promise<Record<string, QuotaStatusResponse> | null>;

export interface KeysPageData {
  keys: KeyConfig[];
  quotas: Record<string, UserQuota>;
  quotaStatuses: Record<string, QuotaStatusResponse>;
  providerIds: string[];
  aliasIds: string[];
  defaultQuotaNames: string[];
  loadQuotaStatuses: LoadQuotaStatuses;
}

import type { api, UserQuota } from '../../lib/api';

export type QuotaStatusResponse = NonNullable<Awaited<ReturnType<typeof api.getQuotaStatus>>>;

export type EditableQuota = UserQuota & {
  readonly name: string;
};

export type ExpiryUnit = 'minutes' | 'hours' | 'days';

export type KeysTab = 'keys' | 'quotas' | 'security';

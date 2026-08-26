import type { UserQuota } from '../../lib/api';
import type { KeyConfig } from '../../lib/api/keys';

export const isKeyDisabled = (key: KeyConfig): boolean =>
  key.disabledAt !== undefined || (key.expiresAt !== undefined && key.expiresAt <= Date.now());

export const keyMatchesSearch = (key: KeyConfig, search: string): boolean => {
  const query = search.toLowerCase();
  return (
    key.key.toLowerCase().includes(query) ||
    Boolean(key.comment?.toLowerCase().includes(query)) ||
    Boolean(key.quotas?.some((name) => name.toLowerCase().includes(query))) ||
    Boolean(key.allowedModels?.some((model) => model.toLowerCase().includes(query))) ||
    Boolean(key.allowedProviders?.some((provider) => provider.toLowerCase().includes(query))) ||
    Boolean(key.excludedModels?.some((model) => model.toLowerCase().includes(query))) ||
    Boolean(key.excludedProviders?.some((provider) => provider.toLowerCase().includes(query)))
  );
};

export const formatExpiry = (timestamp: number): string => new Date(timestamp).toLocaleString();

export const getQuotaStatusColor = (percent: number): string => {
  if (percent >= 90) return 'var(--color-danger)';
  if (percent >= 75) return 'var(--color-warning)';
  return 'var(--color-success)';
};

export const isLeakyRollingDef = (definition: UserQuota | undefined): boolean =>
  definition?.type === 'rolling' &&
  (definition.limitType === 'requests' || definition.limitType === 'tokens');

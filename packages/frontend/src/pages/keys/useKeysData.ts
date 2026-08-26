import { useCallback, useEffect, useState } from 'react';
import { api, type Provider, type UserQuota } from '../../lib/api';
import { getKeys, type KeyConfig } from '../../lib/api/keys';
import type { QuotaStatusResponse } from './types';

export const useKeysData = () => {
  const [keys, setKeys] = useState<KeyConfig[]>([]);
  const [quotas, setQuotas] = useState<Record<string, UserQuota>>({});
  const [quotaStatuses, setQuotaStatuses] = useState<Record<string, QuotaStatusResponse>>({});
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerIds, setProviderIds] = useState<string[]>([]);
  const [aliasIds, setAliasIds] = useState<string[]>([]);
  const [defaultQuotaNames, setDefaultQuotaNames] = useState<string[]>([]);

  const loadData = useCallback(async (): Promise<Record<string, QuotaStatusResponse> | null> => {
    try {
      const [loadedKeys, loadedQuotas, loadedProviders, aliases, defaults] = await Promise.all([
        getKeys(),
        api.getUserQuotas(),
        api.getProviders(),
        api.getAliases(),
        api.getDefaultQuotas().catch(() => []),
      ]);
      setKeys(loadedKeys);
      setQuotas(loadedQuotas);
      setProviders(loadedProviders);
      setProviderIds(
        loadedProviders
          .filter((provider) => provider.enabled)
          .map((provider) => provider.id)
          .sort()
      );
      setAliasIds(aliases.map((alias) => alias.id).sort());
      setDefaultQuotaNames(defaults);

      const statuses: Record<string, QuotaStatusResponse> = {};
      await Promise.all(
        loadedKeys
          .filter((key) => (key.quotas?.length ?? 0) > 0 || defaults.length > 0)
          .map(async (key) => {
            try {
              const status = await api.getQuotaStatus(key.key);
              if (status) statuses[key.key] = status;
            } catch (error) {
              const detail = error instanceof Error ? error.message : String(error);
              console.error(`Failed to load quota status for ${key.key}: ${detail}`);
            }
          })
      );
      setQuotaStatuses(statuses);
      return statuses;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`Failed to load data: ${detail}`);
      return null;
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const allModelNames = Array.from(
    new Set(
      providers.flatMap((provider) =>
        provider.models && !Array.isArray(provider.models) ? Object.keys(provider.models) : []
      )
    )
  ).sort();

  return {
    keys,
    quotas,
    quotaStatuses,
    providerIds,
    aliasIds,
    defaultQuotaNames,
    setDefaultQuotaNames,
    allModelNames,
    loadData,
  };
};

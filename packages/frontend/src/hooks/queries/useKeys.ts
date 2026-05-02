import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type KeyConfig, type Provider, type UserQuota, type Alias } from '../../lib/api';

const KEYS_KEY = ['keys'] as const;
const QUOTAS_KEY = ['user-quotas'] as const;
const PROVIDERS_KEY = ['providers'] as const;
const ALIASES_KEY = ['aliases'] as const;

export const useKeys = () =>
  useQuery<KeyConfig[]>({
    queryKey: KEYS_KEY,
    queryFn: () => api.getKeys(),
    refetchInterval: 30_000,
  });

export const useUserQuotas = () =>
  useQuery<Record<string, UserQuota>>({
    queryKey: QUOTAS_KEY,
    queryFn: () => api.getUserQuotas(),
    refetchInterval: 60_000,
  });

export const useProviderIds = () =>
  useQuery<string[]>({
    queryKey: [...PROVIDERS_KEY, 'ids'],
    queryFn: async () => {
      const provs: Provider[] = await api.getProviders();
      return provs
        .filter((p) => p.enabled)
        .map((p) => p.id)
        .sort();
    },
  });

export const useAliasIds = () =>
  useQuery<string[]>({
    queryKey: [...ALIASES_KEY, 'ids'],
    queryFn: async () => {
      const aliases: Alias[] = await api.getAliases();
      return aliases.map((a) => a.id).sort();
    },
  });

export const useSaveKey = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, oldKey }: { key: KeyConfig; oldKey?: string }) => api.saveKey(key, oldKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS_KEY }),
  });
};

export const useDeleteKey = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyName: string) => api.deleteKey(keyName),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS_KEY }),
  });
};

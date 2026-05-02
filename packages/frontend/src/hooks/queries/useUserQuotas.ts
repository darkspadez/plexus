import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type UserQuota } from '../../lib/api';

const KEY = ['user-quotas'] as const;

export const useUserQuotas = () =>
  useQuery<Record<string, UserQuota>>({
    queryKey: KEY,
    queryFn: () => api.getUserQuotas(),
    refetchInterval: 60_000,
  });

export const useSaveUserQuota = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      quota,
      oldName,
    }: {
      name: string;
      quota: UserQuota;
      oldName?: string;
    }) => {
      const save = async () => {
        if (oldName && oldName !== name) {
          await api.deleteUserQuota(oldName);
        }
        await api.saveUserQuota(name, quota);
      };
      return save();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useDeleteUserQuota = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.deleteUserQuota(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

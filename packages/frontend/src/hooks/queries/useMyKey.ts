import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const SELF_ME_KEY = ['self-me'] as const;
export const SELF_QUOTA_KEY = ['self-quota'] as const;

export const useSelfMe = () =>
  useQuery({
    queryKey: SELF_ME_KEY,
    queryFn: () => api.getSelfMe(),
  });

export const useSelfQuota = () =>
  useQuery({
    queryKey: SELF_QUOTA_KEY,
    queryFn: () => api.getSelfQuota(),
  });

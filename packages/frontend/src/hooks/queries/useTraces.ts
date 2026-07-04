import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

interface DebugLogMeta {
  requestId: string;
  createdAt: number;
  responseStatus?: number | null;
}

export const TRACES_KEY = ['traces'] as const;

export const useTraces = (options?: { refetchInterval?: number | false }) =>
  useQuery<DebugLogMeta[]>({
    queryKey: TRACES_KEY,
    queryFn: () => api.getDebugLogs(50),
    refetchInterval: options?.refetchInterval,
  });

export const useDeleteTrace = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();
  return useMutation({
    mutationFn: (requestId: string) => api.deleteDebugLog(requestId),
    onSuccess: () => qc.invalidateQueries({ queryKey: TRACES_KEY }),
    onError: (err: Error) => toastError(`Failed to delete trace: ${err.message}`),
  });
};

export const useDeleteAllTraces = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();
  return useMutation({
    mutationFn: () => api.deleteAllDebugLogs(),
    onSuccess: () => qc.invalidateQueries({ queryKey: TRACES_KEY }),
    onError: (err: Error) => toastError(`Failed to delete all traces: ${err.message}`),
  });
};

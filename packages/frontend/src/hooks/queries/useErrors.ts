import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type InferenceError } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

export const ERRORS_KEY = ['errors'] as const;

export const useErrors = (options?: { refetchInterval?: number | false }) =>
  useQuery<InferenceError[]>({
    queryKey: ERRORS_KEY,
    queryFn: () => api.getErrors(50),
    refetchInterval: options?.refetchInterval,
  });

export const useDeleteError = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();
  return useMutation({
    mutationFn: (requestId: string) => api.deleteError(requestId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ERRORS_KEY }),
    onError: (err: Error) => toastError(`Failed to delete error: ${err.message}`),
  });
};

export const useDeleteAllErrors = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();
  return useMutation({
    mutationFn: () => api.deleteAllErrors(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ERRORS_KEY }),
    onError: (err: Error) => toastError(`Failed to delete all errors: ${err.message}`),
  });
};

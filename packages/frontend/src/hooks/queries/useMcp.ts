import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type McpServer, type McpLogRecord } from '../../lib/api';

const SERVERS_KEY = ['mcp', 'servers'] as const;
const LOGS_KEY = ['mcp', 'logs'] as const;

export const useMcpServers = () =>
  useQuery<Record<string, McpServer>>({
    queryKey: SERVERS_KEY,
    queryFn: () => api.getMcpServers(),
    refetchInterval: 30_000,
  });

export const useSaveMcpServer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, server }: { name: string; server: McpServer }) =>
      api.saveMcpServer(name, server),
    onSuccess: () => qc.invalidateQueries({ queryKey: SERVERS_KEY }),
  });
};

export const useDeleteMcpServer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.deleteMcpServer(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: SERVERS_KEY }),
  });
};

export const useMcpLogs = (
  page: number,
  filters: { serverName?: string; apiKey?: string },
  pageSize = 20
) =>
  useQuery<{ data: McpLogRecord[]; total: number }>({
    queryKey: [...LOGS_KEY, page, pageSize, filters],
    queryFn: () => {
      const cleanFilters: { serverName?: string; apiKey?: string } = {};
      if (filters.serverName) cleanFilters.serverName = filters.serverName;
      if (filters.apiKey) cleanFilters.apiKey = filters.apiKey;
      return api.getMcpLogs(pageSize, page * pageSize, cleanFilters);
    },
    refetchInterval: 10_000,
  });

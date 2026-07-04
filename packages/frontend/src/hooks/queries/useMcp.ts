/**
 * useMcp — TanStack Query hooks for MCP servers and logs.
 *
 * Covers: MCP servers list, MCP enabled status, MCP logs list.
 * Standalone delete mutations: delete server, delete single log, delete all logs.
 * Toggle MCP enabled: standalone action button mutation.
 *
 * The create/edit server form state is left for Phase 7.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const MCP_SERVERS_KEY = ['mcp-servers'] as const;
export const MCP_ENABLED_KEY = ['mcp-enabled'] as const;

// Base key for all MCP logs cache entries — used for broad invalidation.
export const MCP_LOGS_BASE_KEY = ['mcp-logs'] as const;

// MCP logs key includes pagination params so each page is cached separately.
export const mcpLogsKey = (limit: number, offset: number, serverName: string, apiKey: string) =>
  [...MCP_LOGS_BASE_KEY, limit, offset, serverName, apiKey] as const;

// ---------------------------------------------------------------------------
// List queries
// ---------------------------------------------------------------------------

/** All configured MCP servers. */
export const useMcpServers = () =>
  useQuery({
    queryKey: MCP_SERVERS_KEY,
    queryFn: () => api.getMcpServers(),
  });

/** Whether the built-in Plexus Management MCP endpoint is enabled. */
export const useMcpEnabled = () =>
  useQuery({
    queryKey: MCP_ENABLED_KEY,
    queryFn: () => api.getMcpEnabled(),
  });

/** Paginated MCP logs with optional server/key filters. */
export const useMcpLogs = (
  limit: number,
  offset: number,
  filters: { serverName?: string; apiKey?: string }
) =>
  useQuery({
    queryKey: mcpLogsKey(limit, offset, filters.serverName ?? '', filters.apiKey ?? ''),
    queryFn: () => {
      const f: { serverName?: string; apiKey?: string } = {};
      if (filters.serverName) f.serverName = filters.serverName;
      if (filters.apiKey) f.apiKey = filters.apiKey;
      return api.getMcpLogs(limit, offset, f);
    },
  });

// ---------------------------------------------------------------------------
// Standalone mutations
// ---------------------------------------------------------------------------

/** Delete a single MCP server by name. */
export const useDeleteMcpServer = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();

  return useMutation({
    mutationFn: (serverName: string) => api.deleteMcpServer(serverName),
    onSuccess: () => qc.invalidateQueries({ queryKey: MCP_SERVERS_KEY }),
    onError: (err: Error) => toastError(`Failed to delete MCP server: ${err.message}`),
  });
};

/** Toggle the global MCP enabled flag. */
export const useToggleMcpEnabled = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();

  return useMutation({
    mutationFn: (enabled: boolean) => api.patchMcpEnabled(enabled),
    // Fix #3: optimistic update so the toggle reflects immediately on slow links.
    onMutate: async (enabled) => {
      await qc.cancelQueries({ queryKey: MCP_ENABLED_KEY });
      const prev = qc.getQueryData(MCP_ENABLED_KEY);
      qc.setQueryData(MCP_ENABLED_KEY, { enabled });
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      // Roll back to previous value on failure.
      qc.setQueryData(MCP_ENABLED_KEY, ctx?.prev);
      toastError(`Failed to update MCP enabled state: ${err.message}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: MCP_ENABLED_KEY }),
  });
};

/** Delete a single MCP log entry by request ID. */
export const useDeleteMcpLog = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();

  return useMutation({
    mutationFn: (requestId: string) => api.deleteMcpLog(requestId),
    // Invalidate all mcp-logs cache entries on success
    onSuccess: () => qc.invalidateQueries({ queryKey: MCP_LOGS_BASE_KEY }),
    onError: (err: Error) => toastError(`Failed to delete MCP log: ${err.message}`),
  });
};

/** Delete all MCP logs (optionally older than N days). */
export const useDeleteAllMcpLogs = () => {
  const qc = useQueryClient();
  const { error: toastError } = useToast();

  return useMutation({
    mutationFn: (olderThanDays?: number) => api.deleteAllMcpLogs(olderThanDays),
    onSuccess: () => qc.invalidateQueries({ queryKey: MCP_LOGS_BASE_KEY }),
    onError: (err: Error) => toastError(`Failed to delete MCP logs: ${err.message}`),
  });
};

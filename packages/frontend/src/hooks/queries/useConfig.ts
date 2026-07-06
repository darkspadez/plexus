/**
 * useConfig — TanStack Query hooks for the Config page.
 *
 * Covers: config export read (the JSON snapshot shown in the Monaco editor)
 * plus per-panel patch mutations for Phase 7b.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const CONFIG_EXPORT_KEY = ['config-export'] as const;
export const COMPACTION_CONFIG_KEY = ['compaction-config'] as const;
export const GRAFANA_URL_KEY = ['grafana-url'] as const;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * The raw config-export JSON shown in the Monaco read-only editor.
 * Returns the data object (not serialised) — the page serialises to string.
 */
export const useConfigExport = () =>
  useQuery<Record<string, unknown>>({
    queryKey: CONFIG_EXPORT_KEY,
    queryFn: () => api.getConfigExport() as Promise<Record<string, unknown>>,
  });

// ---------------------------------------------------------------------------
// Failover Settings mutation
// ---------------------------------------------------------------------------

export const useSaveFailoverPolicy = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (updates: {
      enabled: boolean;
      retryableStatusCodes: number[];
      retryableErrors: string[];
    }) => api.patchFailoverPolicy(updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONFIG_EXPORT_KEY });
      toast.success('Failover settings saved');
    },
    onError: (err: Error) => toast.error(err.message, 'Failed to save failover settings'),
  });
};

// ---------------------------------------------------------------------------
// Cooldown Settings mutation
// ---------------------------------------------------------------------------

export const useSaveCooldownPolicy = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (updates: { initialMinutes: number; maxMinutes: number }) =>
      api.patchCooldownPolicy(updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONFIG_EXPORT_KEY });
      toast.success('Cooldown settings saved');
    },
    onError: (err: Error) => toast.error(err.message, 'Failed to save cooldown settings'),
  });
};

// ---------------------------------------------------------------------------
// Timeout Settings mutation
// ---------------------------------------------------------------------------

export const useSaveTimeoutConfig = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (updates: { defaultSeconds: number }) => api.patchTimeoutConfig(updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONFIG_EXPORT_KEY });
      toast.success('Timeout settings saved');
    },
    onError: (err: Error) => toast.error(err.message, 'Failed to save timeout settings'),
  });
};

// ---------------------------------------------------------------------------
// Stall Detection mutation
// ---------------------------------------------------------------------------

export const useSaveStallConfig = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (updates: {
      ttfbSeconds?: number | null;
      ttfbBytes?: number;
      minBytesPerSecond?: number | null;
      windowSeconds?: number;
      gracePeriodSeconds?: number;
    }) => api.patchStallConfig(updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONFIG_EXPORT_KEY });
      toast.success('Stall detection settings saved');
    },
    onError: (err: Error) => toast.error(err.message, 'Failed to save stall detection settings'),
  });
};

// ---------------------------------------------------------------------------
// Context Compaction Settings (query + mutation)
// ---------------------------------------------------------------------------

export const useCompactionConfig = () =>
  useQuery({
    queryKey: COMPACTION_CONFIG_KEY,
    queryFn: () => api.getCompactionConfig(),
  });

export const useSaveCompactionConfig = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (updates: {
      enabled: boolean;
      strategy: 'native' | 'headroom';
      triggerRatio?: number;
      absoluteTriggerTokens: number | null;
      minTokens?: number;
      protectRecent?: number;
      native: { maxArrayItems?: number; maxStringChars?: number };
      headroom: {
        baseUrl?: string;
        apiKey?: string;
        targetRatio: number | null;
        timeoutMs?: number;
      };
    }) => api.patchCompactionConfig(updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONFIG_EXPORT_KEY });
    },
    onError: (err: Error) => toast.error(err.message, 'Failed to save compaction settings'),
  });
};

// ---------------------------------------------------------------------------
// Exploration Settings mutations (bg config + inline rates — saved together)
// ---------------------------------------------------------------------------

export const useSaveBackgroundExploration = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (updates: {
      enabled: boolean;
      stalenessThresholdSeconds: number;
      workerConcurrency: number;
    }) => api.patchBackgroundExploration(updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONFIG_EXPORT_KEY });
    },
    onError: (err: Error) => toast.error(err.message, 'Failed to save exploration settings'),
  });
};

export const useSaveExplorationRates = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (updates: {
      performanceExplorationRate: number;
      latencyExplorationRate: number;
      e2ePerformanceExplorationRate: number;
    }) => api.patchExplorationRates(updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONFIG_EXPORT_KEY });
    },
    onError: (err: Error) => toast.error(err.message, 'Failed to save exploration settings'),
  });
};

// ---------------------------------------------------------------------------
// Network Settings (Trusted Proxies) mutation
// ---------------------------------------------------------------------------

export const useSaveTrustedProxies = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (trustedProxies: string[]) => api.patchTrustedProxies(trustedProxies),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONFIG_EXPORT_KEY });
      toast.success('Trusted proxies saved');
    },
    onError: (err: Error) => toast.error(err.message, 'Failed to save trusted proxies'),
  });
};

// ---------------------------------------------------------------------------
// Grafana URL (query + mutation)
// ---------------------------------------------------------------------------

export const useGrafanaUrl = () =>
  useQuery({
    queryKey: GRAFANA_URL_KEY,
    queryFn: () => api.getGrafanaUrl(),
  });

export const useSaveGrafanaUrl = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (grafanaUrl: string) => api.setGrafanaUrl(grafanaUrl),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GRAFANA_URL_KEY });
      toast.success('Grafana URL saved');
    },
    onError: (err: Error) => toast.error(err.message, 'Failed to save Grafana URL'),
  });
};

// ---------------------------------------------------------------------------
// Action mutations (no form, no schema)
// ---------------------------------------------------------------------------

export const useRefreshModelMetadata = () => {
  const toast = useToast();

  return useMutation({
    mutationFn: () => api.refreshModelMetadata(),
    onSuccess: (result) => {
      if (result.hadErrors) {
        toast.warning(result.message);
      } else {
        toast.success(result.message);
      }
    },
    onError: (err: Error) => toast.error(err.message, 'Failed to refresh model metadata'),
  });
};

export const useBackupDownload = () => {
  const toast = useToast();

  return useMutation({
    mutationFn: () => api.createBackup(),
    onSuccess: (blob) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      triggerBlobDownload(blob, `plexus-backup-${timestamp}.json`);
      toast.success('Config backup downloaded');
    },
    onError: (err: Error) => toast.error(err.message, 'Backup failed'),
  });
};

export const useFullBackupDownload = () => {
  const toast = useToast();

  return useMutation({
    mutationFn: () => api.createFullBackup(),
    onSuccess: (blob) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      triggerBlobDownload(blob, `plexus-backup-${timestamp}.tar.gz`);
      toast.success('Full backup downloaded');
    },
    onError: (err: Error) => toast.error(err.message, 'Full backup failed'),
  });
};

export const useRestoreBackup = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (file: File) => {
      const isArchive =
        file.name.endsWith('.tar.gz') ||
        file.name.endsWith('.tgz') ||
        file.type === 'application/gzip' ||
        file.type === 'application/x-gzip';

      if (isArchive) {
        return api.restoreFullBackup(file);
      } else {
        const text = await file.text();
        const data = JSON.parse(text) as object;
        return api.restoreBackup(data);
      }
    },
    onSuccess: (result) => {
      toast.success(result.message, 'Restore complete');
      qc.invalidateQueries({ queryKey: CONFIG_EXPORT_KEY });
    },
    onError: (err: Error) => toast.error(err.message, 'Restore failed'),
  });
};

export const useResetLogs = () => {
  const toast = useToast();

  return useMutation({
    mutationFn: () => api.resetLogs(),
    onSuccess: (res) => {
      toast.success(res.message || 'All logs have been reset successfully');
    },
    onError: (err: Error) => toast.error(err.message, 'Failed to reset logs'),
  });
};

export const useRestart = () => {
  const toast = useToast();

  return useMutation({
    mutationFn: () => api.restart(),
    onError: (err: Error) => toast.error(err.message, 'Restart failed'),
  });
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

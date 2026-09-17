import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import { SECTION_NAMES } from '../lib/nav';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import type { CardLayout } from '../types/card';
import { DEFAULT_CARD_ORDER, LAYOUT_STORAGE_KEY } from '../types/card';
import { DisplayPreferencesCard } from '../components/config/DisplayPreferencesCard';
import { FailoverSettings } from '../components/config/FailoverSettings';
import { TraceCaptureSettings } from '../components/config/TraceCaptureSettings';
import { CooldownSettings } from '../components/config/CooldownSettings';
import { TimeoutSettings } from '../components/config/TimeoutSettings';
import { StallDetectionSettings } from '../components/config/StallDetectionSettings';
import { CompactionSettings } from '../components/config/CompactionSettings';
import { McpOAuthSettings } from '../components/config/McpOAuthSettings';
import { ExplorationSettings } from '../components/config/ExplorationSettings';
import { NetworkSettings } from '../components/config/NetworkSettings';
import { GrafanaSettings } from '../components/config/GrafanaSettings';
import { ModelMetadataCard } from '../components/config/ModelMetadataCard';
import { BackupRestoreCard } from '../components/config/BackupRestoreCard';
import { CardLayoutCard } from '../components/config/CardLayoutCard';
import { ConfigurationSnapshot } from '../components/config/ConfigurationSnapshot';
import {
  useConfigExport,
  CONFIG_EXPORT_KEY,
  useRefreshModelMetadata,
  useBackupDownload,
  useFullBackupDownload,
  useRestoreBackup,
  useResetLogs,
  useRestart,
} from '../hooks/queries/useConfig';

export const Config = () => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: configData, isSuccess: isConfigLoaded, isError: isConfigError } = useConfigExport();
  const config = configData ? JSON.stringify(configData, null, 2) : '';

  const restoreInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cardLayout, setCardLayout] = useState<CardLayout>([]);

  // Action mutations
  const refreshMetadata = useRefreshModelMetadata();
  const backupDownload = useBackupDownload();
  const fullBackupDownload = useFullBackupDownload();
  const restoreBackup = useRestoreBackup();
  const resetLogs = useResetLogs();
  const restart = useRestart();

  // Surface config export load failures
  useEffect(() => {
    if (isConfigError) {
      toast.error('Failed to load config');
    }
  }, [isConfigError]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCardLayout(parsed);
      } catch {
        console.error('Failed to parse card layout');
      }
    }
  }, []);

  const triggerDownload = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportLayout = () =>
    triggerDownload(
      JSON.stringify(cardLayout, null, 2),
      'plexus-card-layout.json',
      'application/json'
    );

  const handleExportConfig = () =>
    triggerDownload(config, 'plexus-config-export.json', 'application/json');

  const handleImportLayout = () => fileInputRef.current?.click();

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content) as CardLayout;

        if (
          Array.isArray(parsed) &&
          parsed.every((item) => typeof item.id === 'string' && typeof item.order === 'number')
        ) {
          const validIds = new Set<string>(DEFAULT_CARD_ORDER);
          const allIdsValid = parsed.every((item: { id: string }) => validIds.has(item.id));
          if (!allIdsValid) {
            toast.error('Invalid card layout: contains unknown card IDs');
            return;
          }

          localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(parsed));
          setCardLayout(parsed);
          toast.success('Card layout imported');
        } else {
          toast.error('Invalid card layout format');
        }
      } catch {
        toast.error('Failed to import: Invalid JSON file');
      }
    };
    reader.readAsText(file);

    event.target.value = '';
  };

  const handleRestoreClick = () => restoreInputRef.current?.click();

  const handleRestoreFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const ok = await toast.confirm({
      title: 'Restore Database?',
      message:
        'This will **replace all existing data** with the contents of the backup file. This action cannot be undone. Are you sure?',
      confirmLabel: 'Restore',
      variant: 'danger',
    });
    if (!ok) return;

    restoreBackup.mutate(file);
  };

  const handleRestart = async () => {
    const ok = await toast.confirm({
      title: 'Restart Plexus?',
      message:
        'This will briefly interrupt all ongoing requests. Are you sure you want to continue?',
      confirmLabel: 'Restart',
      variant: 'danger',
    });
    if (!ok) return;

    restart.mutate();
  };

  const handleResetLogs = async () => {
    const ok = await toast.confirm({
      title: 'Reset All Logs?',
      message:
        'This will **permanently delete all request logs, error logs, and debug trace logs**. Configuration, cooldowns, and settings will not be touched. This action cannot be undone. Are you sure?',
      confirmLabel: 'Reset Logs',
      variant: 'danger',
    });
    if (!ok) return;

    resetLogs.mutate();
  };

  const loadConfig = () => {
    queryClient.invalidateQueries({ queryKey: CONFIG_EXPORT_KEY });
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={SECTION_NAMES['/config']}
        subtitle="View current system configuration (read-only). Use the Providers, Models, and Keys pages to make changes."
      />

      <PageContainer>
        <div className="flex flex-col gap-6">
          <DisplayPreferencesCard />

          <FailoverSettings />

          <TraceCaptureSettings />

          <CooldownSettings />

          <TimeoutSettings />

          <StallDetectionSettings />

          <CompactionSettings />

          <McpOAuthSettings />

          <ExplorationSettings />

          <NetworkSettings />

          <GrafanaSettings />

          <ModelMetadataCard
            loading={refreshMetadata.isPending}
            onRefresh={() => refreshMetadata.mutate()}
          />

          <BackupRestoreCard
            restoreInputRef={restoreInputRef}
            restoreLoading={restoreBackup.isPending}
            fullBackupLoading={fullBackupDownload.isPending}
            backupLoading={backupDownload.isPending}
            resetLogsLoading={resetLogs.isPending}
            onRestoreClick={handleRestoreClick}
            onRestoreFileSelect={handleRestoreFileSelect}
            onFullBackupDownload={() => fullBackupDownload.mutate()}
            onBackupDownload={() => backupDownload.mutate()}
            onResetLogs={handleResetLogs}
          />

          <CardLayoutCard
            cardLayout={cardLayout}
            fileInputRef={fileInputRef}
            onExport={handleExportLayout}
            onImport={handleImportLayout}
            onFileSelect={handleFileSelect}
          />

          <ConfigurationSnapshot
            config={config}
            loaded={isConfigLoaded}
            restarting={restart.isPending}
            onRefresh={loadConfig}
            onRestart={handleRestart}
            onExport={handleExportConfig}
          />
        </div>
      </PageContainer>
    </div>
  );
};

import type { ChangeEvent, RefObject } from 'react';
import { AlertTriangle, Archive, HardDrive, Trash2, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { SectionCard } from '../ui/SectionCard';

interface BackupRestoreCardProps {
  restoreInputRef: RefObject<HTMLInputElement | null>;
  restoreLoading: boolean;
  fullBackupLoading: boolean;
  backupLoading: boolean;
  resetLogsLoading: boolean;
  onRestoreClick: () => void;
  onRestoreFileSelect: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onFullBackupDownload: () => void;
  onBackupDownload: () => void;
  onResetLogs: () => void;
}

export function BackupRestoreCard({
  restoreInputRef,
  restoreLoading,
  fullBackupLoading,
  backupLoading,
  resetLogsLoading,
  onRestoreClick,
  onRestoreFileSelect,
  onFullBackupDownload,
  onBackupDownload,
  onResetLogs,
}: BackupRestoreCardProps) {
  return (
    <SectionCard title="Backup & Restore">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 mr-1">
          <AlertTriangle size="0.8125rem" className="text-warning-text shrink-0" />
          <span className="font-sans text-label text-foreground-subtle">
            Sensitive data — store securely
          </span>
        </div>
        <Button
          variant="danger"
          size="sm"
          onClick={onRestoreClick}
          isLoading={restoreLoading}
          leftIcon={<Upload size="0.875rem" />}
        >
          Restore
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onFullBackupDownload}
          isLoading={fullBackupLoading}
          leftIcon={<Archive size="0.875rem" />}
        >
          Full Backup
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onBackupDownload}
          isLoading={backupLoading}
          leftIcon={<HardDrive size="0.875rem" />}
        >
          Config Backup
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={onResetLogs}
          isLoading={resetLogsLoading}
          leftIcon={<Trash2 size="0.875rem" />}
        >
          Reset All Logs
        </Button>
        <input
          ref={restoreInputRef}
          type="file"
          accept=".json,.tar.gz,.tgz,application/gzip,application/x-gzip,application/octet-stream"
          className="hidden"
          onChange={onRestoreFileSelect}
        />
      </div>
    </SectionCard>
  );
}

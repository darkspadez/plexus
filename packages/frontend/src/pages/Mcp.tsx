import { useEffect, useState } from 'react';
import { api, McpServer, McpServerKey, McpOAuthClientRecord } from '../lib/api';
import { Button } from '../components/ui/Button';
import { CopyButton } from '../components/ui/CopyButton';
import { Skeleton } from '../components/ui/Skeleton';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import { McpServerTable } from '../components/mcp/McpServerTable';
import { McpOAuthClientsCard } from '../components/mcp/McpOAuthClientsCard';
import { McpUsageLogsCard } from '../components/mcp/McpUsageLogsCard';
import { McpKeyManagementModal } from '../components/mcp/McpKeyManagementModal';
import { McpDeleteLogsModal } from '../components/mcp/McpDeleteLogsModal';
import { McpDeleteLogModal } from '../components/mcp/McpDeleteLogModal';
import { McpServerSheet } from './mcp/McpServerSheet';
import { useToast } from '../contexts/ToastContext';
import { Download, Package, Plus } from 'lucide-react';
import { isClipboardAvailable, copyToClipboard } from '../lib/clipboard';
import { SECTION_NAMES } from '../lib/nav';
import {
  useMcpServers,
  useMcpEnabled,
  useMcpLogs,
  useDeleteMcpServer,
  useToggleMcpEnabled,
  useDeleteMcpLog,
  useDeleteAllMcpLogs,
  MCP_SERVERS_KEY,
} from '../hooks/queries/useMcp';
import { useQueryClient } from '@tanstack/react-query';
import plexusCliSkill from '../../../../.agents/skills/plexus-cli/SKILL.md' with { type: 'text' };
import plexusRestApiSkill from '../../../../.agents/skills/plexus-rest-api/SKILL.md' with {
  type: 'text',
};

const CLI_BUNX_COMMAND = 'bunx @mcowger/plexus-cli';
const CLI_GLOBAL_INSTALL_COMMAND = 'bun install -g @mcowger/plexus-cli';

export const McpPage: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();

  // --- TanStack Query data ---
  const { data: servers = {}, isLoading } = useMcpServers();
  const { data: mcpEnabledData } = useMcpEnabled();
  const mcpEnabled = mcpEnabledData?.enabled ?? true;

  // Logs query state (controlled externally so user can paginate/search)
  const [logsQueryOffset, setLogsQueryOffset] = useState(0);
  const [logsActiveFilters, setLogsActiveFilters] = useState({ serverName: '', apiKey: '' });
  const logsLimit = 20;
  const { data: logsData, isLoading: logsLoading } = useMcpLogs(
    logsLimit,
    logsQueryOffset,
    logsActiveFilters
  );
  const logs = logsData?.data ?? [];
  const logsTotal = Number(logsData?.total) || 0;

  // Mutations
  const deleteMcpServerMutation = useDeleteMcpServer();
  const toggleMcpEnabledMutation = useToggleMcpEnabled();
  const deleteMcpLogMutation = useDeleteMcpLog();
  const deleteAllMcpLogsMutation = useDeleteAllMcpLogs();
  const isDeletingLogs = deleteMcpLogMutation.isPending || deleteAllMcpLogsMutation.isPending;

  // Add/edit server sheet (react-hook-form + zod — see pages/mcp/McpServerSheet.tsx)
  const [isServerSheetOpen, setIsServerSheetOpen] = useState(false);
  const [editingServerName, setEditingServerName] = useState<string | null>(null);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);

  // Plexus CLI install popover
  const [isCliInstallOpen, setIsCliInstallOpen] = useState(false);

  // Load-balanced key management (remote servers)
  const [keyManagementServerName, setKeyManagementServerName] = useState<string | null>(null);
  const [serverKeys, setServerKeys] = useState<McpServerKey[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [newServerKey, setNewServerKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  // Re-render every 30s while the key modal is open so cooldown countdowns stay fresh
  const [, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    if (!keyManagementServerName) return;
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [keyManagementServerName]);

  // Logs UI state (input filters before submitting search)
  const [logsFilters, setLogsFilters] = useState({ serverName: '', apiKey: '' });

  // OAuth clients/tokens state
  const [oauthClients, setOauthClients] = useState<McpOAuthClientRecord[]>([]);
  const [oauthClientsLoading, setOauthClientsLoading] = useState(false);
  const [revokingTokenId, setRevokingTokenId] = useState<number | null>(null);
  const [updatingClientId, setUpdatingClientId] = useState<string | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [revokingAllClientId, setRevokingAllClientId] = useState<string | null>(null);

  // Delete logs modal state
  const [isDeleteLogsModalOpen, setIsDeleteLogsModalOpen] = useState(false);
  const [deleteLogsMode, setDeleteLogsMode] = useState<'all' | 'older'>('older');
  const [olderThanDays, setOlderThanDays] = useState(7);

  // Single log delete state
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [isSingleDeleteModalOpen, setIsSingleDeleteModalOpen] = useState(false);

  const handleLogSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLogsQueryOffset(0);
    setLogsActiveFilters({ ...logsFilters });
  };

  const handleDeleteAllLogs = () => {
    setIsDeleteLogsModalOpen(true);
  };

  const confirmDeleteAllLogs = async () => {
    const olderThan = deleteLogsMode === 'older' ? olderThanDays : undefined;
    deleteAllMcpLogsMutation.mutate(olderThan, {
      onSuccess: () => {
        setLogsQueryOffset(0);
        setIsDeleteLogsModalOpen(false);
      },
    });
  };

  const handleDeleteLog = (requestId: string) => {
    setSelectedLogId(requestId);
    setIsSingleDeleteModalOpen(true);
  };

  const confirmDeleteSingleLog = async () => {
    if (!selectedLogId) return;
    deleteMcpLogMutation.mutate(selectedLogId, {
      onSuccess: () => {
        setIsSingleDeleteModalOpen(false);
        setSelectedLogId(null);
      },
    });
  };

  const handleAddNew = () => {
    setEditingServerName(null);
    setEditingServer(null);
    setIsServerSheetOpen(true);
  };

  const handleEdit = (serverName: string) => {
    const server = servers[serverName];
    if (!server) return;
    setEditingServerName(serverName);
    setEditingServer({ ...server });
    setIsServerSheetOpen(true);
  };

  const handleDelete = async (serverName: string) => {
    const ok = await toast.confirm({
      title: 'Delete MCP server?',
      message: `Are you sure you want to delete the MCP server "${serverName}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    deleteMcpServerMutation.mutate(serverName, {
      onSuccess: () => toast.success(`Deleted ${serverName}`),
    });
  };

  const handleToggleEnabled = async (serverName: string, newState: boolean) => {
    const server = servers[serverName];
    if (!server) return;

    try {
      await api.saveMcpServer(serverName, {
        ...server,
        enabled: newState,
      });
      await queryClient.invalidateQueries({ queryKey: MCP_SERVERS_KEY });
    } catch (e) {
      console.error('Toggle error', e);
      toast.error(`Failed to update MCP server: ${e}`);
    }
  };

  const handleToggleMcpEnabled = (enabled: boolean) => {
    toggleMcpEnabledMutation.mutate(enabled, {
      onSuccess: () => toast.success(`MCP server ${enabled ? 'enabled' : 'disabled'}`),
    });
  };

  const loadServerKeys = async (serverName: string) => {
    setIsLoadingKeys(true);
    try {
      setServerKeys(await api.getMcpServerKeys(serverName));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIsLoadingKeys(false);
    }
  };

  const handleManageKeys = (serverName: string) => {
    setKeyManagementServerName(serverName);
    setNewServerKey('');
    setServerKeys([]);
    void loadServerKeys(serverName);
  };

  const handleAddServerKey = async () => {
    if (!keyManagementServerName || !newServerKey.trim()) return;
    setIsSavingKey(true);
    try {
      await api.addMcpServerKey(keyManagementServerName, newServerKey.trim());
      setNewServerKey('');
      await loadServerKeys(keyManagementServerName);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleDeleteServerKey = async (keyId: number) => {
    if (!keyManagementServerName) return;
    try {
      await api.deleteMcpServerKey(keyManagementServerName, keyId);
      await loadServerKeys(keyManagementServerName);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleClearServerKeyCooldown = async (keyId: number) => {
    if (!keyManagementServerName) return;
    try {
      await api.clearMcpServerKeyCooldown(keyManagementServerName, keyId);
      await loadServerKeys(keyManagementServerName);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // ---------------------------------------------------------------------------
  // MCP OAuth clients + tokens
  // ---------------------------------------------------------------------------

  const loadOAuthClients = async () => {
    setOauthClientsLoading(true);
    try {
      const clients = await api.getMcpOAuthClients();
      setOauthClients(clients);
    } catch (e) {
      console.error('Failed to load MCP OAuth clients', e);
      toast.error('Failed to load MCP OAuth clients');
    } finally {
      setOauthClientsLoading(false);
    }
  };

  useEffect(() => {
    loadOAuthClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRevokeOAuthToken = async (tokenId: number) => {
    const ok = await toast.confirm({
      title: 'Revoke OAuth token?',
      message: 'The client will need to reconnect before it can access MCP with this token again.',
      confirmLabel: 'Revoke',
      variant: 'danger',
    });
    if (!ok) return;

    setRevokingTokenId(tokenId);
    try {
      await api.revokeMcpOAuthToken(tokenId);
      await loadOAuthClients();
      toast.success('OAuth token revoked');
    } catch (e) {
      toast.error((e as Error).message, 'Failed to revoke OAuth token');
    } finally {
      setRevokingTokenId(null);
    }
  };

  const handleToggleOAuthClientStatus = async (client: McpOAuthClientRecord) => {
    const disabling = client.status !== 'disabled';
    const ok = await toast.confirm({
      title: disabling ? 'Disable OAuth client?' : 'Re-enable OAuth client?',
      message: disabling
        ? 'Disable this OAuth client? It will no longer be able to authorize or exchange tokens.'
        : 'Re-enable this OAuth client?',
      confirmLabel: disabling ? 'Disable' : 'Re-enable',
      variant: disabling ? 'danger' : 'default',
    });
    if (!ok) return;

    setUpdatingClientId(client.clientId);
    try {
      await api.updateMcpOAuthClientStatus(client.clientId, disabling ? 'disabled' : 'active');
      await loadOAuthClients();
      toast.success(disabling ? 'OAuth client disabled' : 'OAuth client re-enabled');
    } catch (e) {
      toast.error((e as Error).message, 'Failed to update OAuth client');
    } finally {
      setUpdatingClientId(null);
    }
  };

  const handleRevokeAllOAuthTokens = async (clientId: string) => {
    const ok = await toast.confirm({
      title: 'Revoke all tokens?',
      message: 'Revoke all tokens for this client? This cannot be undone.',
      confirmLabel: 'Revoke all',
      variant: 'danger',
    });
    if (!ok) return;

    setRevokingAllClientId(clientId);
    try {
      await api.revokeMcpOAuthClientTokens(clientId);
      await loadOAuthClients();
      toast.success('All tokens revoked for this client');
    } catch (e) {
      toast.error((e as Error).message, 'Failed to revoke all tokens');
    } finally {
      setRevokingAllClientId(null);
    }
  };

  const handleDeleteOAuthClient = async (clientId: string) => {
    const ok = await toast.confirm({
      title: 'Delete OAuth client?',
      message: 'Delete this OAuth client? This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingClientId(clientId);
    try {
      await api.deleteMcpOAuthClient(clientId);
      await loadOAuthClients();
      toast.success('OAuth client deleted');
    } catch (e) {
      toast.error((e as Error).message, 'Failed to delete OAuth client');
    } finally {
      setDeletingClientId(null);
    }
  };

  const serverNames = Object.keys(servers);
  const mcpPathForServer = (name: string) => `/mcp/${name}`;

  const handleCopyMcpPath = async (path: string) => {
    if (!isClipboardAvailable()) {
      toast.error('Copy requires HTTPS connection');
      return;
    }
    const success = await copyToClipboard(path);
    if (success) {
      toast.success(`Copied ${path}`);
    } else {
      toast.error('Failed to copy path');
    }
  };

  const handleCopySkill = async (skill: string, name: string) => {
    const canCopy = isClipboardAvailable();
    if (!canCopy) {
      toast.error('Copy requires HTTPS connection');
      return;
    }
    const success = await copyToClipboard(skill);
    if (success) {
      toast.success(`${name} copied to clipboard`);
    } else {
      toast.error('Failed to copy to clipboard');
    }
  };

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

  const handleDownloadSkill = (skill: string, filename: string) => {
    triggerDownload(skill, filename, 'text/markdown');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-full">
        <PageHeader
          title={SECTION_NAMES['/mcp']}
          subtitle="Model Context Protocol connections and the Plexus admin skill"
        />
        <PageContainer>
          <div className="flex flex-col gap-4">
            <Skeleton height={44} className="w-full" />
            <Skeleton height={220} className="w-full" />
            <Skeleton height={220} className="w-full" />
            <Skeleton height={220} className="w-full" />
          </div>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={SECTION_NAMES['/mcp']}
        subtitle="Model Context Protocol connections and the Plexus admin skill"
        actions={
          <>
            <div className="relative inline-flex items-center gap-1">
              <Button
                variant="secondary"
                size="md"
                onClick={() => handleCopySkill(plexusCliSkill, 'Plexus CLI Skill')}
              >
                Plexus CLI Skill
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => handleDownloadSkill(plexusCliSkill, 'plexus-cli-SKILL.md')}
                title="Download skill as file"
                aria-label="Download Plexus CLI skill"
              >
                <Download size={14} />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setIsCliInstallOpen((open) => !open)}
                title="Install Plexus CLI"
                aria-label="Install Plexus CLI"
                aria-expanded={isCliInstallOpen}
              >
                <Package size={14} />
              </Button>
              {isCliInstallOpen && (
                <div className="absolute right-0 top-full z-[100] mt-1 w-80 rounded-lg border border-border bg-surface p-3 shadow-[var(--shadow-md)]">
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-foreground-subtle">
                    Install Plexus CLI
                  </p>
                  <div className="mb-2 flex items-center gap-1 rounded-md bg-surface-sunken px-2 py-1 font-mono text-xs text-foreground-muted">
                    <code className="min-w-0 flex-1 break-all">{CLI_BUNX_COMMAND}</code>
                    <CopyButton value={CLI_BUNX_COMMAND} label="Copy bunx command" size="sm" />
                  </div>
                  <div className="flex items-center gap-1 rounded-md bg-surface-sunken px-2 py-1 font-mono text-xs text-foreground-muted">
                    <code className="min-w-0 flex-1 break-all">{CLI_GLOBAL_INSTALL_COMMAND}</code>
                    <CopyButton
                      value={CLI_GLOBAL_INSTALL_COMMAND}
                      label="Copy Bun install command"
                      size="sm"
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="inline-flex items-center gap-1">
              <Button
                variant="secondary"
                size="md"
                onClick={() => handleCopySkill(plexusRestApiSkill, 'Plexus REST API Skill')}
              >
                Plexus REST API Skill
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => handleDownloadSkill(plexusRestApiSkill, 'plexus-rest-api-SKILL.md')}
                title="Download as file"
                aria-label="Download Plexus REST API skill"
              >
                <Download size={14} />
              </Button>
            </div>
            <Button leftIcon={<Plus size={14} />} onClick={handleAddNew} size="md">
              Add server
            </Button>
          </>
        }
      />
      <PageContainer>
        <div className="flex flex-col gap-6">
          <McpServerTable
            servers={servers}
            serverNames={serverNames}
            mcpEnabled={mcpEnabled}
            onEdit={handleEdit}
            onManageKeys={handleManageKeys}
            onToggleEnabled={handleToggleEnabled}
            onToggleMcpEnabled={handleToggleMcpEnabled}
            onDelete={handleDelete}
            mcpPathForServer={mcpPathForServer}
            onCopyMcpPath={handleCopyMcpPath}
          />

          <McpOAuthClientsCard
            oauthClients={oauthClients}
            oauthClientsLoading={oauthClientsLoading}
            revokingTokenId={revokingTokenId}
            updatingClientId={updatingClientId}
            deletingClientId={deletingClientId}
            revokingAllClientId={revokingAllClientId}
            onRefresh={loadOAuthClients}
            onRevokeToken={handleRevokeOAuthToken}
            onToggleClientStatus={handleToggleOAuthClientStatus}
            onRevokeAllTokens={handleRevokeAllOAuthTokens}
            onDeleteClient={handleDeleteOAuthClient}
          />

          <McpUsageLogsCard
            logs={logs}
            logsTotal={logsTotal}
            logsLoading={logsLoading}
            logsLimit={logsLimit}
            logsOffset={logsQueryOffset}
            logsFilters={logsFilters}
            onFiltersChange={setLogsFilters}
            onSearch={handleLogSearch}
            onDeleteAll={handleDeleteAllLogs}
            onDeleteLog={handleDeleteLog}
            onOffsetChange={setLogsQueryOffset}
          />

          {/* Add/edit server — react-hook-form + zod sheet. Supersedes upstream's
              raw controlled-input McpServerEditorModal, which was removed rather
              than left unreachable alongside this one. */}
          <McpServerSheet
            open={isServerSheetOpen}
            onOpenChange={setIsServerSheetOpen}
            editingServerName={editingServerName}
            initial={editingServer}
            servers={servers}
          />

          <McpKeyManagementModal
            serverName={keyManagementServerName}
            authScheme={
              keyManagementServerName ? servers[keyManagementServerName]?.auth_scheme : undefined
            }
            serverKeys={serverKeys}
            isLoadingKeys={isLoadingKeys}
            newServerKey={newServerKey}
            onNewServerKeyChange={setNewServerKey}
            isSavingKey={isSavingKey}
            onClose={() => setKeyManagementServerName(null)}
            onAddKey={handleAddServerKey}
            onDeleteKey={handleDeleteServerKey}
            onClearCooldown={handleClearServerKeyCooldown}
          />

          <McpDeleteLogsModal
            isOpen={isDeleteLogsModalOpen}
            deleteLogsMode={deleteLogsMode}
            olderThanDays={olderThanDays}
            isDeletingLogs={isDeletingLogs}
            onClose={() => setIsDeleteLogsModalOpen(false)}
            onModeChange={setDeleteLogsMode}
            onOlderThanDaysChange={setOlderThanDays}
            onConfirm={confirmDeleteAllLogs}
          />

          <McpDeleteLogModal
            isOpen={isSingleDeleteModalOpen}
            isDeletingLogs={isDeletingLogs}
            onClose={() => setIsSingleDeleteModalOpen(false)}
            onConfirm={confirmDeleteSingleLog}
          />
        </div>
      </PageContainer>
    </div>
  );
};

export default McpPage;

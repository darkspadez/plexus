/**
 * McpServerSheet — react-hook-form + zod sheet for creating / editing MCP servers.
 *
 * Replaces the inline MCP server modal in Mcp.tsx.
 * Key design decisions:
 *   - Discriminated union on `mode` drives field visibility (watch('mode')).
 *   - headers and env remain as managed state (NOT rhf fields) because they're
 *     dynamic key-value maps — matches the old Mcp.tsx add/remove pattern.
 *   - Server name is part of the form for create mode, but locked for edit mode.
 *   - Calls api.saveMcpServer() directly (no mutation hook) + queryClient.invalidateQueries.
 */
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PlusCircle, MinusCircle } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Switch } from '../../components/ui/Switch';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { MCP_SERVERS_KEY } from '../../hooks/queries/useMcp';
import { parseArguments } from '../../lib/parseArguments';
import {
  mcpFormSchema,
  REMOTE_MCP_DEFAULTS,
  LOCAL_MCP_DEFAULTS,
  type McpFormValues,
  type RemoteMcpFormValues,
  type LocalMcpFormValues,
} from './mcp-schema';
import type { McpServer, RemoteMcpServer, LocalMcpServer } from '../../lib/api';

const LOCAL_MCP_DEFAULT_PORT = 7345;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null for create, non-null for edit (the existing server name) */
  editingServerName: string | null;
  initial: McpServer | null;
  /** Existing server map for port-collision avoidance */
  servers: Record<string, McpServer>;
}

const LAUNCHER_OPTIONS = [
  { value: 'bunx', label: 'bunx' },
  { value: 'uvx', label: 'uvx' },
] as const;

const SERVER_TYPE_OPTIONS = [
  { value: 'remote_http', label: 'Remote HTTP' },
  { value: 'local_http', label: 'Local HTTP' },
] as const;

export const McpServerSheet: React.FC<Props> = ({
  open,
  onOpenChange,
  editingServerName,
  initial,
  servers,
}) => {
  const isEditing = !!editingServerName;
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = React.useState(false);

  // headers and env are managed state (dynamic key-value maps)
  const [headers, setHeaders] = React.useState<Record<string, string>>({});
  const [headerKey, setHeaderKey] = React.useState('');
  const [headerValue, setHeaderValue] = React.useState('');
  const [env, setEnv] = React.useState<Record<string, string>>({});
  const [envKey, setEnvKey] = React.useState('');
  const [envValue, setEnvValue] = React.useState('');

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<McpFormValues>({
    resolver: zodResolver(mcpFormSchema),
    defaultValues: REMOTE_MCP_DEFAULTS,
  });

  const currentMode = watch('mode');

  const getNextLocalMcpPort = (): number => {
    const usedPorts = new Set(
      Object.entries(servers)
        .filter(([name]) => name !== editingServerName)
        .map(([, server]) => (server.mode === 'local_http' ? server.port : null))
        .filter((port): port is number => typeof port === 'number')
    );
    let port = LOCAL_MCP_DEFAULT_PORT;
    while (usedPorts.has(port) && port < 65535) port += 1;
    return port;
  };

  // Re-initialise form when sheet opens.
  React.useEffect(() => {
    if (!open) return;

    if (isEditing && initial) {
      setHeaders({ ...(initial.headers ?? {}) });
      setEnv(initial.mode === 'local_http' ? { ...(initial.env ?? {}) } : {});
      setHeaderKey('');
      setHeaderValue('');
      setEnvKey('');
      setEnvValue('');

      if (initial.mode === 'local_http') {
        reset({
          mode: 'local_http',
          serverName: editingServerName!,
          launcher: initial.launcher,
          package: initial.package,
          argsInput: (initial.args ?? []).join(' '),
          port: initial.port,
          path: initial.path ?? '/mcp',
          startup_timeout_ms: initial.startup_timeout_ms ?? 30000,
          enabled: initial.enabled,
        } satisfies LocalMcpFormValues);
      } else {
        reset({
          mode: 'remote_http',
          serverName: editingServerName!,
          upstream_url: (initial as RemoteMcpServer).upstream_url,
          enabled: initial.enabled,
        } satisfies RemoteMcpFormValues);
      }
    } else {
      setHeaders({});
      setEnv({});
      setHeaderKey('');
      setHeaderValue('');
      setEnvKey('');
      setEnvValue('');
      reset({
        ...REMOTE_MCP_DEFAULTS,
        serverName: '',
      });
    }
  }, [open, editingServerName, initial, isEditing, reset]);

  const handleModeChange = (newMode: string) => {
    if (newMode === 'local_http') {
      reset({
        ...LOCAL_MCP_DEFAULTS,
        serverName: watch('serverName') ?? '',
        enabled: watch('enabled') ?? true,
        port: getNextLocalMcpPort(),
      } satisfies LocalMcpFormValues);
    } else {
      reset({
        ...REMOTE_MCP_DEFAULTS,
        serverName: watch('serverName') ?? '',
        enabled: watch('enabled') ?? true,
      } satisfies RemoteMcpFormValues);
    }
    // Keep headers when switching mode
    setEnv({});
  };

  const addHeader = () => {
    if (!headerKey.trim() || !headerValue.trim()) return;
    setHeaders((prev) => ({ ...prev, [headerKey.trim()]: headerValue.trim() }));
    setHeaderKey('');
    setHeaderValue('');
  };

  const removeHeader = (key: string) => {
    setHeaders((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const addEnv = () => {
    if (!envKey.trim()) return;
    setEnv((prev) => ({ ...prev, [envKey.trim()]: envValue }));
    setEnvKey('');
    setEnvValue('');
  };

  const removeEnv = (key: string) => {
    setEnv((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const onSubmit = async (values: McpFormValues) => {
    const nameToSave = values.serverName.trim();

    // Merge any pending unsaved header/env input
    const finalHeaders = { ...headers };
    if (headerKey.trim() && headerValue.trim()) {
      finalHeaders[headerKey.trim()] = headerValue.trim();
    }

    let payload: McpServer;
    if (values.mode === 'local_http') {
      const finalEnv = { ...env };
      if (envKey.trim()) {
        finalEnv[envKey.trim()] = envValue;
      }
      payload = {
        mode: 'local_http',
        enabled: values.enabled,
        launcher: values.launcher,
        package: values.package,
        args: parseArguments(values.argsInput),
        env: finalEnv,
        port: values.port,
        path: values.path,
        startup_timeout_ms: values.startup_timeout_ms,
        headers: finalHeaders,
      } satisfies LocalMcpServer;
    } else {
      payload = {
        mode: 'remote_http',
        upstream_url: values.upstream_url,
        enabled: values.enabled,
        headers: finalHeaders,
      } satisfies RemoteMcpServer;
    }

    setIsSaving(true);
    try {
      await api.saveMcpServer(nameToSave, payload);
      await queryClient.invalidateQueries({ queryKey: MCP_SERVERS_KEY });
      onOpenChange(false);
    } catch (e) {
      console.error('Save error', e);
      toast.error(`Failed to save MCP server: ${e}`);
    } finally {
      setIsSaving(false);
    }
  };

  const footer = (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => onOpenChange(false)}
        disabled={isSaving}
      >
        Cancel
      </Button>
      <Button type="submit" form="mcp-server-sheet-form" isLoading={isSaving}>
        {isEditing ? 'Save changes' : 'Add server'}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={isEditing ? `Edit ${editingServerName}` : 'Add MCP Server'}
      size="md"
      footer={footer}
    >
      <form
        id="mcp-server-sheet-form"
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        {/* Server Name (create only) */}
        {!isEditing && (
          <Input
            {...register('serverName')}
            label="Server Name"
            placeholder="my-mcp-server"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            error={errors.serverName?.message}
            hint="Lowercase letters, numbers, hyphens, underscores. 2–63 chars."
          />
        )}

        {/* Server Type */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="server-type"
            className="font-sans text-xs font-medium text-foreground-muted"
          >
            Server Type
          </label>
          <select
            id="server-type"
            className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
            value={currentMode}
            onChange={(e) => handleModeChange(e.target.value)}
          >
            {SERVER_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Mode-specific fields */}
        {currentMode === 'local_http' ? (
          <>
            {/* Launcher */}
            <Controller
              control={control}
              name="launcher"
              render={({ field }) => (
                <Select
                  label="Launcher"
                  value={field.value as 'bunx' | 'uvx'}
                  onChange={field.onChange}
                  options={LAUNCHER_OPTIONS as unknown as { value: string; label: string }[]}
                  error={(errors as Record<string, { message?: string }>).launcher?.message}
                />
              )}
            />

            {/* Package */}
            <Input
              {...register('package')}
              label="Package"
              placeholder="@example/mcp-server"
              error={(errors as Record<string, { message?: string }>).package?.message}
            />

            {/* Arguments */}
            <Input
              {...register('argsInput')}
              label="Arguments"
              placeholder="--port {{PORT}}"
              error={(errors as Record<string, { message?: string }>).argsInput?.message}
            />
            <p className="-mt-2 text-xs text-foreground-muted">
              Available interpolations: {'{{PORT}}'} for the configured port and {'{{HOST}}'} for
              127.0.0.1.
            </p>

            {/* Port, Path, Timeout */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                {...register('port', { valueAsNumber: true })}
                label="Port"
                type="number"
                error={(errors as Record<string, { message?: string }>).port?.message}
              />
              <Input
                {...register('path')}
                label="Path"
                error={(errors as Record<string, { message?: string }>).path?.message}
              />
              <Input
                {...register('startup_timeout_ms', { valueAsNumber: true })}
                label="Startup Timeout (ms)"
                type="number"
                error={(errors as Record<string, { message?: string }>).startup_timeout_ms?.message}
              />
            </div>

            {/* Environment Variables */}
            <div className="space-y-2 rounded-md border border-border p-3">
              <label className="text-sm font-medium text-foreground-muted">
                Environment Variables
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <Input
                    label="Env Key"
                    value={envKey}
                    onChange={(e) => setEnvKey(e.target.value)}
                    placeholder="API_KEY"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Input
                    label="Env Value"
                    value={envValue}
                    onChange={(e) => setEnvValue(e.target.value)}
                    placeholder="secret value"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addEnv}
                  className="w-full sm:w-auto"
                >
                  <PlusCircle size={16} />
                </Button>
              </div>
              {Object.keys(env).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(env).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex flex-col gap-2 p-2 bg-surface-elevated rounded-md sm:flex-row sm:items-center"
                    >
                      <span className="min-w-0 flex-1 break-all font-mono text-xs">{key}</span>
                      <span className="flex-1 font-mono text-xs text-foreground-muted truncate">
                        {value}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeEnv(key)}
                        aria-label={`Remove env var ${key}`}
                        className="p-1 hover:bg-surface rounded"
                      >
                        <MinusCircle size={14} className="text-danger" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Remote HTTP: upstream URL */
          <Input
            {...register('upstream_url')}
            label="Upstream URL"
            placeholder="https://mcp.example.com/mcp"
            error={(errors as Record<string, { message?: string }>).upstream_url?.message}
          />
        )}

        {/* Headers (both modes) */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Input
              label="Header Key"
              value={headerKey}
              onChange={(e) => setHeaderKey(e.target.value)}
              placeholder="Authorization"
            />
          </div>
          <div className="min-w-0 flex-1">
            <Input
              label="Header Value"
              value={headerValue}
              onChange={(e) => setHeaderValue(e.target.value)}
              placeholder="Bearer token..."
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addHeader}
            className="w-full sm:w-auto"
          >
            <PlusCircle size={16} />
          </Button>
        </div>
        {Object.keys(headers).length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground-muted">Configured Headers</label>
            {Object.entries(headers).map(([key, value]) => (
              <div
                key={key}
                className="flex flex-col gap-2 p-2 bg-surface-elevated rounded-md sm:flex-row sm:items-center"
              >
                <span className="min-w-0 flex-1 break-all font-mono text-xs">{key}</span>
                <span className="flex-1 font-mono text-xs text-foreground-muted truncate">
                  {value}
                </span>
                <button
                  type="button"
                  onClick={() => removeHeader(key)}
                  aria-label={`Remove header ${key}`}
                  className="p-1 hover:bg-surface rounded"
                >
                  <MinusCircle size={14} className="text-danger" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Enabled toggle */}
        <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface-elevated p-3">
          <span className="font-sans text-[13px] font-medium text-foreground">Enabled</span>
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onChange={field.onChange}
                aria-label="Toggle server enabled"
              />
            )}
          />
        </div>
      </form>
    </Modal>
  );
};

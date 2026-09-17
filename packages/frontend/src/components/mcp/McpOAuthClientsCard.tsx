import React from 'react';
import { KeyRound, RefreshCw, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { DataTable } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { Pill } from '../chips';
import { cn } from '../../lib/cn';
import type { McpOAuthClientRecord, McpOAuthTokenRecord } from '../../lib/api';

interface McpOAuthClientsCardProps {
  oauthClients: McpOAuthClientRecord[];
  oauthClientsLoading: boolean;
  revokingTokenId: number | null;
  updatingClientId: string | null;
  deletingClientId: string | null;
  revokingAllClientId: string | null;
  onRefresh: () => void | Promise<void>;
  onRevokeToken: (tokenId: number) => void | Promise<void>;
  onToggleClientStatus: (client: McpOAuthClientRecord) => void | Promise<void>;
  onRevokeAllTokens: (clientId: string) => void | Promise<void>;
  onDeleteClient: (clientId: string) => void | Promise<void>;
}

export function McpOAuthClientsCard({
  oauthClients,
  oauthClientsLoading,
  revokingTokenId,
  updatingClientId,
  deletingClientId,
  revokingAllClientId,
  onRefresh,
  onRevokeToken,
  onToggleClientStatus,
  onRevokeAllTokens,
  onDeleteClient,
}: McpOAuthClientsCardProps) {
  const tokenColumns = React.useMemo<ColumnDef<McpOAuthTokenRecord>[]>(
    () => [
      {
        id: 'keyName',
        header: 'Key name',
        meta: { priority: 'high', mobileTitle: true },
        cell: ({ row }) => (
          <span className="font-mono text-xs text-foreground">{row.original.keyName}</span>
        ),
      },
      {
        id: 'scope',
        header: 'Scope',
        meta: { priority: 'medium', mobileLabel: 'Scope' },
        cell: ({ row }) => (
          <span className="text-xs text-foreground-muted">{row.original.scope || '-'}</span>
        ),
      },
      {
        id: 'expires',
        header: 'Access expires',
        meta: { priority: 'medium', mobileLabel: 'Access expires' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-foreground-muted">
            {new Date(row.original.accessTokenExpiresAt).toLocaleString()}
          </span>
        ),
      },
      {
        id: 'issued',
        header: 'Issued',
        meta: { priority: 'low', mobileLabel: 'Issued' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-foreground-muted">
            {new Date(row.original.createdAt).toLocaleString()}
          </span>
        ),
      },
      {
        id: 'action',
        header: 'Action',
        meta: { priority: 'high', align: 'right' },
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="danger"
            onClick={() => onRevokeToken(row.original.id)}
            isLoading={revokingTokenId === row.original.id}
            leftIcon={<ShieldOff size={13} />}
          >
            Revoke
          </Button>
        ),
      },
    ],
    [onRevokeToken, revokingTokenId]
  );

  return (
    <Card
      title="MCP OAuth Clients"
      extra={
        <Button
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          isLoading={oauthClientsLoading}
          leftIcon={<RefreshCw size={14} />}
        >
          Refresh
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xs text-foreground-muted">
          Registered OAuth clients and their active tokens. Tokens show the bound Plexus API key
          name only; raw secrets are never displayed.
        </p>

        {oauthClientsLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton height={160} className="w-full" />
            <Skeleton height={160} className="w-full" />
          </div>
        ) : oauthClients.length === 0 ? (
          <EmptyState
            variant="dense"
            icon={<ShieldCheck />}
            title="No OAuth clients"
            description="No MCP OAuth clients registered yet."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {oauthClients.map((client) => (
              <article
                key={client.clientId}
                className={cn(
                  'rounded-lg border border-border bg-surface-sunken p-3',
                  client.status === 'disabled' && 'opacity-60'
                )}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                      <KeyRound size={15} className="text-accent" />
                      <span>{client.clientName || 'Unnamed client'}</span>
                      <Pill
                        size="sm"
                        tone={client.status === 'disabled' ? 'danger' : 'success'}
                        className="uppercase tracking-wider"
                      >
                        {client.status === 'disabled' ? 'Disabled' : 'Active'}
                      </Pill>
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-foreground-muted">
                      {client.clientId}
                    </div>
                    <div className="mt-2 text-xs text-foreground-subtle">
                      Created {new Date(client.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="min-w-0 lg:max-w-[45%]">
                    <div className="text-[10px] uppercase tracking-wider text-foreground-subtle">
                      Redirect URIs
                    </div>
                    <div className="mt-1 flex flex-col gap-1">
                      {client.redirectUris.map((uri) => (
                        <code
                          key={uri}
                          className="break-all rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-foreground-muted"
                        >
                          {uri}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-3 border-t border-border pt-3">
                  <DataTable<McpOAuthTokenRecord>
                    title={
                      <span className="text-[10px] uppercase tracking-wider text-foreground-subtle">
                        Active tokens
                      </span>
                    }
                    columns={tokenColumns}
                    data={client.tokens}
                    getRowKey={(token) => token.id}
                    emptyTitle="No active tokens"
                    emptyDescription="No active tokens for this client."
                    emptyIcon={<KeyRound />}
                    breakpoint="lg"
                    mobileActions={(token) => (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => onRevokeToken(token.id)}
                        isLoading={revokingTokenId === token.id}
                        leftIcon={<ShieldOff size={13} />}
                      >
                        Revoke
                      </Button>
                    )}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  {client.status === 'disabled' ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onToggleClientStatus(client)}
                      isLoading={updatingClientId === client.clientId}
                      leftIcon={<ShieldCheck size={13} />}
                    >
                      Enable
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => onToggleClientStatus(client)}
                      isLoading={updatingClientId === client.clientId}
                      leftIcon={<ShieldOff size={13} />}
                    >
                      Disable
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onRevokeAllTokens(client.clientId)}
                    isLoading={revokingAllClientId === client.clientId}
                    leftIcon={<KeyRound size={13} />}
                  >
                    Revoke all tokens
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onDeleteClient(client.clientId)}
                    isLoading={deletingClientId === client.clientId}
                    leftIcon={<Trash2 size={13} />}
                  >
                    Delete client
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { cn } from '../../lib/cn';
import type { McpServerKey } from '../../lib/api';
import { formatResetsIn } from '../../lib/format';

interface McpKeyManagementModalProps {
  serverName: string | null;
  authScheme: string | null | undefined;
  serverKeys: McpServerKey[];
  isLoadingKeys: boolean;
  newServerKey: string;
  onNewServerKeyChange: (value: string) => void;
  isSavingKey: boolean;
  onClose: () => void;
  onAddKey: () => void | Promise<void>;
  onDeleteKey: (keyId: number) => void | Promise<void>;
  onClearCooldown: (keyId: number) => void | Promise<void>;
}

export function McpKeyManagementModal({
  serverName,
  authScheme,
  serverKeys,
  isLoadingKeys,
  newServerKey,
  onNewServerKeyChange,
  isSavingKey,
  onClose,
  onAddKey,
  onDeleteKey,
  onClearCooldown,
}: McpKeyManagementModalProps) {
  return (
    <Modal
      isOpen={serverName !== null}
      onClose={onClose}
      title={serverName ? `Manage Keys: ${serverName}` : 'Manage Keys'}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-border bg-surface-elevated p-3 text-sm text-foreground-muted">
          <p>
            These keys are load-balanced (round robin) and rotated automatically when a rate limit
            or quota is exceeded. They are injected using the server&apos;s configured{' '}
            <strong>Auth Scheme</strong>:{' '}
            <span className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-foreground">
              {serverName && authScheme ? authScheme : 'None (keys will not be sent)'}
            </span>
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Input
              label="New Key"
              value={newServerKey}
              onChange={(e) => onNewServerKeyChange(e.target.value)}
              placeholder="Paste key value"
            />
          </div>
          <Button
            onClick={onAddKey}
            disabled={isSavingKey || !newServerKey.trim()}
            isLoading={isSavingKey}
            className="w-full sm:w-auto"
          >
            Add Key
          </Button>
        </div>

        {isLoadingKeys ? (
          <p className="text-sm text-foreground-muted">Loading keys...</p>
        ) : serverKeys.length === 0 ? (
          <p className="text-sm text-foreground-muted">No keys configured.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {serverKeys.map((key) => {
              const isExhausted =
                key.cooldown_until !== null && new Date(key.cooldown_until).getTime() > Date.now();
              return (
                <div
                  key={key.id}
                  className="flex flex-col gap-3 rounded-md border border-border bg-surface-elevated p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm text-foreground" title={key.key}>
                      {key.key}
                    </div>
                    <div
                      className={cn(
                        'mt-1 text-xs font-medium',
                        !key.is_active || isExhausted ? 'text-warning' : 'text-success'
                      )}
                    >
                      {!key.is_active
                        ? 'Inactive'
                        : isExhausted
                          ? `Exhausted, ${formatResetsIn(key.cooldown_until)}`
                          : 'Active'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isExhausted && (
                      <Button size="sm" variant="secondary" onClick={() => onClearCooldown(key.id)}>
                        Clear Cooldown
                      </Button>
                    )}
                    <Button size="sm" variant="danger" onClick={() => onDeleteKey(key.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

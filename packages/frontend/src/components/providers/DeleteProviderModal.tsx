import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { Provider } from '../../lib/api';

interface Props {
  provider: Provider | null;
  affectedAliases: Array<{ aliasId: string; targetsCount: number }>;
  deleteModalLoading: boolean;
  onClose: () => void;
  onDelete: (cascade: boolean) => Promise<void>;
}

export function DeleteProviderModal({
  provider,
  affectedAliases,
  deleteModalLoading,
  onClose,
  onDelete,
}: Props) {
  if (!provider) return null;

  return (
    <Modal
      isOpen={!!provider}
      onClose={onClose}
      title={`Delete Provider: ${provider.name || provider.id || ''}`}
      size="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ color: 'var(--foreground-muted)', fontSize: '0.875rem' }}>
          Choose how to delete this provider. The action cannot be undone.
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'min(var(--theme-radius-field), 0.5rem)',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--danger-text)' }}>
              Delete Provider (Cascade)
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--foreground-muted)' }}>
              Removes this provider AND deletes all model alias targets that reference it.
            </div>
            {affectedAliases.length > 0 ? (
              <div style={{ fontSize: '0.8125rem' }}>
                <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
                  This will affect {affectedAliases.length} model alias(es):
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: '1rem',
                    fontSize: '0.75rem',
                    color: 'var(--foreground-muted)',
                  }}
                >
                  {affectedAliases.map((a) => (
                    <li key={a.aliasId}>
                      {a.aliasId} ({a.targetsCount} target(s))
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--foreground-muted)',
                  fontStyle: 'italic',
                }}
              >
                No model aliases reference this provider.
              </div>
            )}
            <Button
              onClick={() => onDelete(true)}
              isLoading={deleteModalLoading}
              style={{ backgroundColor: 'var(--danger)', marginTop: 'auto' }}
            >
              Delete (Cascade)
            </Button>
          </div>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'min(var(--theme-radius-field), 0.5rem)',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--foreground)' }}>
              Delete (Retain Targets)
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--foreground-muted)' }}>
              Removes only the provider. Model alias targets that reference this provider will
              remain but may cause errors.
            </div>
            {affectedAliases.length > 0 && (
              <div
                style={{ fontSize: '0.75rem', color: 'var(--warning-text)', fontStyle: 'italic' }}
              >
                {affectedAliases.length} model alias(es) will have orphaned targets.
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => onDelete(false)}
              isLoading={deleteModalLoading}
              style={{ marginTop: 'auto' }}
            >
              Delete (Retain)
            </Button>
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

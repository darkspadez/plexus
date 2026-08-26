import { useState } from 'react';
import { PauseCircle, PlayCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import type {
  KeyPolicyPreview,
  KeySecurityEvent,
  PerKeyAnomalyPolicy,
} from '../../lib/api/keySecurity';
import type { KeyConfig } from '../../lib/api/keys';
import { KeyPolicyEditor } from './KeyPolicyEditor';
import { KeyStatusBadge } from './KeyStatusBadge';
import { ReasonModal } from './ReasonModal';
import { SecurityEventList } from './SecurityEventList';
import { keySecurityStatus } from './keySecurityUtils';

interface KeySecurityModalProps {
  readonly keyConfig: KeyConfig | null;
  readonly preview: KeyPolicyPreview | null;
  readonly events: readonly KeySecurityEvent[];
  readonly eventOffset: number;
  readonly pageSize: number;
  readonly eventsHaveMore: boolean;
  readonly isLoading: boolean;
  readonly isLoadingEvents: boolean;
  readonly isSavingPolicy: boolean;
  readonly isTransitioning: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onPage: (offset: number) => void;
  readonly onSavePolicy: (policy: PerKeyAnomalyPolicy) => void;
  readonly onTransition: (action: 'pause' | 'resume', reason: string) => Promise<boolean>;
}

export const KeySecurityModal = ({
  keyConfig,
  preview,
  events,
  eventOffset,
  pageSize,
  eventsHaveMore,
  isLoading,
  isLoadingEvents,
  isSavingPolicy,
  isTransitioning,
  error,
  onClose,
  onPage,
  onSavePolicy,
  onTransition,
}: KeySecurityModalProps) => {
  const [transitionAction, setTransitionAction] = useState<'pause' | 'resume' | null>(null);

  if (!keyConfig) return null;
  const status = keySecurityStatus(keyConfig, preview ?? undefined);
  const isUnavailable = status === 'disabled' || status === 'expired';
  const submitTransition = async (reason: string) => {
    if (!transitionAction) return;
    if (await onTransition(transitionAction, reason)) setTransitionAction(null);
  };

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        title={`Key security: ${keyConfig.key}`}
        size="lg"
        footer={
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          <section
            aria-labelledby="current-key-status"
            className="rounded-md border border-border-glass bg-bg-subtle p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 id="current-key-status" className="text-xs font-medium text-text-secondary">
                  Current status
                </h3>
                <div className="mt-1 flex items-center gap-2">
                  <KeyStatusBadge status={status} />
                  <code className="text-xs text-text-muted">sha256:{keyConfig.fingerprint}</code>
                </div>
              </div>
              <Button
                variant={keyConfig.pausedAt ? 'primary' : 'danger'}
                size="sm"
                disabled={isUnavailable || isLoading}
                leftIcon={keyConfig.pausedAt ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
                onClick={() => setTransitionAction(keyConfig.pausedAt ? 'resume' : 'pause')}
              >
                {keyConfig.pausedAt ? 'Resume key' : 'Pause key'}
              </Button>
            </div>
            {keyConfig.pausedAt && (
              <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-text-muted">Paused</dt>
                <dd className="text-text">{new Date(keyConfig.pausedAt).toLocaleString()}</dd>
                <dt className="text-text-muted">Source</dt>
                <dd className="text-text">{keyConfig.pauseSource ?? 'unknown'}</dd>
                <dt className="text-text-muted">Reason</dt>
                <dd className="break-words text-text">
                  {keyConfig.pauseReason ?? 'Not available'}
                </dd>
              </dl>
            )}
            {isUnavailable && (
              <p className="mt-2 text-xs text-text-muted">
                Expired or irreversibly disabled keys cannot be paused or resumed.
              </p>
            )}
          </section>

          {isLoading || !preview ? (
            <p className="text-xs text-text-muted">Loading key policy…</p>
          ) : (
            <KeyPolicyEditor
              preview={preview}
              isSaving={isSavingPolicy}
              error={error}
              onSave={onSavePolicy}
            />
          )}

          <SecurityEventList
            events={events}
            offset={eventOffset}
            pageSize={pageSize}
            hasMore={eventsHaveMore}
            isLoading={isLoadingEvents}
            onPage={onPage}
          />
        </div>
      </Modal>
      <ReasonModal
        keyName={keyConfig.key}
        action={transitionAction}
        isSubmitting={isTransitioning}
        error={error}
        onClose={() => setTransitionAction(null)}
        onConfirm={(reason) => void submitTransition(reason)}
      />
    </>
  );
};

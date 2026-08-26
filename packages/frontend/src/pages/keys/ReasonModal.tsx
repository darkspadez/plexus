import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

interface ReasonModalProps {
  readonly keyName: string;
  readonly action: 'pause' | 'resume' | null;
  readonly isSubmitting: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onConfirm: (reason: string) => void;
}

export const ReasonModal = ({
  keyName,
  action,
  isSubmitting,
  error,
  onClose,
  onConfirm,
}: ReasonModalProps) => {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  useEffect(() => {
    setReason('');
    setReasonError(null);
  }, [action]);

  if (!action) return null;
  const title = action === 'pause' ? 'Pause API key?' : 'Resume API key?';
  const confirm = () => {
    if (!reason.trim()) {
      setReasonError(`${action === 'pause' ? 'Pause' : 'Resume'} reason is required`);
      return;
    }
    setReasonError(null);
    onConfirm(reason.trim());
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={action === 'pause' ? 'danger' : 'primary'}
            onClick={confirm}
            isLoading={isSubmitting}
          >
            {action === 'pause' ? 'Pause key' : 'Resume key'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">
          {action === 'pause'
            ? `Requests using '${keyName}' will be rejected immediately.`
            : `Requests using '${keyName}' will be allowed again unless another restriction applies.`}
        </p>
        <div>
          <label
            htmlFor="key-transition-reason"
            className="text-xs font-medium text-text-secondary"
          >
            Reason
          </label>
          <textarea
            id="key-transition-reason"
            autoFocus
            rows={3}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(null);
            }}
            aria-invalid={reasonError !== null}
            aria-describedby={reasonError ? 'key-transition-reason-error' : undefined}
            className="mt-1 w-full resize-y rounded-md border border-border bg-bg-glass p-2 text-sm text-text outline-none focus:border-primary"
          />
          {reasonError && (
            <p id="key-transition-reason-error" role="alert" className="mt-1 text-xs text-danger">
              {reasonError}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};

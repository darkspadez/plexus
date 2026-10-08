import React from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: React.ReactNode;
  /** Bold heading above `message`. Defaults to the model-deletion wording. */
  question?: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  isLoading: boolean;
}

export function ConfirmDeleteModal({
  isOpen,
  onClose,
  title,
  message,
  question,
  confirmLabel = 'Delete',
  onConfirm,
  isLoading,
}: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} isLoading={isLoading} variant="danger">
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          alignItems: 'center',
          textAlign: 'center',
          padding: '1rem 0',
        }}
      >
        <div
          style={{
            width: '3rem',
            height: '3rem',
            borderRadius: '50%',
            backgroundColor: 'var(--danger-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Trash2 size="1.5rem" style={{ color: 'var(--danger-text)' }} />
        </div>
        <div>
          <p className="text-foreground" style={{ marginBottom: '0.5rem', fontWeight: 500 }}>
            {question ??
              (title === 'Delete Model Alias'
                ? 'Are you sure you want to delete this alias?'
                : 'Are you sure you want to delete all configured models?')}
          </p>
          <p className="text-foreground-muted" style={{ fontSize: '0.875rem' }}>
            {message}
          </p>
        </div>
      </div>
    </Modal>
  );
}

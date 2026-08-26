import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, Download, ShieldAlert } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { copyToClipboard, isClipboardAvailable } from '../../lib/clipboard';
import type { OneTimeSecret } from '../../lib/api/keys';

interface OneTimeSecretModalProps {
  readonly value: OneTimeSecret | null;
  readonly onClose: () => void;
}

type Acknowledgement = 'copied' | 'downloaded' | null;

const focusableSelector =
  'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const OneTimeSecretModal = ({ value, onClose }: OneTimeSecretModalProps) => {
  const [acknowledgement, setAcknowledgement] = useState<Acknowledgement>(null);
  const [guardMessage, setGuardMessage] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const acknowledgedRef = useRef(false);

  const acknowledge = (method: Exclude<Acknowledgement, null>) => {
    acknowledgedRef.current = true;
    setAcknowledgement(method);
    setGuardMessage(null);
  };

  const warnBeforeLoss = () => {
    setGuardMessage('Copy or download this secret before closing or navigating away.');
  };

  const handleClose = () => {
    if (!acknowledgedRef.current) {
      warnBeforeLoss();
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!value) return;
    acknowledgedRef.current = false;
    setAcknowledgement(null);
    setGuardMessage(null);
    const dialog = contentRef.current?.closest<HTMLElement>('[role="dialog"]');
    const frame = requestAnimationFrame(() => contentRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !acknowledgedRef.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        warnBeforeLoss();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        contentRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!acknowledgedRef.current && event.target === dialog) warnBeforeLoss();
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (acknowledgedRef.current || !dialog) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (target && !dialog.contains(target)) {
        event.preventDefault();
        event.stopPropagation();
        warnBeforeLoss();
      }
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (acknowledgedRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('click', handleDocumentClick, true);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('click', handleDocumentClick, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [value]);

  if (!value) return null;

  const copySecret = async () => {
    if (await copyToClipboard(value.secret)) acknowledge('copied');
    else setGuardMessage('Copy failed. Download the secret before closing this window.');
  };

  const downloadSecret = () => {
    const blob = new Blob([value.secret], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${value.name.replace(/[^a-z0-9_-]/gi, '_')}-api-key.txt`;
    link.click();
    URL.revokeObjectURL(url);
    acknowledge('downloaded');
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title="Store your API key now"
      size="md"
      footer={
        <Button onClick={handleClose} disabled={!acknowledgement}>
          I stored it — close
        </Button>
      }
    >
      <div ref={contentRef} tabIndex={-1} className="flex flex-col gap-4 outline-none">
        <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3">
          <ShieldAlert className="mt-0.5 shrink-0 text-warning" size={18} />
          <div>
            <p className="text-sm font-medium text-text">This secret is shown only once.</p>
            <p className="mt-1 text-xs text-text-secondary">
              Save it before leaving. Plexus cannot recover it later; rotation is the only recovery
              and invalidates the current secret immediately.
            </p>
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-text-secondary">Key name</div>
          <div className="mt-1 font-mono text-sm text-text">{value.name}</div>
        </div>
        <div>
          <label htmlFor="one-time-api-key" className="text-xs font-medium text-text-secondary">
            One-time secret
          </label>
          <textarea
            id="one-time-api-key"
            readOnly
            rows={2}
            value={value.secret}
            className="mt-1 w-full resize-none rounded-md border border-border-glass bg-bg-card p-3 font-mono text-xs text-text outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(245,158,11,0.18)]"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            onClick={() => void copySecret()}
            disabled={!isClipboardAvailable()}
            leftIcon={<Copy size={14} />}
          >
            Copy secret
          </Button>
          <Button variant="secondary" onClick={downloadSecret} leftIcon={<Download size={14} />}>
            Download secret
          </Button>
        </div>
        {acknowledgement && (
          <p role="status" className="flex items-center gap-2 text-xs text-success">
            <CheckCircle2 size={14} />
            Secret {acknowledgement}. You may now close this window.
          </p>
        )}
        {guardMessage && (
          <p role="alert" className="text-xs font-medium text-warning">
            {guardMessage}
          </p>
        )}
      </div>
    </Modal>
  );
};

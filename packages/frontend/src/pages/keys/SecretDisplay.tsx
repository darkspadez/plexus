import React from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui-v2/button';
import { Pill } from '../../components/chips/Pill';

interface SecretDisplayProps {
  secret: string;
  /** When true, copies the secret to the clipboard once on mount. */
  autoCopy?: boolean;
}

/**
 * One-time secret display surface — design-doc §12.8. The only place where a
 * primary action's result is communicated through a full-width surface and not
 * a toast. Renders a prominent "shown only once" warning, a mono code block,
 * and a copy-to-clipboard button.
 */
export const SecretDisplay: React.FC<SecretDisplayProps> = ({ secret, autoCopy }) => {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!autoCopy) return;
    void navigator.clipboard.writeText(secret).then(() => setCopied(true));
  }, [autoCopy, secret]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success('Secret copied');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-warning/40 bg-warning-subtle p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" strokeWidth={1.75} />
        <div className="space-y-0.5 text-sm">
          <div className="font-medium text-foreground">
            Copy this secret now — it will not be shown again.
          </div>
          <p className="text-xs text-foreground-muted">
            We do not store the secret in plaintext after this dialog closes. Lost secrets must be
            rotated.
          </p>
        </div>
        <Pill size="sm" tone="warning" className="shrink-0">
          one-time
        </Pill>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded-md border border-border bg-surface-sunken px-3 py-2 font-mono text-xs text-foreground">
          {secret}
        </code>
        <Button variant="outline" size="sm" onClick={handleCopy} aria-label="Copy secret">
          {copied ? (
            <Check className="text-success" strokeWidth={2} />
          ) : (
            <Copy strokeWidth={1.75} />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
};

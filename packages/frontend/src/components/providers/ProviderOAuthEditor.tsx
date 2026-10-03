import { useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { SectionCard } from '../ui/SectionCard';
import { Select } from '../ui/Select';
import { cn } from '../../lib/cn';
import type { Provider, OAuthSession } from '../../lib/api';
import type { OAuthCredentialStatus } from '../../types/settings';
import { formatResetsIn, formatTimeAgo } from '../../lib/format';

function describeAge(epochMs: number, nowMs: number): string {
  return formatTimeAgo(Math.max(0, Math.floor((nowMs - epochMs) / 1000)));
}

/**
 * "connected 1d ago · key refreshed 3m ago · expires in 23h 12m" — makes a
 * stale or soon-expiring login visible without opening the database.
 */
function describeCredentialAge(status: OAuthCredentialStatus, nowMs: number): string | null {
  const parts: string[] = [];
  if (status.connectedAt) parts.push(`connected ${describeAge(status.connectedAt, nowMs)}`);
  if (status.refreshedAt && status.refreshedAt !== status.connectedAt) {
    parts.push(`key refreshed ${describeAge(status.refreshedAt, nowMs)}`);
  }
  if (status.expiresAt) {
    parts.push(
      status.expiresAt <= nowMs
        ? 'key expired'
        : `expires ${formatResetsIn(new Date(status.expiresAt).toISOString())}`
    );
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function describeCredentialDates(status: OAuthCredentialStatus): string {
  const line = (label: string, epochMs?: number) =>
    epochMs ? `${label}: ${new Date(epochMs).toLocaleString()}` : null;
  return [
    line('Connected', status.connectedAt),
    line('Key refreshed', status.refreshedAt),
    line('Expires', status.expiresAt),
  ]
    .filter(Boolean)
    .join('\n');
}

interface Props {
  editingProvider: Provider;
  oauthSession: OAuthSession | null;
  oauthSessionId: string | null;
  oauthPromptValue: string;
  setOauthPromptValue: (v: string) => void;
  oauthManualCode: string;
  setOauthManualCode: (v: string) => void;
  oauthSelectValue: string;
  setOauthSelectValue: (v: string) => void;
  oauthError: string | null;
  oauthBusy: boolean;
  oauthCredentialReady: boolean;
  oauthCredentialChecking: boolean;
  /** Credential age for the status line; null until a ready credential is found. */
  oauthCredentialStatus?: OAuthCredentialStatus | null;
  oauthStatus: string | undefined;
  oauthIsTerminal: boolean;
  oauthStatusLabel: string;
  onStart: () => Promise<void>;
  onSubmitPrompt: () => Promise<void>;
  onSubmitManualCode: () => Promise<void>;
  onSubmitSelect: () => Promise<void>;
  onCancel: () => Promise<void>;
  onDeleteCredential: () => Promise<void>;
}

export function ProviderOAuthEditor({
  editingProvider: _editingProvider,
  oauthSession,
  oauthSessionId,
  oauthPromptValue,
  setOauthPromptValue,
  oauthManualCode,
  setOauthManualCode,
  oauthSelectValue,
  setOauthSelectValue,
  oauthError,
  oauthBusy,
  oauthCredentialReady,
  oauthCredentialChecking,
  oauthCredentialStatus,
  oauthStatus,
  oauthIsTerminal,
  oauthStatusLabel,
  onStart,
  onSubmitPrompt,
  onSubmitManualCode,
  onSubmitSelect,
  onCancel,
  onDeleteCredential,
}: Props) {
  const badgeStatus =
    oauthStatus === 'success' || (!oauthStatus && oauthCredentialReady)
      ? 'success'
      : oauthStatus === 'error' || oauthStatus === 'cancelled'
        ? 'danger'
        : 'neutral';

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const hasActiveSession = !!oauthSessionId && !oauthIsTerminal;
  const showDelete = oauthCredentialReady && !hasActiveSession;
  const credentialAge =
    oauthCredentialReady && !hasActiveSession && oauthCredentialStatus
      ? describeCredentialAge(oauthCredentialStatus, Date.now())
      : null;

  const handleDeleteClick = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    await onDeleteCredential();
  };

  return (
    <SectionCard
      size="sm"
      title="OAuth Configuration"
      extra={
        <Badge
          status={badgeStatus}
          className={cn('lowercase', oauthCredentialChecking && 'opacity-60')}
        >
          {oauthStatusLabel}
        </Badge>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-[11px] text-foreground-muted">
          Tokens are stored securely on the server after login.
        </div>

        {credentialAge && oauthCredentialStatus && (
          <div
            className="text-[11px] text-foreground-muted"
            title={describeCredentialDates(oauthCredentialStatus)}
          >
            {credentialAge}
          </div>
        )}

        {oauthError && <div className="text-[11px] text-danger">{oauthError}</div>}

        {oauthStatus === 'awaiting_select' && oauthSession?.select && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Select
                label={oauthSession.select.message}
                value={oauthSelectValue || oauthSession.select.options[0]?.id || ''}
                onChange={setOauthSelectValue}
                options={oauthSession.select.options.map((option) => ({
                  value: option.id,
                  label: option.label,
                }))}
              />
            </div>
            <Button
              size="sm"
              onClick={onSubmitSelect}
              disabled={oauthBusy}
              className="w-full sm:w-auto"
            >
              Continue
            </Button>
          </div>
        )}

        {oauthSession?.authInfo && (
          <div className="flex flex-col gap-1.5">
            <Input label="Authorization URL" value={oauthSession.authInfo.url} readOnly />
            {oauthSession.authInfo.instructions && (
              <div className="text-[11px] text-foreground-muted flex items-center gap-1">
                <Info size={12} />
                <span>{oauthSession.authInfo.instructions}</span>
              </div>
            )}
          </div>
        )}

        {oauthSession?.prompt && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Input
                label={oauthSession.prompt.message}
                placeholder={oauthSession.prompt.placeholder}
                value={oauthPromptValue}
                onChange={(e) => setOauthPromptValue(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              onClick={onSubmitPrompt}
              disabled={oauthBusy || (!oauthSession.prompt.allowEmpty && !oauthPromptValue)}
              className="w-full sm:w-auto"
            >
              Submit
            </Button>
          </div>
        )}

        {oauthStatus === 'awaiting_manual_code' && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Input
                label={oauthSession?.manualCode?.message ?? 'Paste redirect URL or code'}
                value={oauthManualCode}
                onChange={(e) => setOauthManualCode(e.target.value)}
                placeholder={oauthSession?.manualCode?.placeholder ?? 'https://...'}
              />
            </div>
            <Button
              size="sm"
              onClick={onSubmitManualCode}
              disabled={oauthBusy || !oauthManualCode}
              className="w-full sm:w-auto"
            >
              Submit
            </Button>
          </div>
        )}

        {oauthSession?.progress && oauthSession.progress.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="text-[11px] text-foreground-muted">Progress</div>
            <div className="text-[11px] text-foreground">
              {(oauthSession.progress ?? []).slice(-3).map((message, idx) => (
                <div key={`${message}-${idx}`}>{message}</div>
              ))}
            </div>
          </div>
        )}

        {oauthStatus === 'success' && (
          <div className="text-[11px] text-success">
            Authentication complete. Tokens stored securely on the server.
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={onStart}
            isLoading={oauthBusy && !oauthSessionId}
            disabled={oauthBusy || (!!oauthSessionId && !oauthIsTerminal)}
            className="w-full sm:w-auto"
          >
            {oauthSessionId && !oauthIsTerminal
              ? 'OAuth in progress'
              : oauthCredentialReady
                ? 'Restart OAuth'
                : 'Start OAuth'}
          </Button>
          {oauthSessionId && !oauthIsTerminal && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              disabled={oauthBusy}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
          )}
          {showDelete && (
            <Button
              size="sm"
              variant={confirmingDelete ? 'danger' : 'ghost'}
              onClick={handleDeleteClick}
              disabled={oauthBusy}
              onBlur={() => setConfirmingDelete(false)}
              className="w-full sm:w-auto"
            >
              {confirmingDelete ? 'Confirm remove' : 'Remove credentials'}
            </Button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

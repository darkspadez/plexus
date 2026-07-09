import { Info } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { SectionCard } from '../ui/SectionCard';
import { cn } from '../../lib/cn';
import type { Provider, OAuthSession } from '../../lib/api';

interface Props {
  editingProvider: Provider;
  oauthSession: OAuthSession | null;
  oauthSessionId: string | null;
  oauthPromptValue: string;
  setOauthPromptValue: (v: string) => void;
  oauthManualCode: string;
  setOauthManualCode: (v: string) => void;
  oauthError: string | null;
  oauthBusy: boolean;
  oauthCredentialReady: boolean;
  oauthCredentialChecking: boolean;
  oauthStatus: string | undefined;
  oauthIsTerminal: boolean;
  oauthStatusLabel: string;
  onStart: () => Promise<void>;
  onSubmitPrompt: () => Promise<void>;
  onSubmitManualCode: () => Promise<void>;
  onCancel: () => Promise<void>;
}

export function ProviderOAuthEditor({
  editingProvider: _editingProvider,
  oauthSession,
  oauthSessionId,
  oauthPromptValue,
  setOauthPromptValue,
  oauthManualCode,
  setOauthManualCode,
  oauthError,
  oauthBusy,
  oauthCredentialReady,
  oauthCredentialChecking,
  oauthStatus,
  oauthIsTerminal,
  oauthStatusLabel,
  onStart,
  onSubmitPrompt,
  onSubmitManualCode,
  onCancel,
}: Props) {
  const badgeStatus =
    oauthStatus === 'success' || (!oauthStatus && oauthCredentialReady)
      ? 'success'
      : oauthStatus === 'error' || oauthStatus === 'cancelled'
        ? 'danger'
        : 'neutral';

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
          Tokens are saved to auth.json after login.
        </div>

        {oauthError && <div className="text-[11px] text-danger">{oauthError}</div>}

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
                label="Paste redirect URL or code"
                value={oauthManualCode}
                onChange={(e) => setOauthManualCode(e.target.value)}
                placeholder="https://..."
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
            Authentication complete. Tokens saved to auth.json.
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
        </div>
      </div>
    </SectionCard>
  );
}

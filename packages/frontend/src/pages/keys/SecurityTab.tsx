import { useEffect, useState } from 'react';
import { Activity, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import type {
  AnomalyMode,
  AnomalyPolicySnapshot,
  GlobalAnomalyPolicy,
  KeySecurityEvent,
} from '../../lib/api/keySecurity';
import { PolicyFields } from './PolicyFields';
import { detectionSummary, validateThresholds, type PolicyErrors } from './keySecurityUtils';

interface SecurityTabProps {
  readonly snapshot: AnomalyPolicySnapshot | null;
  readonly evidence: readonly KeySecurityEvent[];
  readonly isLoadingEvidence: boolean;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onSave: (policy: GlobalAnomalyPolicy) => void;
}

const evidenceDetails = (event: KeySecurityEvent): string =>
  event.evidence
    ? Object.entries(event.evidence)
        .map(
          ([name, value]) => `${name}: ${typeof value === 'string' ? value : JSON.stringify(value)}`
        )
        .join(' · ')
    : 'No detector details recorded';

export const SecurityTab = ({
  snapshot,
  evidence,
  isLoadingEvidence,
  isSaving,
  error: apiError,
  onSave,
}: SecurityTabProps) => {
  const [draft, setDraft] = useState<GlobalAnomalyPolicy | null>(snapshot?.global ?? null);
  const [errors, setErrors] = useState<PolicyErrors>({});

  useEffect(() => {
    setDraft(snapshot?.global ?? null);
    setErrors({});
  }, [snapshot]);

  if (!draft) {
    return (
      <Card title="API key anomaly detection">
        <p className="text-sm text-text-muted">Loading security policy…</p>
        {apiError && <p className="mt-2 text-xs text-danger">{apiError}</p>}
      </Card>
    );
  }

  const { mode: _mode, ...thresholds } = draft;
  const save = () => {
    const nextErrors = validateThresholds(thresholds);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) onSave(draft);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card title="API key anomaly detection">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-md border border-border-glass bg-bg-subtle p-3">
            <ShieldCheck className="mt-0.5 shrink-0 text-primary" size={18} />
            <div className="text-xs text-text-secondary">
              <p className="font-medium text-text">Global detector behavior</p>
              <p className="mt-1">
                Observe records would-pause evidence without changing key state. Enforce may pause
                eligible keys; only an administrator can resume them.
              </p>
            </div>
          </div>
          <Select<AnomalyMode>
            label="Mode"
            value={draft.mode}
            onChange={(mode) => setDraft({ ...draft, mode })}
            disabled={isSaving}
            options={[
              { value: 'disabled', label: 'Disabled' },
              { value: 'observe', label: 'Observe only' },
              { value: 'enforce', label: 'Enforce automatic pauses' },
            ]}
          />
          <PolicyFields
            value={thresholds}
            onChange={(value) => setDraft({ ...value, mode: draft.mode })}
            errors={errors}
            disabled={isSaving}
          />
          <p className="rounded-md border border-border-glass bg-bg-subtle p-3 text-xs text-text-muted">
            {detectionSummary(thresholds)} Readiness requires at least{' '}
            {thresholds.minimumBaselineRequests} baseline requests across{' '}
            {thresholds.minimumActiveMinutes} active minutes. Until both history gates pass,
            enforcement remains in learning state.
          </p>
          {apiError && (
            <p role="alert" className="text-xs text-danger">
              {apiError}
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={save} isLoading={isSaving}>
              Save security policy
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Observe-mode evidence">
        <div className="flex items-start gap-3">
          <Activity className="mt-0.5 shrink-0 text-info" size={18} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-secondary">
              Would-pause events are recorded in observe mode without labeling or pausing the key.
            </p>
            {isLoadingEvidence ? (
              <p className="mt-3 text-xs text-text-muted">Loading evidence…</p>
            ) : evidence.length === 0 ? (
              <p className="mt-3 rounded-md border border-border-glass bg-bg-subtle p-3 text-xs text-text-muted">
                No would-pause events have been recorded.
              </p>
            ) : (
              <ol className="mt-3 flex flex-col gap-2">
                {evidence.slice(0, 10).map((event) => (
                  <li
                    key={event.id}
                    className="rounded-md border border-border-glass bg-bg-subtle p-3"
                  >
                    <div className="flex flex-wrap justify-between gap-2 text-xs">
                      <span className="font-medium text-text">{event.keyName}</span>
                      <time className="text-text-muted">
                        {new Date(event.createdAt).toLocaleString()}
                      </time>
                    </div>
                    <p className="mt-1 break-words text-[11px] text-text-muted">
                      {evidenceDetails(event)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import type {
  AnomalyThresholdPolicy,
  KeyPolicyPreview,
  PerKeyAnomalyPolicy,
} from '../../lib/api/keySecurity';
import { PolicyFields } from './PolicyFields';
import { detectionSummary, validateThresholds, type PolicyErrors } from './keySecurityUtils';

interface KeyPolicyEditorProps {
  readonly preview: KeyPolicyPreview;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onSave: (policy: PerKeyAnomalyPolicy) => void;
}

type KeyPolicyMode = PerKeyAnomalyPolicy['mode'];

const thresholdFromPreview = (preview: KeyPolicyPreview): AnomalyThresholdPolicy => {
  if (preview.configured.mode === 'override') return preview.configured.policy;
  const { mode: _mode, ...thresholds } = preview.effective;
  return thresholds;
};

export const KeyPolicyEditor = ({
  preview,
  isSaving,
  error: apiError,
  onSave,
}: KeyPolicyEditorProps) => {
  const [mode, setMode] = useState<KeyPolicyMode>(preview.configured.mode);
  const [reason, setReason] = useState(
    preview.configured.mode === 'inherit' ? '' : preview.configured.reason
  );
  const [thresholds, setThresholds] = useState<AnomalyThresholdPolicy>(() =>
    thresholdFromPreview(preview)
  );
  const [errors, setErrors] = useState<PolicyErrors>({});

  useEffect(() => {
    setMode(preview.configured.mode);
    setReason(preview.configured.mode === 'inherit' ? '' : preview.configured.reason);
    setThresholds(thresholdFromPreview(preview));
    setErrors({});
  }, [preview]);

  const save = () => {
    if (mode === 'inherit') {
      setErrors({});
      onSave({ mode: 'inherit' });
      return;
    }
    const nextErrors = mode === 'override' ? validateThresholds(thresholds) : {};
    if (!reason.trim()) nextErrors.reason = 'A reason is required';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSave(
      mode === 'disabled'
        ? { mode: 'disabled', reason: reason.trim() }
        : { mode: 'override', reason: reason.trim(), policy: thresholds }
    );
  };

  return (
    <section aria-labelledby="key-policy-heading" className="flex flex-col gap-3">
      <div>
        <h3 id="key-policy-heading" className="font-heading text-sm font-semibold text-text">
          Anomaly policy
        </h3>
        <p className="mt-1 text-xs text-text-muted">
          Effective mode: <span className="font-medium text-text">{preview.effective.mode}</span>
        </p>
      </div>
      <Select<KeyPolicyMode>
        label="Per-key policy"
        value={mode}
        onChange={(value) => {
          setMode(value);
          setErrors({});
        }}
        options={[
          { value: 'inherit', label: 'Inherit global policy' },
          { value: 'disabled', label: 'Disable anomaly detection for this key' },
          { value: 'override', label: 'Use complete threshold override' },
        ]}
      />
      {mode !== 'inherit' && (
        <div>
          <label htmlFor="key-policy-reason" className="text-xs font-medium text-text-secondary">
            Policy reason
          </label>
          <textarea
            id="key-policy-reason"
            rows={2}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setErrors({ ...errors, reason: undefined });
            }}
            aria-invalid={Boolean(errors.reason)}
            className="mt-1 w-full resize-y rounded-md border border-border bg-bg-glass p-2 text-sm text-text outline-none focus:border-primary"
          />
          {errors.reason && (
            <p role="alert" className="mt-1 text-xs text-danger">
              {errors.reason}
            </p>
          )}
        </div>
      )}
      {mode === 'override' && (
        <>
          <PolicyFields
            value={thresholds}
            onChange={setThresholds}
            errors={errors}
            disabled={isSaving}
          />
          <p className="text-xs text-text-muted">{detectionSummary(thresholds)}</p>
        </>
      )}
      <p className="rounded-md border border-border-glass bg-bg-subtle p-3 text-xs text-text-muted">
        Readiness requires at least {preview.effective.minimumBaselineRequests} baseline requests
        across {preview.effective.minimumActiveMinutes} active minutes. Plexus evaluates these
        history gates server-side before automatic enforcement.
      </p>
      {apiError && (
        <p role="alert" className="text-xs text-danger">
          {apiError}
        </p>
      )}
      <div className="flex justify-end">
        <Button onClick={save} isLoading={isSaving}>
          Save key policy
        </Button>
      </div>
    </section>
  );
};

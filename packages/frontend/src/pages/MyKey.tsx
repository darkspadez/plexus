import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { RotateCw, AlertTriangle, Users } from 'lucide-react';
import { api, type QuotaStatusEntry } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useSelfMe, useSelfQuota } from '../hooks/queries/useMyKey';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Switch } from '../components/ui/Switch';
import { CopyButton } from '../components/ui/CopyButton';
import { Pill } from '../components/chips/Pill';
import { QuotaProgressBar } from '../components/quota/QuotaProgressBar';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import { Skeleton } from '../components/ui/Skeleton';
import { statusForPercent, formatQuotaValue, sortMostConstrainedFirst } from '../lib/quota';

interface SelfInfo {
  role: 'admin' | 'limited';
  keyName?: string;
  allowedProviders?: string[];
  allowedModels?: string[];
  allowRawPassthrough?: boolean;
  quotaNames?: string[];
  quotaName?: string | null;
  comment?: string | null;
  traceEnabled?: boolean;
  traceEnabledGlobal?: boolean;
}

export const MyKey: React.FC = () => {
  const { isLimited, isAdmin, login } = useAuth();
  const toast = useToast();
  const selfMeQuery = useSelfMe();
  const selfQuotaQuery = useSelfQuota();
  // infoOverride lets mutations patch fields without a full refetch
  const [infoOverride, setInfoOverride] = useState<Partial<SelfInfo>>({});
  const baseInfo = (selfMeQuery.data as SelfInfo | null) ?? null;
  const info: SelfInfo | null = baseInfo ? { ...baseInfo, ...infoOverride } : null;
  const loading = selfMeQuery.isLoading;
  // Quota status degrades softly: a fetch failure surfaces as an inline
  // warning in the Quota card rather than a toast, since it's non-fatal to
  // the rest of the page (mirrors main's behavior).
  const quotas: QuotaStatusEntry[] | null = selfQuotaQuery.data?.quotas ?? null;
  const quotaError = selfQuotaQuery.isError;
  const [comment, setComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [togglingTrace, setTogglingTrace] = useState(false);
  const [showRotate, setShowRotate] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  useEffect(() => {
    if (selfMeQuery.isError) {
      toast.error('Load failed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfMeQuery.isError]);

  useEffect(() => {
    if (baseInfo?.comment !== undefined) {
      setComment(baseInfo.comment ?? '');
    }
  }, [baseInfo?.comment]);

  if (isAdmin && !isLimited) {
    return <Navigate to="/keys" replace />;
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <PageHeader title="My Key" subtitle="Loading your key details..." />
        <PageContainer width="standard">
          <div className="flex flex-col gap-4">
            <Skeleton height={140} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        </PageContainer>
      </div>
    );
  }

  if (!info || info.role !== 'limited') {
    return (
      <div className="flex flex-col min-h-full">
        <PageHeader title="My Key" />
        <PageContainer width="standard">
          <Card>
            <p className="text-danger">Unable to load key info.</p>
          </Card>
        </PageContainer>
      </div>
    );
  }

  const handleSaveComment = async () => {
    setSavingComment(true);
    try {
      await api.updateSelfComment(comment.trim() || null);
      setInfoOverride((prev) => ({ ...prev, comment: comment.trim() || null }));
      toast.success('Comment saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save comment');
    } finally {
      setSavingComment(false);
    }
  };

  const handleToggleTrace = async (enabled: boolean) => {
    setTogglingTrace(true);
    try {
      const res = await api.toggleSelfDebug(enabled);
      setInfoOverride((prev) => ({
        ...prev,
        traceEnabled: res.enabled,
        traceEnabledGlobal: res.enabledGlobal,
      }));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to toggle trace');
    } finally {
      setTogglingTrace(false);
    }
  };

  const handleRotate = async () => {
    setRotating(true);
    try {
      const res = await api.rotateSelfSecret();
      const ok = await login(res.secret);
      setNewSecret(res.secret);
      if (!ok) {
        toast.warning('Secret rotated, but session refresh failed. Re-login with the new secret.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Rotation failed');
    } finally {
      setRotating(false);
    }
  };

  const allowedProviders = info.allowedProviders ?? [];
  const allowedModels = info.allowedModels ?? [];

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="My Key"
        subtitle={
          <>
            Details for <span className="font-medium text-foreground">{info.keyName}</span>. All
            logs, traces, and dashboard data in this session are scoped to this key.
          </>
        }
      />
      <PageContainer width="standard">
        <div className="flex flex-col gap-6">
          <Card title="Identity">
            <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
              <dt className="text-foreground-subtle">Key name</dt>
              <dd className="font-mono text-foreground break-all">{info.keyName}</dd>
              <dt className="text-foreground-subtle">Quota</dt>
              <dd className="text-foreground">
                {info.quotaNames && info.quotaNames.length > 0
                  ? info.quotaNames.join(', ')
                  : info.quotaName || '—'}
              </dd>
              <dt className="text-foreground-subtle">Allowed providers</dt>
              <dd className="text-foreground break-words">
                {allowedProviders.length > 0 ? allowedProviders.join(', ') : 'Any (unrestricted)'}
              </dd>
              <dt className="text-foreground-subtle">Allowed models</dt>
              <dd className="text-foreground break-words">
                {allowedModels.length > 0 ? allowedModels.join(', ') : 'Any (unrestricted)'}
              </dd>
              <dt className="text-text-muted">Raw provider access</dt>
              <dd className="text-text">{info.allowRawPassthrough ? 'Enabled' : 'Disabled'}</dd>
            </dl>
          </Card>

          <Card title="Quota">
            {quotaError ? (
              <div className="flex items-start gap-2 text-sm text-warning">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span>Could not load quota status — try refreshing.</span>
              </div>
            ) : quotas === null ? (
              <p className="text-sm text-foreground-subtle">Loading…</p>
            ) : quotas.length === 0 ? (
              <p className="text-sm text-foreground-subtle">
                No quota is assigned to this key — requests are unrestricted by quota policy.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {sortMostConstrainedFirst(quotas).map((q) => {
                  const pct = q.limit > 0 ? Math.min(100, (q.currentUsage / q.limit) * 100) : 0;
                  return (
                    <div key={q.name} className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground">{q.name}</span>
                        {q.source === 'default' && (
                          <Pill tone="neutral" size="sm" className="uppercase tracking-wider">
                            default
                          </Pill>
                        )}
                        {q.shared && (
                          <Pill tone="accent" size="sm" className="uppercase tracking-wider">
                            <Users size={10} /> shared
                          </Pill>
                        )}
                      </div>
                      <QuotaProgressBar
                        label={q.limitType}
                        value={q.currentUsage}
                        max={q.limit}
                        displayValue={`${formatQuotaValue(q.currentUsage, q.limitType)} / ${formatQuotaValue(q.limit, q.limitType)}`}
                        status={statusForPercent(pct)}
                        size="md"
                      />
                      <div className="flex items-center justify-between text-xs text-foreground-subtle">
                        <span>
                          Remaining:{' '}
                          <span className="text-foreground font-medium">
                            {formatQuotaValue(q.remaining, q.limitType)}
                          </span>
                        </span>
                        <span>Resets {new Date(q.resetsAt).toLocaleString()}</span>
                      </div>
                      {!q.allowed && (
                        <div className="flex items-center gap-2 text-xs text-danger">
                          <AlertTriangle size={14} />
                          <span>
                            Quota exhausted — new requests will be rejected until it resets.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Comment">
            <div className="flex flex-col gap-3">
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Free-text note about this key (optional)"
              />
              <div className="flex justify-stretch sm:justify-end">
                <Button
                  onClick={handleSaveComment}
                  disabled={savingComment || (comment.trim() || null) === (info.comment ?? null)}
                  isLoading={savingComment}
                  className="w-full sm:w-auto"
                >
                  Save
                </Button>
              </div>
            </div>
          </Card>

          <Card title="Trace capture">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                  Capture full request/response payloads for this key only.
                </p>
                <p className="text-xs text-foreground-subtle mt-1">
                  {info.traceEnabledGlobal
                    ? 'Global tracing is ON (admin) — all requests are captured regardless of this toggle.'
                    : info.traceEnabled
                      ? 'Currently capturing traces for this key.'
                      : 'Tracing is off for this key.'}
                </p>
              </div>
              <Switch
                checked={!!info.traceEnabled}
                onChange={handleToggleTrace}
                disabled={togglingTrace || !!info.traceEnabledGlobal}
                aria-label="Toggle trace capture"
              />
            </div>
          </Card>

          <Card title="Rotate secret">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-foreground-muted">
                Generates a new secret for this key. The old secret stops working immediately. Your
                historical logs, traces, and errors are preserved (they're indexed by key name, not
                secret).
              </p>
              <div className="flex justify-stretch sm:justify-end">
                <Button
                  variant="danger"
                  onClick={() => setShowRotate(true)}
                  disabled={rotating}
                  leftIcon={<RotateCw size={16} />}
                  className="w-full sm:w-auto"
                >
                  Rotate secret
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <Modal
          isOpen={showRotate}
          onClose={() => {
            setShowRotate(false);
            setNewSecret(null);
          }}
          title={newSecret ? 'New secret generated' : 'Rotate secret?'}
          size="sm"
          footer={
            newSecret ? (
              <Button
                onClick={() => {
                  setShowRotate(false);
                  setNewSecret(null);
                }}
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setShowRotate(false)}
                  disabled={rotating}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleRotate}
                  disabled={rotating}
                  isLoading={rotating}
                >
                  Rotate now
                </Button>
              </>
            )
          }
        >
          {newSecret ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-foreground">
                Copy this secret now — it will not be shown again.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="flex-1 min-w-0 p-2 bg-surface-elevated border border-border rounded-md text-xs font-mono break-all">
                  {newSecret}
                </code>
                <CopyButton value={newSecret} variant="icon" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-foreground-muted">
              The old secret will stop working immediately. Any clients using it will receive 401
              errors until they are updated with the new secret.
            </p>
          )}
        </Modal>
      </PageContainer>
    </div>
  );
};

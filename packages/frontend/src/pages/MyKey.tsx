import React from 'react';
import { Navigate } from 'react-router-dom';
import { RotateCw, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { FormPage } from '../components/templates';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../components/ui-v2/card';
import { Button } from '../components/ui-v2/button';
import { Input } from '../components/ui-v2/input';
import { Skeleton } from '../components/ui-v2/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui-v2/dialog';
import { Switch } from '../components/ui-v2/switch';
import { Pill } from '../components/chips/Pill';

interface SelfInfo {
  role: 'admin' | 'limited';
  keyName?: string;
  allowedProviders?: string[];
  allowedModels?: string[];
  quotaName?: string | null;
  comment?: string | null;
  traceEnabled?: boolean;
  traceEnabledGlobal?: boolean;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-3 py-1.5">
    <dt className="text-xs uppercase tracking-wide text-foreground-subtle">{label}</dt>
    <dd className="break-words text-sm text-foreground">{children}</dd>
  </div>
);

export const MyKey: React.FC = () => {
  const { isLimited, isAdmin, login } = useAuth();
  const [info, setInfo] = React.useState<SelfInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [comment, setComment] = React.useState('');
  const [savingComment, setSavingComment] = React.useState(false);
  const [togglingTrace, setTogglingTrace] = React.useState(false);
  const [showRotate, setShowRotate] = React.useState(false);
  const [rotating, setRotating] = React.useState(false);
  const [newSecret, setNewSecret] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    api
      .getSelfMe()
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setComment(data.comment ?? '');
      })
      .catch((e) => toast.error(String(e)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isAdmin && !isLimited) {
    return <Navigate to="/keys" replace />;
  }

  if (loading) {
    return (
      <FormPage title="My Key" subtitle="Loading your key details…">
        <Skeleton className="h-32" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </FormPage>
    );
  }

  if (!info || info.role !== 'limited') {
    return (
      <FormPage title="My Key">
        <Card>
          <CardContent className="pt-6 text-sm text-danger">Unable to load key info.</CardContent>
        </Card>
      </FormPage>
    );
  }

  const handleSaveComment = async () => {
    setSavingComment(true);
    try {
      await api.updateSelfComment(comment.trim() || null);
      setInfo({ ...info, comment: comment.trim() || null });
      toast.success('Comment saved');
    } catch (e) {
      toast.error((e as Error)?.message || 'Failed to save comment');
    } finally {
      setSavingComment(false);
    }
  };

  const handleToggleTrace = async (enabled: boolean) => {
    setTogglingTrace(true);
    try {
      const res = await api.toggleSelfDebug(enabled);
      setInfo({
        ...info,
        traceEnabled: res.enabled,
        traceEnabledGlobal: res.enabledGlobal,
      });
    } catch (e) {
      toast.error((e as Error)?.message || 'Failed to toggle trace');
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
    } catch (e) {
      toast.error((e as Error)?.message || 'Rotation failed');
    } finally {
      setRotating(false);
    }
  };

  const allowedProviders = info.allowedProviders ?? [];
  const allowedModels = info.allowedModels ?? [];
  const commentChanged = (comment.trim() || null) !== (info.comment ?? null);

  return (
    <FormPage
      title="My Key"
      subtitle={
        <>
          Details for <span className="font-mono text-foreground">{info.keyName}</span>. All logs,
          traces, and dashboard data in this session are scoped to this key.
        </>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-1">
            <Row label="Key name">
              <span className="font-mono text-foreground">{info.keyName}</span>
            </Row>
            <Row label="Quota">{info.quotaName || '—'}</Row>
            <Row label="Allowed providers">
              {allowedProviders.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {allowedProviders.map((p) => (
                    <Pill key={p} size="sm" tone="neutral">
                      {p}
                    </Pill>
                  ))}
                </span>
              ) : (
                <span className="text-foreground-muted">Any (unrestricted)</span>
              )}
            </Row>
            <Row label="Allowed models">
              {allowedModels.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {allowedModels.map((m) => (
                    <Pill key={m} size="sm" tone="neutral">
                      {m}
                    </Pill>
                  ))}
                </span>
              ) : (
                <span className="text-foreground-muted">Any (unrestricted)</span>
              )}
            </Row>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comment</CardTitle>
          <CardDescription>Free-text note shown alongside this key in admin views.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Free-text note about this key (optional)"
          />
          <div className="flex justify-end">
            <Button onClick={handleSaveComment} disabled={savingComment || !commentChanged}>
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trace capture</CardTitle>
          <CardDescription>
            Capture full request/response payloads for this key only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-foreground-muted">
              {info.traceEnabledGlobal
                ? 'Global tracing is ON (admin) — all requests are captured regardless of this toggle.'
                : info.traceEnabled
                  ? 'Currently capturing traces for this key.'
                  : 'Tracing is off for this key.'}
            </p>
            <Switch
              checked={!!info.traceEnabled}
              onCheckedChange={handleToggleTrace}
              disabled={togglingTrace || !!info.traceEnabledGlobal}
              aria-label="Toggle trace capture"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rotate secret</CardTitle>
          <CardDescription>
            Generates a new secret for this key. The old secret stops working immediately.
            Historical logs, traces, and errors are preserved (indexed by key name, not secret).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end">
            <Button variant="destructive" onClick={() => setShowRotate(true)} disabled={rotating}>
              <RotateCw strokeWidth={1.75} />
              Rotate secret
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={showRotate}
        onOpenChange={(open) => {
          if (!open) {
            setShowRotate(false);
            setNewSecret(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newSecret ? 'New secret generated' : 'Rotate secret?'}</DialogTitle>
            <DialogDescription>
              {newSecret
                ? 'Copy this secret now — it will not be shown again.'
                : 'The old secret will stop working immediately. Any clients using it will receive 401 errors until updated.'}
            </DialogDescription>
          </DialogHeader>
          {newSecret && (
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 break-all rounded-md border border-border bg-surface-sunken p-2 text-xs">
                {newSecret}
              </code>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copy"
                onClick={() => {
                  navigator.clipboard.writeText(newSecret);
                  toast.success('Copied');
                }}
              >
                <Copy strokeWidth={1.75} />
              </Button>
            </div>
          )}
          <DialogFooter>
            {newSecret ? (
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
                <Button variant="outline" onClick={() => setShowRotate(false)} disabled={rotating}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleRotate} disabled={rotating}>
                  {rotating ? 'Rotating…' : 'Rotate now'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FormPage>
  );
};

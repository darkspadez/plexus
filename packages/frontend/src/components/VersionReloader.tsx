import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';
import {
  VERSION_POLL_INTERVAL_MS,
  getBundledVersion,
  hasBlockingForm,
  isVersionStale,
  parseHealthzVersion,
} from '../lib/versionCheck';

/**
 * Detects a redeployed backend by polling GET /healthz and comparing its
 * `version` against the build id baked into this bundle.
 *
 * - No open form (no dialog, no focused input): reloads immediately.
 * - Form actually open: shows a persistent banner with a Refresh button
 *   instead, so unsaved work is never nuked. Once the form closes, the
 *   next poll reloads automatically.
 */
export const VersionReloader: React.FC = () => {
  const bundledRef = useRef<string | null>(null);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  if (bundledRef.current === null) bundledRef.current = getBundledVersion();

  const check = useCallback(async () => {
    let body: unknown;
    try {
      const res = await fetch('/healthz', {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      body = await res.json();
    } catch {
      return; // Backend unreachable mid-deploy — try again next poll.
    }
    const server = parseHealthzVersion(body);
    if (!isVersionStale(bundledRef.current ?? '', server)) return;
    if (hasBlockingForm(document)) {
      setServerVersion(server);
    } else {
      window.location.reload();
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(check, VERSION_POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [check]);

  if (!serverVersion) return null;

  return createPortal(
    <div className="fixed bottom-4 left-1/2 z-[500] w-max max-w-[92vw] -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-lg border border-info/40 bg-bg-surface px-4 py-3 shadow-modal backdrop-blur-md">
        <RefreshCw size={16} className="flex-shrink-0 text-info" />
        <div className="font-body text-xs text-text-secondary">
          A new version (<span className="text-text">{serverVersion}</span>) is available.
        </div>
        <Button size="sm" onClick={() => window.location.reload()}>
          Refresh
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setServerVersion(null)}>
          Later
        </Button>
      </div>
    </div>,
    document.body
  );
};

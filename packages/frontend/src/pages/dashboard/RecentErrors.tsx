import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ProviderChip } from '../../components/chips/ProviderChip';
import { ModelChip } from '../../components/chips/ModelChip';
import { StatusPill } from '../../components/chips/StatusPill';
import { formatDuration } from '../../lib/format-design';
import type { UsageRecord } from '../../lib/api';

interface RecentErrorsProps {
  errors: Partial<UsageRecord>[];
  loading?: boolean;
}

const formatRelative = (ms: number): string => {
  const elapsed = Date.now() - ms;
  if (elapsed < 60_000) return 'just now';
  if (elapsed < 3_600_000) return `${Math.round(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.round(elapsed / 3_600_000)}h ago`;
  return `${Math.round(elapsed / 86_400_000)}d ago`;
};

export const RecentErrors: React.FC<RecentErrorsProps> = ({ errors, loading }) => {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-surface-elevated" />
        ))}
      </div>
    );
  }
  if (errors.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface px-4 py-8 text-center">
        <AlertTriangle className="size-5 text-success" strokeWidth={1.5} />
        <p className="text-sm font-medium text-foreground">No recent errors</p>
        <p className="text-xs text-foreground-muted">The last 24 hours are clean.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <ul className="divide-y divide-border">
        {errors.map((e) => {
          const ts = e.startTime ? formatRelative(e.startTime) : '—';
          const dur = e.durationMs ? formatDuration(e.durationMs) : null;
          const model = e.selectedModelName ?? e.incomingModelAlias ?? '—';
          return (
            <li key={e.requestId} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="w-16 shrink-0 text-[11px] tabular-nums text-foreground-subtle">
                {ts}
              </span>
              <ModelChip model={model} />
              {e.provider && <ProviderChip provider={e.provider} />}
              <StatusPill status="Error" />
              {e.finishReason && (
                <span className="truncate text-[11px] text-foreground-muted">{e.finishReason}</span>
              )}
              {dur && (
                <span className="ml-auto font-mono text-[11px] tabular-nums text-foreground-subtle">
                  {dur}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

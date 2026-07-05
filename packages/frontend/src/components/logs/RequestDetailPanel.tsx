import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudUpload, CloudDownload, BrainCog, PackageOpen, PencilLine } from 'lucide-react';
import type { UsageRecord } from '../../lib/api';
import { apiFormatsDiffer, getRoutePath } from './route';
import {
  KWH_PER_SLICE,
  formatCost,
  formatEnergy,
  formatMs,
  formatNumber,
  formatSlices,
  formatTPS,
} from '../../lib/format';
import { ApiFormatChip, DeltaChip, Pill } from '../chips';
import { Button } from '../ui/Button';
import { CopyButton } from '../ui/CopyButton';
import { cn } from '../../lib/cn';

/**
 * RequestDetailPanel — the inline "dossier" rendered under an expanded row of the
 * Requests table (DataTable's `renderExpanded`). Surfaces every tier-2 UsageRecord
 * field for a single request — several of which today are visible nowhere, or only
 * in a tooltip / the retry-history modal on pages/Logs.tsx — grouped into Request /
 * Tokens / Cost / Performance / Conversation, plus a full-width Attempts section
 * when retry history is present.
 */

// `formatLargeNumber` is the exact formatter pages/Logs.tsx uses for token counts —
// it lives in lib/api.ts as `export const formatLargeNumber = formatNumber;`, a
// page-facing re-export. Declared directly from the canonical lib/format.ts
// implementation here so this component's formatting imports stay scoped to
// lib/format.ts rather than reaching into lib/api.ts for a value export.
const formatLargeNumber = formatNumber;

/** Retry-attempt shape persisted as a JSON string on `UsageRecord.retryHistory`. */
interface RetryAttempt {
  index: number;
  provider: string;
  model: string;
  apiType?: string;
  status: 'success' | 'failed' | 'skipped';
  reason: string;
  statusCode?: number;
  retryable?: boolean;
}

/** Defensive parse — malformed/absent history is treated as no history at all. */
function parseRetryHistory(value: string | null | undefined): RetryAttempt[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is RetryAttempt => {
      return (
        entry &&
        typeof entry.index === 'number' &&
        typeof entry.provider === 'string' &&
        typeof entry.model === 'string' &&
        typeof entry.status === 'string' &&
        typeof entry.reason === 'string'
      );
    });
  } catch {
    return [];
  }
}

/** Section header idiom — matches the Models.tsx expanded-row group label. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground-subtle">
      {children}
    </div>
  );
}

/** One label/value row of a group's <dl>; value is right-aligned per the layout spec. */
function Field({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      <dt className={cn('text-xs text-foreground-muted', className)}>{label}</dt>
      <dd
        className={cn(
          'flex items-center justify-end gap-1.5 text-right text-xs text-foreground',
          className
        )}
      >
        {children}
      </dd>
    </>
  );
}

/** Full ISO timestamp, guarding invalid dates the same way pages/Logs.tsx does. */
function formatFullTimestamp(date: string): string {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    return d.toISOString();
  } catch {
    return '-';
  }
}

/** Incoming → outgoing API format chip pair; collapses to a single chip when the
 * two sides resolve to the same branded format or only one side is known. */
function ApiRoute({ incoming, outgoing }: { incoming?: string; outgoing?: string }) {
  if (incoming && outgoing && apiFormatsDiffer(incoming, outgoing)) {
    return (
      <span className="inline-flex items-center gap-1">
        <ApiFormatChip format={incoming} />
        <span aria-hidden className="text-foreground-subtle">
          →
        </span>
        <ApiFormatChip format={outgoing} />
      </span>
    );
  }
  const single = incoming || outgoing;
  return single ? <ApiFormatChip format={single} /> : <span>-</span>;
}

/**
 * Memoized: `log` is the only prop, and its identity is stable across
 * Logs.tsx's 10Hz liveTick re-renders — SSE events are what recreate a
 * record, not the tick itself. Without this, every open dossier re-rendered
 * (and, before the flexRender fix, remounted its subtree) on every tick.
 */
export const RequestDetailPanel = React.memo(function RequestDetailPanel({
  log,
}: {
  log: UsageRecord;
}): React.ReactElement {
  const navigate = useNavigate();
  const attempts = parseRetryHistory(log.retryHistory);

  const routePath = getRoutePath(log);

  const modeWords = [
    log.isStreamed ? 'Streamed' : 'Buffered',
    routePath === 'native' ? 'Native' : routePath === 'passthrough' ? 'Passthrough' : 'Translated',
  ].join(' · ');

  const e2eOutputTokens = Number(log.tokensOutput || 0) + Number(log.tokensReasoning || 0);
  const e2eTps =
    log.durationMs != null && log.durationMs > 0 && e2eOutputTokens > 0
      ? e2eOutputTokens / (log.durationMs / 1000)
      : null;

  return (
    <div className="bg-surface-elevated/30 px-6 py-4" data-request-panel={log.requestId}>
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
        {/* REQUEST */}
        <div className="flex flex-col gap-2">
          <GroupLabel>Request</GroupLabel>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
            <Field label="Request ID">
              <span className="break-all font-mono">{log.requestId}</span>
              <CopyButton value={log.requestId} label="Copy request ID" size="sm" />
            </Field>
            <Field label="Source IP">{log.sourceIp || '-'}</Field>
            <Field label="Timestamp">
              <span className="font-mono">{formatFullTimestamp(log.date)}</span>
            </Field>
            <Field label="Route">
              <ApiRoute incoming={log.incomingApiType} outgoing={log.outgoingApiType} />
            </Field>
            <Field label="Mode">{modeWords}</Field>
            {log.visionFallthroughModel && (
              <Field label="Vision fallthrough">
                <span className="break-all font-mono">{log.visionFallthroughModel}</span>
                <CopyButton
                  value={log.visionFallthroughModel}
                  label="Copy fallthrough model"
                  size="sm"
                />
              </Field>
            )}
          </dl>
          {log.isDescriptorRequest && (
            <div className="flex justify-end">
              <Pill tone="info" size="sm">
                Descriptor request
              </Pill>
            </div>
          )}
          {(log.hasError || log.hasDebug) && (
            <div className="mt-1 flex flex-wrap justify-end gap-2">
              {log.hasError && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => navigate('/errors', { state: { requestId: log.requestId } })}
                >
                  View error
                </Button>
              )}
              {log.hasDebug && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate('/debug', { state: { requestId: log.requestId } })}
                >
                  View trace
                </Button>
              )}
            </div>
          )}
        </div>

        {/* TOKENS */}
        <div className="flex flex-col gap-2">
          <GroupLabel>Tokens</GroupLabel>
          {/* Intentional fixed per-token-type visual encoding — raw Tailwind palette
              colors (not semantic tokens) are correct here. Each token category keeps
              a stable identity color for quick visual scanning, matching the Tokens
              column on pages/Logs.tsx. Do not migrate to theme tokens. */}
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
            <Field
              label={
                <span className="inline-flex items-center gap-1.5">
                  <CloudUpload size={12} className="text-blue-400" aria-hidden />
                  Input
                </span>
              }
            >
              <span className="font-mono tabular-nums">
                {(log.tokensInput || 0) === 0 ? '-' : formatLargeNumber(log.tokensInput || 0)}
              </span>
            </Field>
            <Field
              label={
                <span className="inline-flex items-center gap-1.5">
                  <CloudDownload size={12} className="text-green-400" aria-hidden />
                  Output
                </span>
              }
            >
              <span className="font-mono tabular-nums">
                {(log.tokensOutput || 0) === 0 ? '-' : formatLargeNumber(log.tokensOutput || 0)}
              </span>
            </Field>
            <Field
              label={
                <span className="inline-flex items-center gap-1.5">
                  <BrainCog size={12} className="text-purple-400" aria-hidden />
                  Reasoning
                </span>
              }
            >
              <span className="font-mono tabular-nums">
                {(log.tokensReasoning || 0) === 0
                  ? '-'
                  : formatLargeNumber(log.tokensReasoning || 0)}
              </span>
            </Field>
            <Field
              label={
                <span className="inline-flex items-center gap-1.5">
                  <PackageOpen size={12} className="text-orange-400" aria-hidden />
                  Cached
                </span>
              }
            >
              <span className="font-mono tabular-nums">
                {(log.tokensCached || 0) === 0 ? '-' : formatLargeNumber(log.tokensCached || 0)}
              </span>
            </Field>
            <Field
              label={
                <span className="inline-flex items-center gap-1.5">
                  <PencilLine size={12} className="text-fuchsia-400" aria-hidden />
                  Cache write
                </span>
              }
            >
              <span className="font-mono tabular-nums">
                {(log.tokensCacheWrite || 0) === 0
                  ? '-'
                  : formatLargeNumber(log.tokensCacheWrite || 0)}
              </span>
            </Field>
          </dl>
          {log.tokensEstimated ? (
            <div className="text-right text-[10px] text-foreground-subtle">* estimated</div>
          ) : null}
        </div>

        {/* COST */}
        <div className="flex flex-col gap-2">
          <GroupLabel>Cost</GroupLabel>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
            <Field label="Input">
              <span className="font-mono tabular-nums">
                {log.costInput != null ? formatCost(log.costInput, 4) : '-'}
              </span>
            </Field>
            <Field label="Output">
              <span className="font-mono tabular-nums">
                {log.costOutput != null ? formatCost(log.costOutput, 4) : '-'}
              </span>
            </Field>
            <Field label="Cached">
              <span className="font-mono tabular-nums">
                {log.costCached != null ? formatCost(log.costCached, 4) : '-'}
              </span>
            </Field>
            <Field label="Cache write">
              <span className="font-mono tabular-nums">
                {log.costCacheWrite != null ? formatCost(log.costCacheWrite, 4) : '-'}
              </span>
            </Field>
            <Field label="Total" className="border-t border-border/60 pt-2">
              <span className="font-mono tabular-nums font-medium text-foreground">
                {log.costTotal != null ? formatCost(log.costTotal, 6) : '-'}
              </span>
            </Field>
            <Field label="Source">
              {log.costSource ? (
                <Pill tone="neutral" size="sm">
                  {log.costSource}
                </Pill>
              ) : (
                '-'
              )}
            </Field>
            {log.providerReportedCost != null && (
              <Field label="Provider">
                <span className="font-mono tabular-nums">
                  {formatCost(log.providerReportedCost, 6)}
                </span>
                <DeltaChip
                  value={log.providerReportedCost - (log.costTotal ?? 0)}
                  inverse
                  format={(n) => formatCost(n, 6)}
                />
              </Field>
            )}
            {log.kwhUsed != null && log.kwhUsed > 0 && (
              <Field label="Energy">
                <span className="font-mono tabular-nums">{formatEnergy(log.kwhUsed)}</span>
                <span className="text-foreground-subtle">
                  ({formatSlices(log.kwhUsed / KWH_PER_SLICE)} toast slices)
                </span>
              </Field>
            )}
          </dl>
        </div>

        {/* PERFORMANCE */}
        <div className="flex flex-col gap-2">
          <GroupLabel>Performance</GroupLabel>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
            <Field label="Duration">
              <span className="font-mono tabular-nums">
                {log.durationMs != null && log.durationMs > 0 ? formatMs(log.durationMs) : '-'}
              </span>
            </Field>
            <Field label="TTFT">
              <span className="font-mono tabular-nums">
                {log.ttftMs && log.ttftMs > 0 ? formatMs(log.ttftMs) : '-'}
              </span>
            </Field>
            <Field label="TPS">
              <span className="font-mono tabular-nums">
                {log.tokensPerSec && log.tokensPerSec > 0 ? formatTPS(log.tokensPerSec) : '-'}
              </span>
            </Field>
            <Field label="E2E">
              <span className="font-mono tabular-nums">
                {e2eTps != null ? formatTPS(e2eTps) : '-'}
              </span>
            </Field>
          </dl>
        </div>

        {/* CONVERSATION */}
        <div className="flex flex-col gap-2">
          <GroupLabel>Conversation</GroupLabel>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
            <Field label="Messages">
              <span className="font-mono tabular-nums">
                {(log.messageCount || 0) === 0 ? '-' : log.messageCount}
              </span>
            </Field>
            <Field label="Tools defined">
              <span className="font-mono tabular-nums">
                {(log.toolsDefined || 0) === 0 ? '-' : log.toolsDefined}
              </span>
            </Field>
            <Field label="Tool calls">
              <span className="font-mono tabular-nums">
                {(log.toolCallsCount || 0) === 0 ? '-' : log.toolCallsCount}
              </span>
            </Field>
            <Field label="Parallel tools">
              {log.parallelToolCallsEnabled === undefined
                ? '-'
                : log.parallelToolCallsEnabled
                  ? 'yes'
                  : 'no'}
            </Field>
            <Field label="Finish reason">{log.finishReason || '-'}</Field>
          </dl>
        </div>

        {/* ATTEMPTS — only when retryHistory parses to a non-empty array. */}
        {attempts.length > 0 && (
          <div data-attempts className="col-span-full flex flex-col gap-2">
            <GroupLabel>Attempts</GroupLabel>
            <div className="flex flex-col gap-2">
              {attempts.map((attempt) => (
                <div
                  key={`${attempt.index}-${attempt.provider}-${attempt.model}`}
                  className="flex flex-col gap-1 rounded-md border border-border px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono tabular-nums text-foreground-muted">
                      #{attempt.index}
                    </span>
                    <span className="font-mono text-foreground">
                      {attempt.provider}:{attempt.model}
                    </span>
                    {attempt.apiType && (
                      <span className="font-mono text-foreground-muted">{attempt.apiType}</span>
                    )}
                    <Pill
                      size="sm"
                      tone={
                        attempt.status === 'success'
                          ? 'success'
                          : attempt.status === 'failed'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {attempt.status}
                    </Pill>
                    {attempt.statusCode != null && (
                      <span className="font-mono tabular-nums text-foreground-muted">
                        {attempt.statusCode}
                      </span>
                    )}
                    {attempt.retryable !== undefined && (
                      <span className="text-[11px] text-foreground-subtle">
                        {attempt.retryable ? 'retryable' : 'not retryable'}
                      </span>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-xs text-foreground-muted">
                    {attempt.reason}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

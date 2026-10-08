import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudUpload, CloudDownload, BrainCog, PackageOpen, PencilLine } from 'lucide-react';
import { useCurrency } from '../../lib/CurrencyContext';
import type { UsageRecord } from '../../lib/api';
import { apiFormatsDiffer, getRoutePath } from './route';
import { formatDateSafely, hasUpstreamRewrite } from './helpers';
import {
  KWH_PER_SLICE,
  formatCostIn,
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
  upstreamModel?: string;
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
    <div className="text-label font-semibold uppercase tracking-wider text-foreground-subtle">
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
          'flex min-w-0 items-center justify-end gap-1.5 text-right text-xs text-foreground',
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
      <span className="inline-flex min-w-0 flex-wrap items-center justify-end gap-1">
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
  const { currency, rate, symbol } = useCurrency();
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

  const timestamp = formatDateSafely(log.date);

  return (
    <div className="bg-surface-elevated/30 px-6 py-4" data-request-panel={log.requestId}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-5 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
        {/* REQUEST */}
        <div className="flex min-w-0 flex-col gap-2">
          <GroupLabel>Request</GroupLabel>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
            <Field label="Request ID">
              <span className="min-w-0 truncate font-mono" title={log.requestId}>
                {log.requestId}
              </span>
              <CopyButton
                value={log.requestId}
                label="Copy request ID"
                size="sm"
                className="shrink-0"
              />
            </Field>
            <Field label="Source IP">
              <span className="min-w-0 truncate" title={log.sourceIp || undefined}>
                {log.sourceIp || '-'}
              </span>
            </Field>
            <Field label="Timestamp">
              <span
                className="min-w-0 truncate whitespace-nowrap font-mono"
                title={formatFullTimestamp(log.date)}
              >
                {timestamp.date} {timestamp.time}
              </span>
            </Field>
            <Field label="Route">
              <ApiRoute incoming={log.incomingApiType} outgoing={log.outgoingApiType} />
            </Field>
            {hasUpstreamRewrite(log) && (
              <Field label="Upstream model">
                <span className="break-all font-mono" title="route → upstream; quota uses route">
                  {log.upstreamModel}
                </span>
              </Field>
            )}
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
                  variant="outline"
                  onClick={() => navigate('/debug', { state: { requestId: log.requestId } })}
                >
                  View trace
                </Button>
              )}
            </div>
          )}
        </div>

        {/* TOKENS */}
        <div className="flex min-w-0 flex-col gap-2">
          <GroupLabel>Tokens</GroupLabel>
          {/* Per-token-type visual encoding via role tokens (info = input, success =
              output, secondary = reasoning, critical = cached, accent = cache write). */}
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
            <Field
              label={
                <span className="inline-flex items-center gap-1.5">
                  <CloudUpload size="0.75rem" className="text-info-text" aria-hidden />
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
                  <CloudDownload size="0.75rem" className="text-success-text" aria-hidden />
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
                  <BrainCog size="0.75rem" className="text-secondary-text" aria-hidden />
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
                  <PackageOpen size="0.75rem" className="text-critical-text" aria-hidden />
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
                  <PencilLine size="0.75rem" className="text-accent-text" aria-hidden />
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
            <div className="text-right text-2xs text-foreground-subtle">* estimated</div>
          ) : null}
        </div>

        {/* COST */}
        <div className="flex min-w-0 flex-col gap-2">
          <GroupLabel>Cost</GroupLabel>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
            <Field label="Input">
              <span className="font-mono tabular-nums">
                {log.costInput != null
                  ? formatCostIn(log.costInput, { currency, rate, symbol, decimals: 4 })
                  : '-'}
              </span>
            </Field>
            <Field label="Output">
              <span className="font-mono tabular-nums">
                {log.costOutput != null
                  ? formatCostIn(log.costOutput, { currency, rate, symbol, decimals: 4 })
                  : '-'}
              </span>
            </Field>
            <Field label="Cached">
              <span className="font-mono tabular-nums">
                {log.costCached != null
                  ? formatCostIn(log.costCached, { currency, rate, symbol, decimals: 4 })
                  : '-'}
              </span>
            </Field>
            <Field label="Cache write">
              <span className="font-mono tabular-nums">
                {log.costCacheWrite != null
                  ? formatCostIn(log.costCacheWrite, { currency, rate, symbol, decimals: 4 })
                  : '-'}
              </span>
            </Field>
            <Field label="Total" className="border-t border-border/60 pt-2">
              <span className="font-mono tabular-nums font-medium text-foreground">
                {log.costTotal != null
                  ? formatCostIn(log.costTotal, { currency, rate, symbol, decimals: 6 })
                  : '-'}
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
                  {formatCostIn(log.providerReportedCost, { currency, rate, symbol, decimals: 6 })}
                </span>
                <DeltaChip
                  value={log.providerReportedCost - (log.costTotal ?? 0)}
                  inverse
                  format={(n) => formatCostIn(n, { currency, rate, symbol, decimals: 6 })}
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
        <div className="flex min-w-0 flex-col gap-2">
          <GroupLabel>Performance</GroupLabel>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
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
        <div className="flex min-w-0 flex-col gap-2">
          <GroupLabel>Conversation</GroupLabel>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
            <Field label="Messages">
              <span className="font-mono tabular-nums">
                {log.messageCount == null ? '-' : log.messageCount}
              </span>
            </Field>
            <Field label="Tools defined">
              <span className="font-mono tabular-nums">
                {/* 0 is a distinct, meaningful state (no tools sent) — only an
                    unrecorded value renders as a dash. */}
                {log.toolsDefined == null ? '-' : log.toolsDefined}
              </span>
            </Field>
            <Field label="Tool calls">
              <span className="font-mono tabular-nums">
                {log.toolCallsCount == null ? '-' : log.toolCallsCount}
              </span>
            </Field>
            <Field label="Parallel tools">
              {log.parallelToolCallsEnabled === undefined
                ? '-'
                : log.parallelToolCallsEnabled
                  ? 'yes'
                  : 'no'}
            </Field>
            <Field label="Finish reason">
              <span className="min-w-0 truncate" title={log.finishReason || undefined}>
                {log.finishReason || '-'}
              </span>
            </Field>
          </dl>
        </div>

        {/* ATTEMPTS — only when retryHistory parses to a non-empty array. */}
        {attempts.length > 0 && (
          <div data-attempts className="col-span-full flex flex-col gap-2">
            <GroupLabel>Attempts</GroupLabel>
            <div className="flex min-w-0 flex-col gap-2">
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
                      {attempt.upstreamModel && attempt.upstreamModel !== attempt.model
                        ? ` → ${attempt.upstreamModel}`
                        : null}
                    </span>
                    {attempt.apiType && <ApiFormatChip format={attempt.apiType} />}
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
                      <span className="text-label text-foreground-subtle">
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

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { SearchInput } from '../components/ui/SearchInput';
import { Select } from '../components/ui/Select';
import { CostToolTip } from '../components/ui/CostToolTip';
import { DataTable } from '../components/ui/DataTable';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import { RequestDetailPanel } from '../components/logs/RequestDetailPanel';
import { apiFormatsDiffer, getRoutePath } from '../components/logs/route';
import { ApiFormatChip, Pill } from '../components/chips';
import type { PillTone } from '../components/chips';
import { SECTION_NAMES } from '../lib/nav';
import type { ColumnDef } from '@tanstack/react-table';
import {
  api,
  UsageRecord,
  formatLargeNumber,
  type UsageSortDirection,
  type UsageSortField,
} from '../lib/api';
import {
  formatBytes,
  formatCost,
  formatMs,
  formatTPS,
  getEstimatedBytesPerToken,
} from '../lib/format';
import { isClipboardAvailable, copyToClipboard } from '../lib/clipboard';
import { DateTimePicker } from '../components/ui/DateTimePicker';
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  Bug,
  Zap,
  Languages,
  MoveHorizontal,
  Copy,
  ChevronDown,
  FileText,
  Eye,
  ScanSearch,
  PlayCircle,
  Circle,
  Wifi,
  WifiOff,
  Loader,
  Pi,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const SSE_HEARTBEAT_TIMEOUT_MS = 30_000;

/**
 * Collapsed-row status rendering per request `responseStatus` — a local Pill
 * tone + label pair. Deliberately independent of the design system's `Status`
 * health vocabulary (a closed union with no room for request-level outcomes);
 * any status not listed here renders the failed fallback.
 */
const RESPONSE_STATUS_PILLS: Record<string, { tone: PillTone; label: string }> = {
  success: { tone: 'success', label: 'ok' },
  pending: { tone: 'warning', label: 'pending' },
  cancelled: { tone: 'neutral', label: 'cancelled' },
  timeout: { tone: 'warning', label: 'timeout' },
};
const RESPONSE_STATUS_PILL_FALLBACK: { tone: PillTone; label: string } = {
  tone: 'danger',
  label: 'failed',
};

const getOffsetFromSearchParams = (searchParams: URLSearchParams) => {
  const offsetParam = searchParams.get('offset');
  if (!offsetParam) return 0;

  const parsedOffset = Number(offsetParam);
  if (!Number.isFinite(parsedOffset) || parsedOffset < 0) return 0;

  return Math.floor(parsedOffset);
};

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  offset: number;
  limit: number;
  total: number;
  onOffsetChange: (offset: number) => void;
}

const PaginationControls = ({
  currentPage,
  totalPages,
  offset,
  limit,
  total,
  onOffsetChange,
}: PaginationControlsProps) => (
  <div className="flex items-center justify-between gap-2 sm:justify-end sm:gap-3">
    <span className="text-xs text-foreground-muted font-mono">
      Page {currentPage} of {Math.max(1, totalPages)}
    </span>
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="icon"
        disabled={offset === 0}
        onClick={() => onOffsetChange(Math.max(0, offset - limit))}
      >
        <ChevronLeft size={16} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={offset + limit >= total}
        onClick={() => onOffsetChange(offset + limit)}
      >
        <ChevronRight size={16} />
      </Button>
    </div>
  </div>
);

export const Logs = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { adminKey, isAdmin, isLimited, principal } = useAuth();
  const [logs, setLogs] = useState<UsageRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(() => getOffsetFromSearchParams(searchParams));
  const [newestLogId, setNewestLogId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<UsageSortField>('date');
  const [sortDir, setSortDir] = useState<UsageSortDirection>('desc');
  const [filters, setFilters] = useState({
    apiKey: '',
    incomingModelAlias: '',
    provider: '',
    startDate: '',
    endDate: '',
  });

  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'all' | 'older'>('older');
  const [olderThanDays, setOlderThanDays] = useState(7);
  const [isDeleting, setIsDeleting] = useState(false);

  // Single Delete State
  const [selectedLogIdForDelete, setSelectedLogIdForDelete] = useState<string | null>(null);
  const [isSingleDeleteModalOpen, setIsSingleDeleteModalOpen] = useState(false);

  // Row-expansion state for the Requests-table dossier (RequestDetailPanel).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtersRef = useRef(filters);
  // sseConnected tracks whether the live-update SSE stream is currently active.
  // Used to stop the liveTick timer when the stream drops so duration counters freeze.
  const sseConnected = useRef(false);
  // sseStatus drives the visible connection indicator in the UI.
  const [sseStatus, setSseStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>(
    'disconnected'
  );

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  interface ProgressUpdate {
    requestId: string;
    bytesReceived: number;
    bytesPerSec: number | null;
    state: 'DISPATCHED' | 'GRACE_PERIOD' | 'MONITORING' | 'THROUGHPUT_STALLED';
    elapsedMs: number;
  }

  const progressMapRef = useRef<Map<string, ProgressUpdate>>(new Map());
  // Tracks requestIds already present in the log list — used to detect genuinely new
  // records outside the setLogs updater so StrictMode double-invocation doesn't
  // cause setTotal to fire twice for the same record.
  const seenIdsRef = useRef<Set<string>>(new Set());
  // progressTick is incremented to trigger re-renders when progress data changes.
  // The value itself is intentionally unused; only the setter is called.
  const [, setProgressTick] = useState(0);
  // liveTick triggers re-renders every 100ms so pending-request durations update live.
  const [, setLiveTick] = useState(0);
  // Mirrors `logs` for the liveTick interval below, so it can check for a
  // pending row without depending on `logs` (which would tear down and
  // rebuild the interval on every log update).
  const logsRef = useRef<UsageRecord[]>(logs);
  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  useEffect(() => {
    // Tick only while a pending request actually needs a live duration —
    // ticking whenever SSE is merely connected re-rendered this table (and
    // any open RequestDetailPanel) 10x/s even with nothing in flight, which
    // was starving the expander button's click handler.
    const interval = setInterval(() => {
      if (sseConnected.current && logsRef.current.some((l) => l.responseStatus === 'pending')) {
        setLiveTick((t) => t + 1);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const nextOffset = getOffsetFromSearchParams(searchParams);
    setOffset((currentOffset) => (currentOffset === nextOffset ? currentOffset : nextOffset));
  }, [searchParams]);

  const updateOffset = (nextOffset: number) => {
    const normalizedOffset = Math.max(0, Math.floor(nextOffset));
    setOffset(normalizedOffset);
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      if (normalizedOffset === 0) {
        nextParams.delete('offset');
      } else {
        nextParams.set('offset', String(normalizedOffset));
      }
      return nextParams;
    });
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const cleanFilters: Record<string, any> = {};
      if (filters.apiKey) cleanFilters.apiKey = filters.apiKey;
      if (filters.incomingModelAlias) cleanFilters.incomingModelAlias = filters.incomingModelAlias;
      if (filters.provider) cleanFilters.provider = filters.provider;
      if (filters.startDate) cleanFilters.startDate = new Date(filters.startDate).toISOString();
      if (filters.endDate) cleanFilters.endDate = new Date(filters.endDate).toISOString();

      const res = await api.getLogs(limit, offset, cleanFilters, sortBy, sortDir);
      setLogs(res.data);
      setTotal(Number(res.total) || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAll = () => {
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (deleteMode === 'all') {
        await api.deleteAllUsageLogs();
      } else {
        await api.deleteAllUsageLogs(olderThanDays);
      }
      // Reset to first page
      updateOffset(0);
      await loadLogs();
      setIsDeleteModalOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = (requestId: string) => {
    setSelectedLogIdForDelete(requestId);
    setIsSingleDeleteModalOpen(true);
  };

  const confirmDeleteSingle = async () => {
    if (!selectedLogIdForDelete) return;
    setIsDeleting(true);
    try {
      await api.deleteUsageLog(selectedLogIdForDelete);
      setLogs(logs.filter((l) => l.requestId !== selectedLogIdForDelete));
      setTotal((prev) => Math.max(0, prev - 1));
      setIsSingleDeleteModalOpen(false);
      setSelectedLogIdForDelete(null);
    } catch (e) {
      console.error('Failed to delete log', e);
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [offset, limit, sortBy, sortDir]); // Refresh when page or sort changes

  useEffect(() => {
    if (offset !== 0 || !adminKey || sortBy !== 'date' || sortDir !== 'desc') return;

    const controller = new AbortController();

    // Freeze pending logs and update connection status when the stream drops.
    const handleDisconnect = () => {
      sseConnected.current = false;
      setLogs((prev) =>
        prev.map((log) =>
          log.responseStatus === 'pending' && log.durationMs == null
            ? { ...log, durationMs: Date.now() - log.startTime }
            : log
        )
      );
    };

    // Attempt a single SSE connection.
    // Returns:
    //   true  — connected and stream ended (transient; safe to retry)
    //   false — connection-level error (transient; safe to retry)
    //   null  — permanent server error (4xx); stop retrying
    const connectOnce = async (): Promise<boolean | null> => {
      const connectionController = new AbortController();
      const abortConnection = () => connectionController.abort();
      controller.signal.addEventListener('abort', abortConnection, { once: true });
      let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
      let heartbeatTimedOut = false;
      let streamConnected = false;

      const resetHeartbeatTimer = () => {
        clearTimeout(heartbeatTimer);
        heartbeatTimer = setTimeout(() => {
          heartbeatTimedOut = true;
          connectionController.abort();
        }, SSE_HEARTBEAT_TIMEOUT_MS);
      };

      resetHeartbeatTimer();

      try {
        const response = await fetch('/v0/management/events', {
          headers: { 'x-admin-key': adminKey },
          signal: connectionController.signal,
        });

        if (!response.ok) {
          // Non-transient HTTP errors (401, 403, 404, etc.) — no point retrying.
          if (response.status >= 400 && response.status < 500) {
            handleDisconnect();
            console.error(`SSE: permanent error ${response.status} — stopping reconnect`);
            return null;
          }
          throw new Error(`Failed to connect: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) return false;

        streamConnected = true;
        sseConnected.current = true;
        setSseStatus('connected');
        resetHeartbeatTimer();

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            handleDisconnect();
            break;
          }

          // Any bytes prove the stream is alive; the server sends a ping every 10 seconds.
          resetHeartbeatTimer();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n'); // SSE messages are separated by double newline
          buffer = lines.pop() || '';

          for (const block of lines) {
            const blockLines = block.split('\n');
            let eventData = '';
            let eventType = '';

            for (const line of blockLines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7);
              } else if (line.startsWith('data: ')) {
                eventData = line.slice(6);
              }
            }

            // Handle progress updates for in-flight requests
            if (eventType === 'progress' && eventData) {
              try {
                const update: ProgressUpdate = JSON.parse(eventData);
                progressMapRef.current.set(update.requestId, update);
                setProgressTick((t) => t + 1);
              } catch {
                // ignore malformed progress events
              }
            }

            // Handle different event types: started, updated, completed
            if (
              (eventType === 'started' || eventType === 'updated' || eventType === 'completed') &&
              eventData
            ) {
              try {
                const newLog = JSON.parse(eventData);
                const currentFilters = filtersRef.current;

                // Client-side filtering to match server-side LIKE behavior
                let matches = true;
                if (
                  currentFilters.apiKey &&
                  !newLog.apiKey?.toLowerCase().includes(currentFilters.apiKey.toLowerCase())
                ) {
                  matches = false;
                }
                if (
                  currentFilters.incomingModelAlias &&
                  !newLog.incomingModelAlias
                    ?.toLowerCase()
                    .includes(currentFilters.incomingModelAlias.toLowerCase())
                ) {
                  matches = false;
                }
                if (
                  currentFilters.provider &&
                  !newLog.provider?.toLowerCase().includes(currentFilters.provider.toLowerCase())
                ) {
                  matches = false;
                }
                // Client-side date filtering for SSE events
                if (currentFilters.startDate && newLog.startTime) {
                  const filterStart = new Date(currentFilters.startDate).getTime();
                  if (newLog.startTime < filterStart) matches = false;
                }
                if (currentFilters.endDate && newLog.startTime) {
                  const filterEnd = new Date(currentFilters.endDate).getTime();
                  if (newLog.startTime > filterEnd) matches = false;
                }

                if (matches) {
                  // If a completed event arrives, clear any stale progress entry
                  if (eventType === 'completed') {
                    progressMapRef.current.delete(newLog.requestId);
                  }
                  // Determine newness BEFORE the updater so StrictMode's double-
                  // invocation of the updater doesn't cause setTotal to fire twice.
                  const isNew = !seenIdsRef.current.has(newLog.requestId);
                  if (isNew) seenIdsRef.current.add(newLog.requestId);
                  setLogs((prev) => {
                    const existingIndex = prev.findIndex((l) => l.requestId === newLog.requestId);
                    if (existingIndex >= 0) {
                      // Merge update into existing record (supports progressive updates)
                      const updated = [...prev];
                      updated[existingIndex] = { ...updated[existingIndex], ...newLog };
                      return updated;
                    }
                    // New record - add to the top
                    const updated = [newLog, ...prev];
                    if (updated.length > limit) return updated.slice(0, limit);
                    return updated;
                  });
                  if (isNew) setTotal((prev) => Number(prev) + 1);
                  setNewestLogId(newLog.requestId);
                }
              } catch (e) {
                console.error('Failed to parse log event', e);
              }
            }
          }
        }

        return true;
      } catch (err: any) {
        handleDisconnect();
        if (err.name === 'AbortError') {
          if (controller.signal.aborted) {
            // Intentional teardown — do not retry.
            throw err;
          }
          if (heartbeatTimedOut) {
            console.warn('SSE heartbeat timed out — reconnecting');
            return streamConnected;
          }
        }
        console.error('Log stream error:', err);
        return false;
      } finally {
        clearTimeout(heartbeatTimer);
        controller.signal.removeEventListener('abort', abortConnection);
      }
    };

    // Reconnect loop with exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (cap).
    // Delay resets to 1s after any successful connection so a brief outage
    // following a long stable session doesn't start with an accumulated delay.
    const run = async () => {
      const MAX_DELAY_MS = 30_000;
      let delay = 1_000;

      while (!controller.signal.aborted) {
        const result = await connectOnce();

        if (controller.signal.aborted) break;

        // Permanent server error (4xx) — stop retrying entirely.
        if (result === null) break;

        // Reset backoff after a successful connection so the next drop after a
        // long stable session starts back at 1 s instead of the accumulated delay.
        if (result === true) delay = 1_000;

        // Stream ended unexpectedly — start reconnecting.
        setSseStatus('reconnecting');

        // Wait before retrying, but bail early if aborted.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, delay);
          controller.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true }
          );
        });

        if (!controller.signal.aborted) {
          delay = Math.min(delay * 2, MAX_DELAY_MS);
        }
      }

      setSseStatus('disconnected');
    };

    run().catch(() => {
      // AbortError from intentional teardown — suppress.
      setSseStatus('disconnected');
    });

    return () => {
      sseConnected.current = false;
      setSseStatus('disconnected');
      controller.abort();
      // Freeze any in-flight logs that are still 'pending' so their duration
      // counter stops at the moment the stream dropped rather than continuing forever.
      setLogs((prev) =>
        prev.map((log) =>
          log.responseStatus === 'pending' && log.durationMs == null
            ? { ...log, durationMs: Date.now() - log.startTime }
            : log
        )
      );
    };
  }, [offset, limit, adminKey, sortBy, sortDir]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (offset === 0) {
      loadLogs();
      return;
    }
    updateOffset(0);
  };

  const handleLimitChange = (value: string) => {
    const nextLimit = Number(value);
    if (!Number.isFinite(nextLimit) || nextLimit <= 0) return;
    setLimit(nextLimit);
    // Reset to the first page so we don't land on an out-of-range offset.
    updateOffset(0);
  };

  const handleSort = (field: UsageSortField) => {
    updateOffset(0);
    if (sortBy === field) {
      setSortDir((current) => (current === 'desc' ? 'asc' : 'desc'));
      return;
    }

    setSortBy(field);
    setSortDir(field === 'date' ? 'desc' : 'asc');
  };

  const renderSortableHeader = (label: string, field: UsageSortField) => {
    const isActive = sortBy === field;

    return (
      <button
        type="button"
        onClick={() => handleSort(field)}
        className="inline-flex items-center justify-center gap-1 bg-transparent border-0 p-0 m-0 font-inherit text-inherit uppercase tracking-wider cursor-pointer"
        title={`Sort by ${label.toLowerCase()}`}
      >
        <span>{label}</span>
        <ChevronDown
          size={12}
          style={{
            opacity: isActive ? 1 : 0.35,
            transform: isActive && sortDir === 'asc' ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease, opacity 0.2s ease',
          }}
        />
      </button>
    );
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const formatDateSafely = (dateStr: string | undefined | null) => {
    if (!dateStr) return { time: '-', date: '-' };
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return { time: 'Invalid', date: 'Date' };
      return {
        time: d.toLocaleTimeString(),
        date: d.toISOString().split('T')[0],
      };
    } catch (e) {
      return { time: 'Error', date: 'Date' };
    }
  };

  const showLiveStatus = !!adminKey && offset === 0 && sortBy === 'date' && sortDir === 'desc';
  const hasActiveFilters = Boolean(
    filters.apiKey ||
      filters.incomingModelAlias ||
      filters.provider ||
      filters.startDate ||
      filters.endDate
  );

  // getRowId/renderExpanded/rowClassName are passed straight through to
  // DataTable, which wires getRowId into TanStack's row model and calls
  // renderExpanded directly — stable identities here keep them from
  // recomputing on every liveTick re-render.
  const getLogRowId = useCallback((row: UsageRecord) => row.requestId, []);
  const renderLogExpanded = useCallback((row: UsageRecord) => <RequestDetailPanel log={row} />, []);
  const getLogRowClassName = useCallback(
    (log: UsageRecord) =>
      cn(
        log.responseStatus === 'pending' && 'bg-warning/5',
        log.requestId === newestLogId && 'animate-slide-in'
      ),
    [newestLogId]
  );

  // ---------------------------------------------------------------------------
  // DataTable column definitions for the Logs table — the two-line ledger.
  // Every cell is at most two text lines (L1 text-sm, L2 text-xs muted); tier-2
  // detail (cache-write tokens, per-metric cost breakdown, message/tool counts,
  // vision-fallthrough model, E2E throughput, attempts) lives in
  // RequestDetailPanel, rendered by DataTable's renderExpanded below.
  // All columns have enableSorting=false — sorting is server-side, driven by
  // renderSortableHeader + handleSort which update sortBy/sortDir state and
  // trigger loadLogs(). TanStack sorting must not re-order the SSE-updated array.
  // ---------------------------------------------------------------------------
  const logsColumns = useMemo<ColumnDef<UsageRecord>[]>(
    () => [
      {
        id: 'time',
        header: () => renderSortableHeader('Date', 'date'),
        enableSorting: false,
        meta: { priority: 'high', mobileTitle: true, widthClass: 'px-3 2xl:px-4' },
        cell: ({ row }) => {
          const log = row.original;
          const formatted = formatDateSafely(log.date);
          return (
            <div className="flex flex-col">
              <span className="whitespace-nowrap font-mono text-sm font-medium">
                {formatted.time}
              </span>
              <span className="whitespace-nowrap text-xs text-foreground-muted">
                {formatted.date}
              </span>
            </div>
          );
        },
      },
      {
        id: 'key',
        header: () => renderSortableHeader('Key', 'apiKey'),
        enableSorting: false,
        meta: { priority: 'high', mobileLabel: 'Key', widthClass: 'px-3 2xl:px-4' },
        cell: ({ row }) => {
          const log = row.original;
          return (
            <div
              className={cn(
                'flex min-w-0 max-w-[130px] flex-col 2xl:max-w-none',
                log.sourceIp && 'cursor-help'
              )}
              title={log.sourceIp ? `IP: ${log.sourceIp}` : undefined}
            >
              <span className="truncate text-sm font-medium">{log.apiKey || '-'}</span>
              {log.attribution && (
                <span className="truncate text-xs text-foreground-muted">{log.attribution}</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'route',
        header: () => renderSortableHeader('Route', 'incomingModelAlias'),
        enableSorting: false,
        meta: { priority: 'high', mobileLabel: 'Route', widthClass: 'px-3 2xl:px-4' },
        cell: ({ row }) => {
          const log = row.original;
          // Destructured consts (not `log.` property reads) so TypeScript's
          // aliased-condition narrowing carries through `apiTypesDiffer` to the
          // ApiFormatChip props below.
          const { incomingApiType, outgoingApiType } = log;
          const routePath = getRoutePath(log);
          const apiTypesDiffer =
            !!incomingApiType &&
            !!outgoingApiType &&
            apiFormatsDiffer(incomingApiType, outgoingApiType);

          return (
            <div className="flex min-w-0 max-w-[170px] flex-col gap-0.5 whitespace-nowrap 2xl:max-w-none">
              <div className="group/alias flex items-center gap-1.5">
                <span className="min-w-0 truncate font-mono text-sm font-medium">
                  {log.incomingModelAlias || '-'}
                </span>
                {log.incomingModelAlias && log.incomingModelAlias !== '-' && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!isClipboardAvailable()) return;
                      await copyToClipboard(log.incomingModelAlias || '');
                    }}
                    className="flex shrink-0 items-center border-0 bg-transparent p-0 opacity-0 transition-opacity group-hover/alias:opacity-100 disabled:opacity-0"
                    title={
                      isClipboardAvailable() ? 'Copy incoming model alias' : 'Copy requires HTTPS'
                    }
                    disabled={!isClipboardAvailable()}
                  >
                    <Copy size={12} className="text-foreground-muted hover:text-foreground" />
                  </button>
                )}
                {/* Intentional fixed raw-palette glyph hues (not semantic tokens) — each
                    signal (streamed, route path, vision/descriptor) keeps a stable identity
                    color for quick visual scanning, matching the rest of this row today. */}
                <span className="flex shrink-0 items-center gap-1">
                  {log.isStreamed && (
                    <span title="Streamed" className="cursor-help">
                      <Zap size={12} className="text-blue-400" />
                    </span>
                  )}
                  {routePath === 'native' ? (
                    <span title="pi-ai native" className="cursor-help">
                      <Pi size={12} className="text-emerald-400" />
                    </span>
                  ) : routePath === 'passthrough' ? (
                    <span title="Direct/Passthrough" className="cursor-help">
                      <MoveHorizontal size={12} className="text-yellow-500" />
                    </span>
                  ) : (
                    <span title="Translated" className="cursor-help">
                      <Languages size={12} className="text-purple-400" />
                    </span>
                  )}
                  {log.isVisionFallthrough ? (
                    <span
                      title="Vision fallthrough (images converted to text)"
                      className="cursor-help"
                    >
                      <ScanSearch size={12} className="text-amber-500" />
                    </span>
                  ) : log.isDescriptorRequest ? (
                    <span
                      title="Descriptor request (generated image description)"
                      className="cursor-help"
                    >
                      <Eye size={12} className="text-blue-500" />
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="group/selected flex items-center gap-1.5 text-xs text-foreground-muted">
                <span
                  className="min-w-0 truncate font-mono"
                  title={`${log.provider || '-'}:${log.selectedModelName || '-'}`}
                >
                  {log.provider || '-'}:{log.selectedModelName || '-'}
                </span>
                {log.selectedModelName && log.selectedModelName !== '-' && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!isClipboardAvailable()) return;
                      await copyToClipboard(log.selectedModelName || '');
                    }}
                    className="flex shrink-0 items-center border-0 bg-transparent p-0 opacity-0 transition-opacity group-hover/selected:opacity-100 disabled:opacity-0"
                    title={
                      isClipboardAvailable() ? 'Copy selected model name' : 'Copy requires HTTPS'
                    }
                    disabled={!isClipboardAvailable()}
                  >
                    <Copy size={10} className="text-foreground-muted hover:text-foreground" />
                  </button>
                )}
                {apiTypesDiffer && (
                  <span className="flex shrink-0 items-center gap-1">
                    <ApiFormatChip format={incomingApiType} />
                    <span aria-hidden>→</span>
                    <ApiFormatChip format={outgoingApiType} />
                  </span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: 'tokens',
        header: 'Tokens',
        enableSorting: false,
        meta: {
          priority: 'medium',
          mobileLabel: 'Tokens',
          align: 'right',
          widthClass: 'px-3 2xl:px-4',
        },
        cell: ({ row }) => {
          const log = row.original;
          const inputLabel =
            (log.tokensInput || 0) === 0 ? '-' : formatLargeNumber(log.tokensInput || 0);
          const outputLabel =
            (log.tokensOutput || 0) === 0 ? '-' : formatLargeNumber(log.tokensOutput || 0);
          const l2Segments: string[] = [];
          if (log.tokensCached) l2Segments.push(`cached ${formatLargeNumber(log.tokensCached)}`);
          if (log.tokensReasoning) l2Segments.push(`rsn ${formatLargeNumber(log.tokensReasoning)}`);

          return (
            <div className="flex flex-col font-mono tabular-nums">
              <span className="whitespace-nowrap text-sm">
                {inputLabel}
                {log.tokensEstimated ? <sup className="text-[0.7em] opacity-60">*</sup> : null}
                {' → '}
                {outputLabel}
                {log.tokensEstimated ? <sup className="text-[0.7em] opacity-60">*</sup> : null}
              </span>
              {l2Segments.length > 0 && (
                <span className="hidden whitespace-nowrap text-xs text-foreground-muted 2xl:inline">
                  {l2Segments.join(' · ')}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'cost',
        header: () => renderSortableHeader('Cost', 'costTotal'),
        enableSorting: false,
        meta: {
          priority: 'medium',
          mobileLabel: 'Cost',
          align: 'right',
          widthClass: 'px-3 2xl:px-4',
        },
        cell: ({ row }) => {
          const log = row.original;
          if (log.costTotal == null || log.costTotal === 0) {
            return <span className="font-mono text-sm text-foreground-muted">-</span>;
          }
          const costLabel = formatCost(log.costTotal, 6);
          return (
            <div className="whitespace-nowrap font-mono text-sm font-medium tabular-nums">
              {log.costSource ? (
                <CostToolTip source={log.costSource} costMetadata={log.costMetadata}>
                  <span className="cursor-help">{costLabel}</span>
                </CostToolTip>
              ) : (
                costLabel
              )}
            </div>
          );
        },
      },
      {
        id: 'perf',
        header: () => renderSortableHeader('Perf', 'durationMs'),
        enableSorting: false,
        meta: {
          priority: 'medium',
          mobileLabel: 'Perf',
          align: 'right',
          widthClass: 'px-3 2xl:px-4',
        },
        cell: ({ row }) => {
          const log = row.original;
          const isPending = log.responseStatus === 'pending';
          const progress = isPending ? progressMapRef.current.get(log.requestId) : undefined;
          const rawDurationMs =
            log.durationMs != null && log.durationMs > 0
              ? log.durationMs
              : isPending
                ? Date.now() - log.startTime
                : null;
          const durationLabel = rawDurationMs != null ? formatMs(rawDurationMs) : '-';

          let secondLineText: string | null = null;
          let secondLineWarn = false;
          if (progress) {
            const bytesPerToken = getEstimatedBytesPerToken(log);
            const effectiveBytesPerSec =
              progress.bytesPerSec != null && progress.bytesPerSec > 0
                ? progress.bytesPerSec
                : progress.elapsedMs > 0 && progress.bytesReceived > 0
                  ? (progress.bytesReceived / progress.elapsedMs) * 1000
                  : null;
            const estTokensPerSec =
              effectiveBytesPerSec != null &&
              Number.isFinite(effectiveBytesPerSec) &&
              effectiveBytesPerSec > 0
                ? effectiveBytesPerSec / bytesPerToken
                : null;
            const parts = [formatBytes(progress.bytesReceived)];
            if (progress.bytesPerSec != null) parts.push(`${formatBytes(progress.bytesPerSec)}/s`);
            if (estTokensPerSec != null) parts.push(`~${formatTPS(estTokensPerSec)} t/s`);
            secondLineText = parts.join(' · ');
            secondLineWarn = true;
          } else {
            const parts: string[] = [];
            if (log.ttftMs && log.ttftMs > 0) parts.push(`TTFT ${formatMs(log.ttftMs)}`);
            if (log.tokensPerSec && log.tokensPerSec > 0)
              parts.push(`${formatTPS(log.tokensPerSec)} t/s`);
            if (parts.length > 0) secondLineText = parts.join(' · ');
          }

          return (
            <div className="flex flex-col font-mono tabular-nums">
              <span className={cn('whitespace-nowrap text-sm', isPending && 'text-warning')}>
                {durationLabel}
              </span>
              {secondLineText && (
                <span
                  className={cn(
                    'hidden whitespace-nowrap text-xs 2xl:inline',
                    secondLineWarn ? 'text-warning' : 'text-foreground-muted'
                  )}
                >
                  {secondLineText}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        meta: { priority: 'high', mobileLabel: 'Status', widthClass: 'w-px px-5' },
        cell: ({ row }) => {
          const log = row.original;
          // Pure state display — zero interactivity. Error/trace navigation
          // lives in the dossier's View error / View trace buttons (and the
          // actions column's trace button); clicks anywhere in this cell
          // bubble to the row and toggle expansion.
          const statusPill: { tone: PillTone; label: string } = log.hasError
            ? { tone: 'danger', label: 'err' }
            : (RESPONSE_STATUS_PILLS[log.responseStatus] ?? RESPONSE_STATUS_PILL_FALLBACK);

          return (
            <div className="flex flex-col items-start gap-1">
              <Pill tone={statusPill.tone} size="sm">
                {statusPill.label}
              </Pill>
              {log.attemptCount && log.attemptCount > 1 && (
                <Pill
                  tone="warning"
                  size="sm"
                  title={`${log.attemptCount} attempts — expand the row for details`}
                >
                  {log.attemptCount}×
                </Pill>
              )}
            </div>
          );
        },
      },
      {
        id: 'delete',
        header: 'Actions',
        enableSorting: false,
        // priority 'low' keeps this column off the mobile cards — the card
        // header already exposes delete via mobileActions.
        meta: { priority: 'low', align: 'right', widthClass: 'w-px px-2' },
        cell: ({ row }) => {
          const log = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              {log.hasDebug && (
                <button
                  type="button"
                  onClick={() => navigate('/debug', { state: { requestId: log.requestId } })}
                  className="flex h-6 w-6 items-center justify-center rounded-md border-0 bg-transparent text-foreground-subtle transition-all duration-200 cursor-pointer hover:bg-surface-elevated hover:text-foreground"
                  aria-label="View trace"
                  title="View trace"
                >
                  <Bug size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(log.requestId)}
                className="flex h-6 w-6 items-center justify-center rounded-md border-0 bg-transparent text-foreground-subtle transition-all duration-200 cursor-pointer hover:bg-danger-subtle hover:text-danger"
                aria-label="Delete log"
                title="Delete log"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortBy, sortDir]
  );

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={SECTION_NAMES['/logs']}
        sticky={false}
        subtitle={
          principal?.role === 'limited' && principal.keyName
            ? `Scoped to key "${principal.keyName}"`
            : 'All API requests routed through the gateway'
        }
        actions={
          <>
            <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
              {!isLimited && (
                <div className="w-full sm:w-40">
                  <SearchInput
                    placeholder="Key…"
                    value={filters.apiKey}
                    onChange={(v) => setFilters({ ...filters, apiKey: v })}
                  />
                </div>
              )}
              <div className="w-full sm:w-40">
                <SearchInput
                  placeholder="Model…"
                  value={filters.incomingModelAlias}
                  onChange={(v) => setFilters({ ...filters, incomingModelAlias: v })}
                />
              </div>
              <div className="w-full sm:w-36">
                <SearchInput
                  placeholder="Provider…"
                  value={filters.provider}
                  onChange={(v) => setFilters({ ...filters, provider: v })}
                />
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto sm:gap-2">
                  <PlayCircle size={18} className="shrink-0 text-foreground-muted sm:h-6 sm:w-6" />
                  <DateTimePicker
                    value={filters.startDate}
                    onChange={(v) => setFilters((prev) => ({ ...prev, startDate: v }))}
                    placeholder="Start date"
                    className="min-w-0 flex-1 sm:flex-none"
                  />
                </div>
                <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto sm:gap-2">
                  <Circle size={18} className="shrink-0 text-foreground-muted sm:h-6 sm:w-6" />
                  <DateTimePicker
                    value={filters.endDate}
                    onChange={(v) => setFilters((prev) => ({ ...prev, endDate: v }))}
                    placeholder="End date"
                    className="min-w-0 flex-1 sm:flex-none"
                  />
                </div>
              </div>
              <Button type="submit" variant="primary" size="md" className="w-full sm:w-auto">
                Search
              </Button>
            </form>
            {/* SSE live-update connection status — only visible when on page 1, sorted by date desc */}
            {showLiveStatus && (
              <span
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium select-none',
                  sseStatus === 'connected' && 'bg-success-subtle text-success border-success/20',
                  sseStatus === 'reconnecting' &&
                    'bg-warning-subtle text-warning border-warning/20',
                  sseStatus === 'disconnected' && 'bg-danger-subtle text-danger border-danger/20'
                )}
                title={
                  sseStatus === 'connected'
                    ? 'Live updates active'
                    : sseStatus === 'reconnecting'
                      ? 'Reconnecting to live updates…'
                      : 'Live updates disconnected'
                }
              >
                {sseStatus === 'connected' && <Wifi size={12} />}
                {sseStatus === 'reconnecting' && <Loader size={12} className="animate-spin" />}
                {sseStatus === 'disconnected' && <WifiOff size={12} />}
                <span className="hidden sm:inline">
                  {sseStatus === 'connected'
                    ? 'Live'
                    : sseStatus === 'reconnecting'
                      ? 'Reconnecting…'
                      : 'Disconnected'}
                </span>
              </span>
            )}
            {isAdmin && (
              <Button
                onClick={handleDeleteAll}
                variant="danger"
                size="md"
                leftIcon={<Trash2 size={14} />}
                disabled={logs.length === 0}
                type="button"
              >
                Delete All
              </Button>
            )}
          </>
        }
      />

      <PageContainer>
        <DataTable<UsageRecord>
          columns={logsColumns}
          data={logs}
          loading={loading && logs.length === 0}
          getRowKey={(row) => row.requestId}
          getRowId={getLogRowId}
          renderExpanded={renderLogExpanded}
          expandedIds={expanded}
          onExpandedChange={setExpanded}
          emptyTitle={hasActiveFilters ? 'No requests found' : 'No requests yet'}
          emptyDescription={
            hasActiveFilters
              ? 'Try adjusting your search filters.'
              : 'Proxied requests will appear here as traffic flows through the gateway.'
          }
          emptyIcon={<FileText />}
          breakpoint="xl"
          rowClassName={getLogRowClassName}
          mobileActions={(log) => (
            <>
              {log.hasDebug && (
                <button
                  type="button"
                  onClick={() => navigate('/debug', { state: { requestId: log.requestId } })}
                  className="flex h-6 w-6 items-center justify-center rounded-md border-0 bg-transparent text-foreground-subtle transition-all duration-200 cursor-pointer hover:bg-surface-elevated hover:text-foreground"
                  aria-label="View trace"
                  title="View trace"
                >
                  <Bug size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(log.requestId)}
                className="flex h-6 w-6 items-center justify-center rounded-md border-0 bg-transparent text-foreground-subtle transition-all duration-200 cursor-pointer hover:bg-danger-subtle hover:text-danger"
                aria-label="Delete log"
                title="Delete log"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
        />

        {/* Pagination — deliberately outside the table frame (Fix 3): a slim
            muted bar, not another bordered box. Per-page selector moved here
            from the old filter form; URL ?offset= plumbing (updateOffset) is
            unchanged. */}
        <div className="mt-3 flex items-center justify-end gap-3 text-xs text-foreground-muted">
          <label htmlFor="logs-per-page" className="text-xs text-foreground-muted">
            Per page
          </label>
          <div className="w-20">
            <Select
              id="logs-per-page"
              value={String(limit)}
              onChange={handleLimitChange}
              options={[
                { value: '20', label: '20' },
                { value: '50', label: '50' },
                { value: '100', label: '100' },
                { value: '200', label: '200' },
              ]}
            />
          </div>
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            offset={offset}
            limit={limit}
            total={total}
            onOffsetChange={updateOffset}
          />
        </div>
      </PageContainer>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Deletion"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete Logs'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p>Select which logs you would like to delete:</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="radio"
              id="delete-older"
              name="deleteMode"
              checked={deleteMode === 'older'}
              onChange={() => setDeleteMode('older')}
            />
            <label htmlFor="delete-older">Delete logs older than</label>
            <Input
              type="number"
              min="1"
              value={olderThanDays}
              onChange={(e) => setOlderThanDays(parseInt(e.target.value) || 1)}
              style={{ width: '60px', padding: '4px 8px' }}
              disabled={deleteMode !== 'older'}
            />
            <span>days</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="radio"
              id="delete-all"
              name="deleteMode"
              checked={deleteMode === 'all'}
              onChange={() => setDeleteMode('all')}
            />
            <label htmlFor="delete-all" style={{ color: 'var(--color-danger)' }}>
              Delete ALL logs (Cannot be undone)
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isSingleDeleteModalOpen}
        onClose={() => setIsSingleDeleteModalOpen(false)}
        title="Confirm Deletion"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsSingleDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDeleteSingle} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete Log'}
            </Button>
          </>
        }
      >
        <p>
          Are you sure you want to delete log <strong>{selectedLogIdForDelete}</strong>? This action
          cannot be undone.
        </p>
      </Modal>
    </div>
  );
};

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { SearchInput } from '../components/ui/SearchInput';
import { Select } from '../components/ui/Select';
import { CostToolTip } from '../components/ui/CostToolTip';
import { DataTable } from '../components/ui/DataTable';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
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
  KWH_PER_SLICE,
  formatBytes,
  formatCost,
  formatEnergy,
  formatMs,
  formatSlices,
  formatTPS,
  getEstimatedBytesPerToken,
} from '../lib/format';
import { isClipboardAvailable, copyToClipboard } from '../lib/clipboard';
import { formatApiTypeLabel, getApiBaseType } from '../lib/apiFormats';
import { DateTimePicker } from '../components/ui/DateTimePicker';
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  Bug,
  Zap,
  ZapOff,
  AlertTriangle,
  Languages,
  MoveHorizontal,
  CloudUpload,
  CloudDownload,
  BrainCog,
  PackageOpen,
  Copy,
  Variable,
  AudioLines,
  Volume2,
  Wrench,
  MessagesSquare,
  PlugZap,
  CirclePause,
  Octagon,
  Hammer,
  RulerDimensionLine,
  ChevronDown,
  Image as ImageIcon,
  ShieldCheck,
  FileText,
  RotateCcw,
  PencilLine,
  Plane,
  Eye,
  ScanSearch,
  PlayCircle,
  Circle,
  X,
  Ban,
  Timer,
  CheckCircle,
  XCircle,
  Gauge,
  Wifi,
  WifiOff,
  Loader,
  Pi,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
// @ts-ignore
import messagesLogo from '../assets/messages.svg';
// @ts-ignore
import antigravityLogo from '../assets/antigravity.svg';
// @ts-ignore
import chatLogo from '../assets/chat.svg';
// @ts-ignore
import geminiLogo from '../assets/gemini.svg';
// @ts-ignore
import responsesLogo from '../assets/responses.svg';

const SSE_HEARTBEAT_TIMEOUT_MS = 30_000;

interface RetryAttemptDetail {
  index: number;
  provider: string;
  model: string;
  apiType?: string;
  status: 'success' | 'failed' | 'skipped';
  reason: string;
  statusCode?: number;
  retryable?: boolean;
}

const parseRetryHistory = (value?: string | null): RetryAttemptDetail[] => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((entry): entry is RetryAttemptDetail => {
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
  <div className="flex items-center justify-between gap-2 px-2 py-2 sm:justify-end sm:gap-3 sm:px-3 sm:py-3">
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

  const apiLogos: Record<string, string> = {
    messages: messagesLogo,
    antigravity: antigravityLogo,
    chat: chatLogo,
    gemini: geminiLogo,
    responses: responsesLogo,
    'openai-responses': responsesLogo,
    // pi-ai/OAuth outgoing API types
    'google-generative-ai': geminiLogo,
    'openai-completions': chatLogo,
    'anthropic-messages': messagesLogo,
  };

  const PI_AI_OUTGOING_TYPES = new Set([
    'google-generative-ai',
    'openai-completions',
    'anthropic-messages',
    'openai-responses',
  ]);

  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'all' | 'older'>('older');
  const [olderThanDays, setOlderThanDays] = useState(7);
  const [isDeleting, setIsDeleting] = useState(false);

  // Single Delete State
  const [selectedLogIdForDelete, setSelectedLogIdForDelete] = useState<string | null>(null);
  const [isSingleDeleteModalOpen, setIsSingleDeleteModalOpen] = useState(false);
  const [selectedRetryLog, setSelectedRetryLog] = useState<UsageRecord | null>(null);
  const [isRetryModalOpen, setIsRetryModalOpen] = useState(false);

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

  useEffect(() => {
    // Only tick while the SSE stream is active so duration counters freeze when it drops.
    const interval = setInterval(() => {
      if (sseConnected.current) setLiveTick((t) => t + 1);
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

  const handleRetryDetails = (log: UsageRecord) => {
    setSelectedRetryLog(log);
    setIsRetryModalOpen(true);
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

  const selectedRetryHistory = parseRetryHistory(selectedRetryLog?.retryHistory);
  const showLiveStatus = !!adminKey && offset === 0 && sortBy === 'date' && sortDir === 'desc';
  const hasActiveFilters = Boolean(
    filters.apiKey ||
      filters.incomingModelAlias ||
      filters.provider ||
      filters.startDate ||
      filters.endDate
  );

  // ---------------------------------------------------------------------------
  // DataTable column definitions for the Logs table.
  // All columns have enableSorting=false — sorting is server-side, driven by
  // renderSortableHeader + handleSort which update sortBy/sortDir state and
  // trigger loadLogs(). TanStack sorting must not re-order the SSE-updated array.
  // ---------------------------------------------------------------------------
  const logsColumns = useMemo<ColumnDef<UsageRecord>[]>(
    () => [
      {
        id: 'date',
        header: () => renderSortableHeader('Date', 'date'),
        enableSorting: false,
        meta: { priority: 'high', mobileTitle: true },
        cell: ({ row }) => {
          const log = row.original;
          const formatted = formatDateSafely(log.date);
          return (
            <div className="flex flex-col">
              <span style={{ fontWeight: '500' }}>{formatted.time}</span>
              <span
                style={{
                  color: 'var(--foreground-muted)',
                  fontSize: '0.85em',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatted.date}
              </span>
            </div>
          );
        },
      },
      {
        id: 'apiKey',
        header: () => renderSortableHeader('Key', 'apiKey'),
        enableSorting: false,
        meta: { priority: 'high', mobileLabel: 'Key' },
        cell: ({ row }) => {
          const log = row.original;
          return (
            <div
              className="flex flex-col"
              title={log.sourceIp ? `IP: ${log.sourceIp}` : undefined}
              style={log.sourceIp ? { cursor: 'help' } : undefined}
            >
              <span style={{ fontWeight: '500' }}>{log.apiKey || '-'}</span>
              {log.attribution && (
                <span style={{ color: 'var(--foreground-muted)', fontSize: '0.85em' }}>
                  {log.attribution}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'api',
        header: 'API',
        enableSorting: false,
        meta: { priority: 'medium', mobileLabel: 'API' },
        cell: ({ row }) => {
          const log = row.original;
          return (
            <div
              className="whitespace-nowrap"
              title={`Incoming: ${formatApiTypeLabel(log.incomingApiType)} → Outgoing: ${formatApiTypeLabel(log.outgoingApiType)} • ${log.isStreamed ? 'Streamed' : 'Non-streamed'} • ${log.outgoingApiType && PI_AI_OUTGOING_TYPES.has(log.outgoingApiType) ? 'pi-ai native' : log.isPassthrough ? 'Direct/Passthrough' : 'Translated'}`}
              style={{ cursor: 'help' }}
            >
              {/* Intentional fixed per-category visual encoding — raw palette colors are correct here,
                  NOT semantic tokens. Each api type has a stable identity color. Do not migrate to theme tokens. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <div style={{ width: '16px', display: 'flex', justifyContent: 'center' }}>
                    {log.incomingApiType === 'embeddings' ? (
                      <Variable size={16} className="text-green-500" />
                    ) : log.incomingApiType === 'transcriptions' ? (
                      <AudioLines size={16} className="text-purple-500" />
                    ) : log.incomingApiType === 'speech' ? (
                      <Volume2 size={16} className="text-orange-500" />
                    ) : log.incomingApiType === 'images' ? (
                      <ImageIcon size={16} className="text-fuchsia-500" />
                    ) : log.incomingApiType === 'oauth' ? (
                      <ShieldCheck size={16} className="text-emerald-500" />
                    ) : log.incomingApiType && apiLogos[getApiBaseType(log.incomingApiType)] ? (
                      <img
                        src={apiLogos[getApiBaseType(log.incomingApiType)]}
                        alt={formatApiTypeLabel(log.incomingApiType)}
                        title={formatApiTypeLabel(log.incomingApiType)}
                        style={{ width: '16px', height: '16px' }}
                      />
                    ) : (
                      '?'
                    )}
                  </div>
                  <span style={{ width: '14px', textAlign: 'center' }}>→</span>
                  <div style={{ width: '16px', display: 'flex', justifyContent: 'center' }}>
                    {log.outgoingApiType === 'embeddings' ? (
                      <Variable size={16} className="text-green-500" />
                    ) : log.outgoingApiType === 'transcriptions' ? (
                      <AudioLines size={16} className="text-purple-500" />
                    ) : log.outgoingApiType === 'speech' ? (
                      <Volume2 size={16} className="text-orange-500" />
                    ) : log.outgoingApiType === 'images' ? (
                      <ImageIcon size={16} className="text-fuchsia-500" />
                    ) : log.outgoingApiType === 'oauth' ? (
                      <ShieldCheck size={16} className="text-emerald-500" />
                    ) : log.outgoingApiType && apiLogos[getApiBaseType(log.outgoingApiType)] ? (
                      <img
                        src={apiLogos[getApiBaseType(log.outgoingApiType)]}
                        alt={formatApiTypeLabel(log.outgoingApiType)}
                        title={formatApiTypeLabel(log.outgoingApiType)}
                        style={{ width: '16px', height: '16px' }}
                      />
                    ) : (
                      '?'
                    )}
                  </div>
                </div>
                <div
                  style={{
                    borderTop: '1px solid var(--border)',
                    margin: '1px 4px',
                    width: '44px',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <div style={{ width: '16px', display: 'flex', justifyContent: 'center' }}>
                    {log.isStreamed ? (
                      <Zap size={12} className="text-blue-400" />
                    ) : (
                      <ZapOff size={12} className="text-gray-400" />
                    )}
                  </div>
                  <span style={{ width: '14px' }} />
                  <div style={{ width: '16px', display: 'flex', justifyContent: 'center' }}>
                    {log.outgoingApiType && PI_AI_OUTGOING_TYPES.has(log.outgoingApiType) ? (
                      <Pi size={12} className="text-emerald-400" />
                    ) : log.isPassthrough ? (
                      <MoveHorizontal size={12} className="text-yellow-500" />
                    ) : (
                      <Languages size={12} className="text-purple-400" />
                    )}
                  </div>
                </div>
                {(log.isVisionFallthrough || log.isDescriptorRequest) && (
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '2px' }}
                  >
                    <div style={{ width: '16px', display: 'flex', justifyContent: 'center' }}>
                      {log.isVisionFallthrough && (
                        <div
                          title={`Vision Fallthrough${log.visionFallthroughModel ? ` via ${log.visionFallthroughModel}` : ''} (Images converted to text)`}
                        >
                          <ScanSearch size={12} className="text-amber-500" />
                        </div>
                      )}
                    </div>
                    <span style={{ width: '14px' }} />
                    <div style={{ width: '16px', display: 'flex', justifyContent: 'center' }}>
                      {log.isDescriptorRequest && (
                        <div title="Descriptor Request (Generated image description)">
                          <Eye size={12} className="text-blue-500" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: 'model',
        header: () => renderSortableHeader('Model', 'incomingModelAlias'),
        enableSorting: false,
        meta: { priority: 'high', mobileLabel: 'Model' },
        cell: ({ row }) => {
          const log = row.original;
          return (
            <div className="flex min-w-0 flex-col gap-0.5 break-all lg:whitespace-nowrap">
              <div className="group/model flex items-center gap-1">
                <span>{log.incomingModelAlias || '-'}</span>
                {log.incomingModelAlias && log.incomingModelAlias !== '-' && (
                  <button
                    onClick={async () => {
                      if (!isClipboardAvailable()) return;
                      await copyToClipboard(log.incomingModelAlias || '');
                    }}
                    className="opacity-0 group-hover/model:opacity-100 transition-opacity bg-transparent border-0 cursor-pointer p-0 flex items-center disabled:opacity-0"
                    title={
                      isClipboardAvailable() ? 'Copy incoming model alias' : 'Copy requires HTTPS'
                    }
                    disabled={!isClipboardAvailable()}
                  >
                    <Copy size={12} className="text-foreground-muted hover:text-foreground" />
                  </button>
                )}
              </div>
              <div className="group/selected flex items-center gap-1">
                <span style={{ color: 'var(--foreground-muted)', fontSize: '0.9em' }}>
                  {log.provider || '-'}:{log.selectedModelName || '-'}
                </span>
                {log.selectedModelName && log.selectedModelName !== '-' && (
                  <button
                    onClick={async () => {
                      if (!isClipboardAvailable()) return;
                      await copyToClipboard(log.selectedModelName || '');
                    }}
                    className="opacity-0 group-hover/selected:opacity-100 transition-opacity bg-transparent border-0 cursor-pointer p-0 flex items-center disabled:opacity-0"
                    title={
                      isClipboardAvailable() ? 'Copy selected model name' : 'Copy requires HTTPS'
                    }
                    disabled={!isClipboardAvailable()}
                  >
                    <Copy size={10} className="text-foreground-muted hover:text-foreground" />
                  </button>
                )}
              </div>
              {log.isVisionFallthrough && log.visionFallthroughModel && (
                <div
                  className="group/vft flex items-center gap-1"
                  title="Vision fallthrough descriptor model"
                >
                  <ScanSearch size={10} className="text-amber-500 shrink-0" />
                  <span style={{ color: 'var(--foreground-muted)', fontSize: '0.8em' }}>
                    {log.visionFallthroughModel}
                  </span>
                  <button
                    onClick={async () => {
                      if (!isClipboardAvailable()) return;
                      await copyToClipboard(log.visionFallthroughModel || '');
                    }}
                    className="opacity-0 group-hover/vft:opacity-100 transition-opacity bg-transparent border-0 cursor-pointer p-0 flex items-center disabled:opacity-0"
                    title={
                      isClipboardAvailable() ? 'Copy fallthrough model name' : 'Copy requires HTTPS'
                    }
                    disabled={!isClipboardAvailable()}
                  >
                    <Copy size={10} className="text-foreground-muted hover:text-foreground" />
                  </button>
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'tokens',
        header: 'Tokens',
        enableSorting: false,
        meta: { priority: 'medium', mobileLabel: 'Tokens' },
        cell: ({ row }) => {
          const log = row.original;
          return (
            <div
              title={`Input: ${(log.tokensInput || 0) === 0 ? '-' : formatLargeNumber(log.tokensInput || 0)} • Output: ${(log.tokensOutput || 0) === 0 ? '-' : formatLargeNumber(log.tokensOutput || 0)} • Reasoning: ${(log.tokensReasoning || 0) === 0 ? '-' : formatLargeNumber(log.tokensReasoning || 0)} • Cached: ${(log.tokensCached || 0) === 0 ? '-' : formatLargeNumber(log.tokensCached || 0)} • Cache Write: ${(log.tokensCacheWrite || 0) === 0 ? '-' : formatLargeNumber(log.tokensCacheWrite || 0)}${log.tokensEstimated ? ' • * = Estimated' : ''}`}
              style={{ cursor: 'help' }}
            >
              {/* Intentional fixed per-token-type visual encoding — raw palette colors are correct here,
                  NOT semantic tokens. Each token type (input/output/reasoning/cached) has a stable
                  identity color for quick visual scanning. Do not migrate to theme tokens. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CloudUpload size={12} className="text-blue-400" />
                    <span style={{ fontWeight: '500', fontSize: '0.9em', minWidth: '30px' }}>
                      {(log.tokensInput || 0) === 0 ? '-' : formatLargeNumber(log.tokensInput || 0)}
                      {log.tokensEstimated ? (
                        <sup style={{ fontSize: '0.7em', opacity: 0.6 }}>*</sup>
                      ) : null}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <BrainCog size={12} className="text-purple-400" />
                    <span
                      style={{
                        color: 'var(--foreground-muted)',
                        fontSize: '0.85em',
                        minWidth: '30px',
                      }}
                    >
                      {(log.tokensReasoning || 0) === 0
                        ? '-'
                        : formatLargeNumber(log.tokensReasoning || 0)}
                      {log.tokensEstimated ? (
                        <sup style={{ fontSize: '0.7em', opacity: 0.6 }}>*</sup>
                      ) : null}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CloudDownload size={12} className="text-green-400" />
                    <span style={{ fontWeight: '500', fontSize: '0.9em', minWidth: '30px' }}>
                      {(log.tokensOutput || 0) === 0
                        ? '-'
                        : formatLargeNumber(log.tokensOutput || 0)}
                      {log.tokensEstimated ? (
                        <sup style={{ fontSize: '0.7em', opacity: 0.6 }}>*</sup>
                      ) : null}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <PackageOpen size={12} className="text-orange-400" />
                    <span
                      style={{
                        color: 'var(--foreground-muted)',
                        fontSize: '0.85em',
                        minWidth: '30px',
                      }}
                    >
                      {(log.tokensCached || 0) === 0
                        ? '-'
                        : formatLargeNumber(log.tokensCached || 0)}
                      {log.tokensEstimated ? (
                        <sup style={{ fontSize: '0.7em', opacity: 0.6 }}>*</sup>
                      ) : null}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <PencilLine size={12} className="text-fuchsia-400" />
                    <span
                      style={{
                        color: 'var(--foreground-muted)',
                        fontSize: '0.85em',
                        minWidth: '30px',
                      }}
                    >
                      {(log.tokensCacheWrite || 0) === 0
                        ? '-'
                        : formatLargeNumber(log.tokensCacheWrite || 0)}
                      {log.tokensEstimated ? (
                        <sup style={{ fontSize: '0.7em', opacity: 0.6 }}>*</sup>
                      ) : null}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: 'cost',
        header: () => renderSortableHeader('Cost', 'costTotal'),
        enableSorting: false,
        meta: { priority: 'medium', mobileLabel: 'Cost' },
        cell: ({ row }) => {
          const log = row.original;
          if (log.costTotal === undefined || log.costTotal === null) {
            return (
              <span
                style={{
                  color: 'var(--foreground-muted)',
                  fontSize: '1.2em',
                  display: 'block',
                  textAlign: 'center',
                }}
              >
                -
              </span>
            );
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div>
                {log.costSource ? (
                  <CostToolTip source={log.costSource} costMetadata={log.costMetadata}>
                    <span style={{ fontWeight: '500', cursor: 'help' }}>
                      {log.costTotal === 0 ? '-' : formatCost(log.costTotal, 6)}
                    </span>
                  </CostToolTip>
                ) : (
                  <span style={{ fontWeight: '500' }}>
                    {log.costTotal === 0 ? '-' : formatCost(log.costTotal, 6)}
                  </span>
                )}
              </div>
              <div style={{ borderTop: '1px solid var(--border)', margin: '1px 2px' }} />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto 1fr',
                  gap: '2px 4px',
                  alignItems: 'center',
                }}
              >
                <CloudUpload size={10} className="text-blue-400" />
                <span style={{ color: 'var(--foreground-muted)', fontSize: '0.85em' }}>
                  {log.costInput === 0 ? '$-.----' : formatCost(log.costInput || 0)}
                </span>
                <CloudDownload size={10} className="text-green-400" />
                <span style={{ color: 'var(--foreground-muted)', fontSize: '0.85em' }}>
                  {log.costOutput === 0 ? '$-.----' : formatCost(log.costOutput || 0)}
                </span>
                <PackageOpen size={10} className="text-orange-400" />
                <span style={{ color: 'var(--foreground-muted)', fontSize: '0.85em' }}>
                  {log.costCached === 0 ? '$-.----' : formatCost(log.costCached || 0)}
                </span>
                <PencilLine size={10} className="text-fuchsia-400" />
                <span style={{ color: 'var(--foreground-muted)', fontSize: '0.85em' }}>
                  {log.costCacheWrite === 0 ? '$-.----' : formatCost(log.costCacheWrite || 0)}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'perf',
        header: () => renderSortableHeader('Perf', 'durationMs'),
        enableSorting: false,
        meta: { priority: 'medium', mobileLabel: 'Perf' },
        cell: ({ row }) => {
          const log = row.original;
          const progress =
            log.responseStatus === 'pending'
              ? progressMapRef.current.get(log.requestId)
              : undefined;
          const rawDurationMs =
            log.durationMs != null && log.durationMs > 0
              ? log.durationMs
              : log.responseStatus === 'pending'
                ? Date.now() - log.startTime
                : null;
          const liveDuration = rawDurationMs != null ? formatMs(rawDurationMs) : '-';
          const e2eOutputTokens = Number(log.tokensOutput || 0) + Number(log.tokensReasoning || 0);
          const e2e =
            log.durationMs != null && log.durationMs > 0 && e2eOutputTokens > 0
              ? e2eOutputTokens / (log.durationMs / 1000)
              : null;

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
            return (
              <div
                className="whitespace-nowrap"
                style={{ display: 'flex', flexDirection: 'column' }}
              >
                <span>Duration: {liveDuration}</span>
                <span
                  style={{
                    color: 'var(--foreground-muted)',
                    fontSize: '0.85em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <CloudDownload size={12} className="text-yellow-400" />
                  <span>{formatBytes(progress.bytesReceived)}</span>
                </span>
                {progress.bytesPerSec != null && (
                  <span
                    style={{
                      color: 'var(--foreground-muted)',
                      fontSize: '0.85em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Gauge size={12} className="text-foreground-muted" />
                    {formatBytes(progress.bytesPerSec)}/s
                  </span>
                )}
                {estTokensPerSec != null && (
                  <span
                    style={{
                      color: 'var(--foreground-muted)',
                      fontSize: '0.85em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title={`Estimated tokens/sec (~${Math.round(bytesPerToken)} bytes/token accounting for SSE + JSON framing)`}
                  >
                    <Zap size={12} className="text-amber-400" />
                    <span>~{formatTPS(estTokensPerSec)} tok/s</span>
                  </span>
                )}
              </div>
            );
          }
          return (
            <div className="whitespace-nowrap" style={{ display: 'flex', flexDirection: 'column' }}>
              <span>Duration: {liveDuration}</span>
              <span
                style={{
                  color: 'var(--foreground-muted)',
                  fontSize: '0.85em',
                  whiteSpace: 'nowrap',
                }}
              >
                {log.ttftMs && log.ttftMs > 0 ? `TTFT: ${formatMs(log.ttftMs)}` : ''}
              </span>
              <span
                style={{
                  color: 'var(--foreground-muted)',
                  fontSize: '0.85em',
                  whiteSpace: 'nowrap',
                }}
              >
                {log.tokensPerSec && log.tokensPerSec > 0
                  ? `TPS: ${formatTPS(log.tokensPerSec)}`
                  : ''}
              </span>
              <span
                style={{
                  color: 'var(--foreground-muted)',
                  fontSize: '0.85em',
                  whiteSpace: 'nowrap',
                }}
              >
                {e2e != null ? `E2E: ${formatTPS(e2e)}` : ''}
              </span>
            </div>
          );
        },
      },
      {
        id: 'meta',
        header: 'Meta',
        enableSorting: false,
        meta: { priority: 'low', mobileLabel: 'Meta' },
        cell: ({ row }) => {
          const log = row.original;
          return (
            <div
              title={
                log.kwhUsed != null && log.kwhUsed > 0
                  ? `Energy: ${formatEnergy(log.kwhUsed)} ≈ ${formatSlices(log.kwhUsed / KWH_PER_SLICE)} toast slices`
                  : undefined
              }
              style={log.kwhUsed != null && log.kwhUsed > 0 ? { cursor: 'help' } : undefined}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    className="text-blue-400"
                  >
                    <MessagesSquare size={12} />
                    <span style={{ fontWeight: '500', fontSize: '0.9em', minWidth: '20px' }}>
                      {(log.messageCount || 0) === 0 ? '-' : log.messageCount}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-green-400">
                    <PlugZap size={12} />
                    <span
                      style={{
                        color: 'var(--foreground-muted)',
                        fontSize: '0.85em',
                        minWidth: '20px',
                      }}
                    >
                      {(log.toolCallsCount || 0) === 0 ? '-' : log.toolCallsCount}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    className="text-orange-400"
                  >
                    <Wrench size={12} />
                    <span style={{ fontWeight: '500', fontSize: '0.9em', minWidth: '20px' }}>
                      {(log.toolsDefined || 0) === 0 ? '-' : log.toolsDefined}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {log.finishReason === 'end_turn' ? (
                      <CirclePause size={12} className="text-yellow-500" />
                    ) : log.finishReason === 'stop' ? (
                      <Octagon size={12} className="text-danger" />
                    ) : log.finishReason === 'tool_calls' ? (
                      <Hammer size={12} className="text-purple-500" />
                    ) : log.finishReason === 'length' || log.finishReason === 'max_tokens' ? (
                      <RulerDimensionLine size={12} className="text-pink-400" />
                    ) : (
                      <ChevronDown size={12} className="text-gray-400" />
                    )}
                    <span
                      style={{
                        color: 'var(--foreground-muted)',
                        fontSize: '0.85em',
                        minWidth: '20px',
                      }}
                    >
                      {log.finishReason || '-'}
                    </span>
                  </div>
                </div>
                {log.attemptCount && log.attemptCount > 1 && (
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <button
                      type="button"
                      onClick={() => handleRetryDetails(log)}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      className="text-orange-500 bg-transparent border-0 p-0 cursor-pointer hover:text-orange-400 transition-colors"
                      title="View retry history"
                    >
                      <RotateCcw size={12} />
                      <span style={{ fontWeight: '500', fontSize: '0.9em', minWidth: '20px' }}>
                        {log.attemptCount}x
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        meta: { priority: 'high', mobileLabel: 'Status' },
        cell: ({ row }) => {
          const log = row.original;
          return (
            <div className="flex gap-2 items-center">
              {log.hasError && (
                <button
                  onClick={() => navigate('/errors', { state: { requestId: log.requestId } })}
                  className={cn(
                    'inline-flex items-center justify-center gap-1.5 py-1 px-2 rounded-xl text-xs font-medium cursor-pointer transition-all duration-200 border',
                    'text-danger border-danger/30 bg-danger-subtle hover:bg-danger/25'
                  )}
                  style={{ width: '52px' }}
                  title="View Error Details"
                >
                  <AlertTriangle size={12} />
                  <span style={{ fontWeight: 600 }}>✗</span>
                </button>
              )}
              {log.hasDebug && (
                <button
                  onClick={() => navigate('/debug', { state: { requestId: log.requestId } })}
                  className={cn(
                    'inline-flex items-center justify-center gap-1.5 py-1 px-2 rounded-xl text-xs font-medium cursor-pointer transition-all duration-200 border',
                    'text-info border-info/30 bg-info-subtle hover:bg-info/25'
                  )}
                  style={{ width: '52px' }}
                  title="View Debug Trace"
                >
                  <Bug size={12} />
                  <span style={{ fontWeight: 600 }}>✓</span>
                </button>
              )}
              {!log.hasError && !log.hasDebug && (
                <div
                  className={cn(
                    'inline-flex items-center justify-center gap-1.5 py-1 px-2 rounded-xl text-xs font-medium border',
                    log.responseStatus === 'success'
                      ? 'text-success border-success/30 bg-emerald-500/15'
                      : log.responseStatus === 'pending'
                        ? 'text-warning border-warning/30 bg-yellow-500/15'
                        : log.responseStatus === 'cancelled'
                          ? 'text-info border-info/30 bg-info-subtle'
                          : log.responseStatus === 'timeout'
                            ? 'text-warning border-warning/30 bg-warning-subtle'
                            : 'text-danger border-danger/30 bg-danger-subtle'
                  )}
                  style={{ width: '52px' }}
                >
                  {log.responseStatus === 'success' ? (
                    <CheckCircle size={12} />
                  ) : log.responseStatus === 'pending' ? (
                    <Plane size={12} className="animate-pulse" />
                  ) : log.responseStatus === 'cancelled' ? (
                    <Ban size={12} />
                  ) : log.responseStatus === 'timeout' ? (
                    <Timer size={12} />
                  ) : (
                    <XCircle size={12} />
                  )}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'delete',
        header: () => <Trash2 size={12} />,
        enableSorting: false,
        meta: { priority: 'high', align: 'center' },
        cell: ({ row }) => {
          const log = row.original;
          return (
            <button
              onClick={() => handleDelete(log.requestId)}
              className="bg-transparent border-0 text-foreground-subtle p-1 rounded cursor-pointer transition-all duration-200 flex items-center justify-center hover:bg-danger-subtle hover:text-danger opacity-0 group-hover:opacity-100"
              title="Delete log"
            >
              <Trash2 size={14} />
            </button>
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
        subtitle={
          principal?.role === 'limited' && principal.keyName
            ? `Scoped to key "${principal.keyName}"`
            : 'All API requests routed through the gateway'
        }
        actions={
          <>
            {/* SSE live-update connection status — only visible when on page 1, sorted by date desc */}
            {showLiveStatus && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium select-none sm:px-2.5',
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
      >
        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-2">
          {!isLimited && (
            <div className="w-full sm:w-56">
              <SearchInput
                placeholder="Key…"
                value={filters.apiKey}
                onChange={(v) => setFilters({ ...filters, apiKey: v })}
              />
            </div>
          )}
          <div className="w-full sm:w-56">
            <SearchInput
              placeholder="Model…"
              value={filters.incomingModelAlias}
              onChange={(v) => setFilters({ ...filters, incomingModelAlias: v })}
            />
          </div>
          <div className="w-full sm:w-44">
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
            {(filters.startDate || filters.endDate) && (
              <button
                type="button"
                onClick={() => setFilters({ ...filters, startDate: '', endDate: '' })}
                className="rounded-md border-0 bg-transparent text-foreground-subtle transition-colors duration-fast hover:bg-surface-elevated hover:text-foreground"
                title="Clear date filters"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <Button type="submit" variant="primary" size="md" className="w-full sm:w-auto">
            Search
          </Button>
          <div className="w-full sm:w-40">
            <Select
              label="Per page"
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
        </form>
      </PageHeader>

      <PageContainer>
        <DataTable<UsageRecord>
          columns={logsColumns}
          data={logs}
          loading={loading && logs.length === 0}
          getRowKey={(row) => row.requestId}
          emptyTitle={hasActiveFilters ? 'No requests found' : 'No requests yet'}
          emptyDescription={
            hasActiveFilters
              ? 'Try adjusting your search filters.'
              : 'Proxied requests will appear here as traffic flows through the gateway.'
          }
          emptyIcon={<FileText />}
          breakpoint="lg"
          headerSlot={
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              offset={offset}
              limit={limit}
              total={total}
              onOffsetChange={updateOffset}
            />
          }
          footerSlot={
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              offset={offset}
              limit={limit}
              total={total}
              onOffsetChange={updateOffset}
            />
          }
          rowClassName={(log) =>
            cn(
              log.responseStatus === 'pending' && 'bg-warning/5',
              log.requestId === newestLogId && 'animate-slide-in'
            )
          }
          mobileActions={(log) => (
            <button
              onClick={() => handleDelete(log.requestId)}
              className="bg-transparent border-0 text-foreground-subtle p-1 rounded cursor-pointer transition-all duration-200 flex items-center justify-center hover:bg-danger-subtle hover:text-danger"
              title="Delete log"
            >
              <Trash2 size={14} />
            </button>
          )}
        />
      </PageContainer>

      <Modal
        isOpen={isRetryModalOpen}
        onClose={() => setIsRetryModalOpen(false)}
        title="Retry History"
        footer={
          <Button variant="secondary" onClick={() => setIsRetryModalOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="text-sm text-foreground-muted">
            <div>
              Request: <span className="text-foreground">{selectedRetryLog?.requestId || '-'}</span>
            </div>
            <div>
              Attempts:{' '}
              <span className="text-foreground">{selectedRetryLog?.attemptCount || 1}</span>
            </div>
          </div>

          {selectedRetryHistory.length === 0 ? (
            <div className="text-sm text-foreground-muted">
              No retry history is available for this request.
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-h-96 overflow-y-auto">
              {selectedRetryHistory.map((attempt) => (
                <div
                  key={`${attempt.index}-${attempt.provider}-${attempt.model}`}
                  className={cn(
                    'rounded-lg border p-3',
                    attempt.status === 'success'
                      ? 'border-emerald-500/30 bg-emerald-500/10'
                      : attempt.status === 'skipped'
                        ? 'border-yellow-500/30 bg-yellow-500/10'
                        : 'border-danger/30 bg-danger-subtle'
                  )}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="font-medium text-sm text-foreground">
                      Attempt {attempt.index}: {attempt.provider}/{attempt.model}
                    </div>
                    <div className="text-xs uppercase tracking-wide text-foreground-muted">
                      {attempt.status}
                    </div>
                  </div>
                  <div className="text-sm text-foreground-muted">
                    <div>API: {attempt.apiType || '-'}</div>
                    {attempt.statusCode ? <div>Status Code: {attempt.statusCode}</div> : null}
                    {attempt.retryable !== undefined ? (
                      <div>Retryable: {attempt.retryable ? 'yes' : 'no'}</div>
                    ) : null}
                    <div className="mt-2 text-foreground">{attempt.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

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

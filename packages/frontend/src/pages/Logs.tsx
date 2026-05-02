import React from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ListPage, DetailPage } from '../components/templates';
import { Button } from '../components/ui-v2/button';
import { Skeleton } from '../components/ui-v2/skeleton';
import { Pill } from '../components/chips/Pill';
import { useAuth } from '../contexts/AuthContext';
import { useLogs, type LogTimeWindow } from '../hooks/queries/useLogs';
import type { UsageRecord } from '../lib/api';
import { cn } from '../lib/cn';
import { LogTable } from './logs/LogTable';
import { LogDetailSheet } from './logs/LogDetailSheet';
import { LogDetail } from './logs/LogDetail';

const WINDOW_OPTIONS: { value: LogTimeWindow; label: string }[] = [
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
];

const PAGE_SIZE = 20;
const STORAGE_KEY = 'plexus.logs.window';

const readStoredWindow = (): LogTimeWindow => {
  if (typeof window === 'undefined') return '24h';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === '15m' || raw === '1h' || raw === '24h' || raw === '7d' ? raw : '24h';
};

export const Logs: React.FC = () => {
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const fullPage = searchParams.get('full') === '1';
  const { principal } = useAuth();

  const [timeWindow, setTimeWindow] = React.useState<LogTimeWindow>(() => readStoredWindow());
  const [page, setPage] = React.useState(0);

  React.useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, timeWindow);
  }, [timeWindow]);

  const { data, isLoading, isError, refetch, isFetching } = useLogs(
    { window: timeWindow },
    page,
    PAGE_SIZE
  );

  const records: UsageRecord[] = data?.data ?? [];
  const total = data?.total ?? 0;

  // Selected record from /logs/:id
  const selectedRecord = React.useMemo(
    () => records.find((r) => r.requestId === routeId) ?? null,
    [records, routeId]
  );

  const isMobileViewport =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 1023px)').matches;
  const isFullPageMode = !!routeId && (fullPage || isMobileViewport);

  // Keyboard nav for j/k/esc — only when sheet is open
  React.useEffect(() => {
    if (isFullPageMode || !routeId || records.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      }
      const idx = records.findIndex((r) => r.requestId === routeId);
      if (e.key === 'Escape') {
        e.preventDefault();
        navigate('/logs');
      } else if (e.key === 'j' && idx < records.length - 1) {
        e.preventDefault();
        navigate(`/logs/${records[idx + 1]!.requestId}`);
      } else if (e.key === 'k' && idx > 0) {
        e.preventDefault();
        navigate(`/logs/${records[idx - 1]!.requestId}`);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [routeId, records, navigate, isFullPageMode]);

  // Full-page mode: render the detail-page layout
  if (isFullPageMode) {
    return (
      <DetailPage
        title="Request"
        subtitle={
          selectedRecord ? (
            <code className="font-mono text-xs">{selectedRecord.requestId}</code>
          ) : null
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/logs')}>
            <ChevronLeft strokeWidth={1.75} /> Back to logs
          </Button>
        }
        rail={selectedRecord ? <RailMeta record={selectedRecord} /> : <Skeleton className="h-32" />}
      >
        <div className="rounded-lg border border-border bg-surface">
          {selectedRecord ? (
            <LogDetail record={selectedRecord} />
          ) : (
            <div className="p-6">
              <Skeleton className="h-64" />
            </div>
          )}
        </div>
      </DetailPage>
    );
  }

  return (
    <>
      <ListPage
        title="Request Logs"
        subtitle={
          principal?.role === 'limited' && principal.keyName
            ? `Scoped to key "${principal.keyName}".`
            : 'Recent inference requests across all providers.'
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} strokeWidth={1.75} />
            Refresh
          </Button>
        }
        filters={
          <>
            {WINDOW_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                active={timeWindow === opt.value}
                onClick={() => {
                  setTimeWindow(opt.value);
                  setPage(0);
                }}
              />
            ))}
            <span className="ml-auto text-[11px] text-foreground-subtle">
              {total > 0
                ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`
                : '—'}
            </span>
          </>
        }
      >
        {isError ? (
          <div className="rounded-lg border border-danger/40 bg-danger-subtle px-4 py-3">
            <p className="text-sm font-medium text-danger">Failed to load logs</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : isLoading && records.length === 0 ? (
          <div className="overflow-hidden rounded-lg border border-border bg-surface p-3">
            <div className="space-y-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-6 py-16 text-center">
            <h2 className="text-base font-medium text-foreground">No requests in this window</h2>
            <p className="text-sm text-foreground-muted">
              Once a client hits /v1/chat/completions, you'll see them here.
            </p>
          </div>
        ) : (
          <>
            <LogTable
              records={records}
              selectedId={routeId ?? null}
              onSelect={(r) => navigate(`/logs/${r.requestId}`)}
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft strokeWidth={1.75} /> Newer
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= total}
              >
                Older <ChevronRight strokeWidth={1.75} />
              </Button>
            </div>
          </>
        )}
      </ListPage>

      <LogDetailSheet
        record={selectedRecord}
        open={!!routeId && !!selectedRecord && !isFullPageMode}
        onClose={() => navigate('/logs')}
      />
    </>
  );
};

const FilterChip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors',
      active
        ? 'bg-accent-subtle text-accent'
        : 'text-foreground-muted hover:bg-surface-elevated hover:text-foreground'
    )}
  >
    {label}
  </button>
);

const RailMeta: React.FC<{ record: UsageRecord }> = ({ record }) => (
  <dl className="space-y-2 text-xs">
    <div>
      <dt className="text-foreground-subtle">ID</dt>
      <dd className="break-all font-mono text-foreground">{record.requestId}</dd>
    </div>
    <div>
      <dt className="text-foreground-subtle">Status</dt>
      <dd>
        <Pill
          size="sm"
          tone={
            parseInt(record.responseStatus ?? '0', 10) >= 500
              ? 'danger'
              : parseInt(record.responseStatus ?? '0', 10) >= 400
                ? 'warning'
                : 'success'
          }
        >
          {record.responseStatus ?? '—'}
        </Pill>
      </dd>
    </div>
    <div>
      <dt className="text-foreground-subtle">Started</dt>
      <dd className="font-mono tabular-nums text-foreground">
        {record.date ?? new Date(record.startTime).toISOString()}
      </dd>
    </div>
    <div>
      <dt className="text-foreground-subtle">Provider</dt>
      <dd className="text-foreground">{record.provider ?? '—'}</dd>
    </div>
    <div>
      <dt className="text-foreground-subtle">Model</dt>
      <dd className="break-all font-mono text-foreground">
        {record.selectedModelName ?? record.incomingModelAlias ?? '—'}
      </dd>
    </div>
  </dl>
);

import { useState } from 'react';
import { clsx } from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  HardDrive,
  Info,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { api, DatabaseMaintenanceError } from '../../lib/api';
import type {
  CleanupCategory,
  CleanupCategoryId,
  DatabaseCleanupScan,
  DatabaseCompactResult,
  DatabaseSize,
} from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { formatBytes } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { Switch } from '../ui/Switch';

const DIALECT_LABELS: Record<DatabaseSize['dialect'], string> = {
  sqlite: 'SQLite',
  postgres: 'PostgreSQL',
};

/**
 * Pick the categories to tick after a scan. Categories the admin could already
 * act on keep their previous state; newly actionable ones fall back to the
 * backend default. Empty categories are never selected.
 */
function deriveSelection(
  next: CleanupCategory[],
  previousScan: DatabaseCleanupScan | null,
  previousSelection: Set<CleanupCategoryId>
): Set<CleanupCategoryId> {
  const previousById = new Map(previousScan?.categories.map((c) => [c.id, c]) ?? []);
  const selection = new Set<CleanupCategoryId>();
  for (const category of next) {
    if (category.count <= 0) continue;
    const previous = previousById.get(category.id);
    const keep =
      previous && previous.count > 0
        ? previousSelection.has(category.id)
        : category.defaultSelected;
    if (keep) selection.add(category.id);
  }
  return selection;
}

/** Deletable units the capped item list does not show. */
function hiddenUnitCount(category: CleanupCategory): number {
  const shown = category.items.reduce(
    (sum, item) => (item.reportOnly ? sum : sum + (item.count ?? 1)),
    0
  );
  return Math.max(0, category.count - shown);
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function toEpochMs(timestamp: number): number {
  // Accept epoch seconds as well as milliseconds.
  return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

export function DatabaseMaintenanceCard() {
  const toast = useToast();
  const [scan, setScan] = useState<DatabaseCleanupScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<CleanupCategoryId>>(new Set());
  const [expanded, setExpanded] = useState<Set<CleanupCategoryId>>(new Set());
  const [purging, setPurging] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [fullVacuum, setFullVacuum] = useState(false);
  const [compactResult, setCompactResult] = useState<DatabaseCompactResult | null>(null);

  const busy = scanning || purging || compacting;

  const runScan = async () => {
    const previousScan = scan;
    setScanning(true);
    setScanError(null);
    try {
      const next = await api.getDatabaseCleanupScan();
      setSelected((prev) => deriveSelection(next.categories, previousScan, prev));
      setScan(next);
    } catch (e) {
      const message = (e as Error).message;
      setScanError(message);
      toast.error(message, 'Database scan failed');
    } finally {
      setScanning(false);
    }
  };

  const toggleSelected = (id: CleanupCategoryId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpanded = (id: CleanupCategoryId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const categories = scan?.categories ?? [];
  const selectedCategories = categories.filter((c) => selected.has(c.id) && c.count > 0);
  const hasFindings = categories.some((c) => c.count > 0 || c.items.some((i) => i.reportOnly));

  const handlePurge = async () => {
    if (!scan || selectedCategories.length === 0) return;
    const chosen = selectedCategories;

    const ok = await toast.confirm({
      title: 'Purge selected data?',
      variant: 'danger',
      confirmLabel: 'Purge',
      message: (
        <div className="flex flex-col gap-3">
          <p>This permanently deletes:</p>
          <ul className="flex flex-col gap-1 rounded-md border border-border-glass bg-bg-subtle p-2">
            {chosen.map((category) => (
              <li key={category.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-text">{category.label}</span>
                <span className="tnum shrink-0 font-mono text-[12px]">
                  {category.count.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          <p>
            This cannot be undone. Take a <strong className="text-text">Full Backup</strong> first
            if you might need this data again.
          </p>
        </div>
      ),
    });
    if (!ok) return;

    const labelFor = (id: CleanupCategoryId) =>
      scan.categories.find((c) => c.id === id)?.label ?? id;

    setPurging(true);
    try {
      const result = await api.purgeDatabaseCleanup(chosen.map((c) => c.id));
      const deleted = Object.entries(result.deleted ?? {}) as [CleanupCategoryId, number][];
      const errors = Object.entries(result.errors ?? {}) as [CleanupCategoryId, string][];
      const total = deleted.reduce((sum, [, n]) => sum + (n ?? 0), 0);
      const succeeded = deleted.filter(([id]) => !result.errors?.[id]);

      if (errors.length > 0) {
        toast.warning(
          <div className="flex flex-col gap-1">
            {total > 0 && (
              <span>
                Removed {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
                {succeeded.length > 0 &&
                  ` from ${succeeded.map(([id]) => labelFor(id)).join(', ')}`}
                .
              </span>
            )}
            <span>Failed:</span>
            <ul className="flex flex-col gap-0.5">
              {errors.map(([id, message]) => (
                <li key={id}>
                  <strong>{labelFor(id)}</strong>: {message}
                </li>
              ))}
            </ul>
          </div>,
          'Purge partly failed'
        );
      } else {
        toast.success(
          `Removed ${total.toLocaleString()} ${total === 1 ? 'entry' : 'entries'} from ${
            deleted.length
          } ${deleted.length === 1 ? 'category' : 'categories'}.`,
          'Purge complete'
        );
      }
    } catch (e) {
      toast.error((e as Error).message, 'Purge failed');
    } finally {
      setPurging(false);
    }
    await runScan();
  };

  const handleCompact = async () => {
    if (!scan) return;
    const { dialect, totalBytes } = scan.size;
    const full = dialect === 'postgres' && fullVacuum;

    const ok = await toast.confirm({
      title: 'Compact database?',
      confirmLabel: 'Compact',
      variant: dialect === 'sqlite' || full ? 'danger' : 'default',
      message:
        dialect === 'sqlite' ? (
          <div className="flex flex-col gap-3">
            <p>
              SQLite rewrites the whole database file.{' '}
              <strong className="text-text">Plexus pauses all requests while it runs</strong> —
              typically a few seconds, longer for large databases.
            </p>
            <p>
              It needs free disk space roughly equal to the database size (currently{' '}
              {formatBytes(totalBytes)}).
            </p>
          </div>
        ) : full ? (
          <div className="flex flex-col gap-3">
            <p>
              A full vacuum rewrites every table and{' '}
              <strong className="text-text">locks each table while it runs</strong>, blocking
              requests that touch it.
            </p>
            <p>It needs extra free disk space for the rewritten tables.</p>
          </div>
        ) : (
          <p>
            A standard vacuum runs alongside normal traffic and marks dead rows for reuse. It rarely
            shrinks files on disk; use a full vacuum for that.
          </p>
        ),
    });
    if (!ok) return;

    setCompacting(true);
    try {
      const result = await api.compactDatabase(dialect === 'postgres' ? { full } : {});
      setCompactResult(result);
      toast.success(
        `Saved ${formatBytes(result.reclaimedBytes)} in ${formatElapsed(result.durationMs)}.`,
        'Database compacted'
      );
    } catch (e) {
      if (e instanceof DatabaseMaintenanceError && e.status === 409) {
        toast.warning('A compaction is already running');
      } else {
        toast.error((e as Error).message, 'Compaction failed');
      }
    } finally {
      setCompacting(false);
    }
    await runScan();
  };

  const scanButton = (
    <Button
      variant="secondary"
      size="sm"
      onClick={runScan}
      isLoading={scanning}
      disabled={purging || compacting}
      leftIcon={<RefreshCw size={14} />}
    >
      Scan
    </Button>
  );

  return (
    <Card title="Database Maintenance" extra={scanButton}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          Finds data Plexus no longer uses: OAuth logins no provider links to, history for removed
          providers and quota checkers, stale quota rows, obsolete settings, and legacy files.
          Nothing is deleted until you confirm.
        </p>

        {!scan && scanning && (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height={58} className="w-full" />
            ))}
          </div>
        )}

        {!scan && !scanning && (
          <EmptyState
            dense
            icon={<Search />}
            title={scanError ? 'Scan failed' : 'Not scanned yet'}
            description={
              scanError ??
              'Scan the database to see orphaned and unused data. Scanning only reads; it changes nothing.'
            }
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={runScan}
                leftIcon={<RefreshCw size={14} />}
              >
                Scan database
              </Button>
            }
          />
        )}

        {scan && (
          <div
            className={clsx(
              'flex flex-col gap-4 transition-opacity duration-fast',
              scanning && 'opacity-60'
            )}
            aria-busy={scanning}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-[11px] text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Database size={13} className="shrink-0" aria-hidden="true" />
                <span>
                  {DIALECT_LABELS[scan.size.dialect]} ·{' '}
                  <span className="tnum text-text-secondary">
                    {formatBytes(scan.size.totalBytes)}
                  </span>
                </span>
              </span>
              {scan.size.reclaimableBytes !== undefined && (
                <span>
                  <span className="tnum text-text-secondary">
                    {formatBytes(scan.size.reclaimableBytes)}
                  </span>{' '}
                  reclaimable
                </span>
              )}
              <span>Scanned {new Date(toEpochMs(scan.scannedAt)).toLocaleString()}</span>
            </div>

            {!hasFindings ? (
              <EmptyState
                dense
                className="rounded-md border border-border-glass bg-bg-subtle"
                icon={<CheckCircle2 />}
                title="Nothing to clean up"
                description="No orphaned or unused data was found."
              />
            ) : (
              <>
                <ul className="flex flex-col gap-2">
                  {categories.map((category) => (
                    <CategoryRow
                      key={category.id}
                      category={category}
                      checked={selected.has(category.id)}
                      expanded={expanded.has(category.id)}
                      disabled={busy}
                      onToggle={() => toggleSelected(category.id)}
                      onToggleExpanded={() => toggleExpanded(category.id)}
                    />
                  ))}
                </ul>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-1.5 self-start rounded-md border border-warning/30 bg-warning/10 px-2 py-1">
                    <AlertTriangle size={13} className="text-warning shrink-0" />
                    <span className="font-body text-[11px] text-text-muted">
                      Purging is permanent — take a Full Backup first
                    </span>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    className="self-start sm:self-auto"
                    onClick={handlePurge}
                    isLoading={purging}
                    disabled={selectedCategories.length === 0 || scanning || compacting}
                    leftIcon={<Trash2 size={14} />}
                  >
                    Purge selected ({selectedCategories.length})
                  </Button>
                </div>
              </>
            )}

            <div className="flex flex-col gap-3 border-t border-border-glass pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-body text-[12px] font-medium text-text">Compact database</p>
                  <p className="font-body text-[11px] text-text-muted">
                    {scan.size.dialect === 'sqlite'
                      ? 'Rebuilds the database file so space freed by deleted rows is returned to the disk.'
                      : 'Runs VACUUM so space freed by deleted rows can be reused.'}{' '}
                    Currently{' '}
                    <span className="tnum text-text-secondary">
                      {formatBytes(scan.size.totalBytes)}
                    </span>
                    {scan.size.dialect === 'sqlite' && scan.size.reclaimableBytes !== undefined && (
                      <>
                        , about{' '}
                        <span className="tnum text-text-secondary">
                          {formatBytes(scan.size.reclaimableBytes)}
                        </span>{' '}
                        reclaimable
                      </>
                    )}
                    .
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start shrink-0"
                  onClick={handleCompact}
                  isLoading={compacting}
                  disabled={scanning || purging}
                  leftIcon={<HardDrive size={14} />}
                >
                  Compact database
                </Button>
              </div>

              {scan.size.dialect === 'postgres' && (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-body text-[12px] font-medium text-text">Full vacuum</p>
                    <p className="font-body text-[11px] text-text-muted">
                      Returns space to the disk, but locks tables while it runs and needs extra
                      disk.
                    </p>
                  </div>
                  <Switch
                    checked={fullVacuum}
                    onChange={setFullVacuum}
                    disabled={busy}
                    aria-label="Full vacuum (locks tables, needs extra disk)"
                  />
                </div>
              )}

              {compactResult && (
                <div className="flex items-start gap-1.5 rounded-md border border-success/30 bg-success/10 px-2 py-1.5">
                  <CheckCircle2 size={13} className="mt-px shrink-0 text-success" />
                  <span className="font-body text-[11px] text-text-secondary">
                    <span className="tnum">
                      {formatBytes(compactResult.beforeBytes)} →{' '}
                      {formatBytes(compactResult.afterBytes)}
                    </span>
                    , saved{' '}
                    <span className="tnum text-text">
                      {formatBytes(compactResult.reclaimedBytes)}
                    </span>{' '}
                    in {formatElapsed(compactResult.durationMs)}
                    {compactResult.full ? ' (full vacuum)' : ''}.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

interface CategoryRowProps {
  category: CleanupCategory;
  checked: boolean;
  expanded: boolean;
  disabled: boolean;
  onToggle: () => void;
  onToggleExpanded: () => void;
}

function CategoryRow({
  category,
  checked,
  expanded,
  disabled,
  onToggle,
  onToggleExpanded,
}: CategoryRowProps) {
  const inputId = `db-cleanup-${category.id}`;
  const itemsId = `${inputId}-items`;
  const empty = category.count === 0;
  const reportOnlyCount = category.items.filter((item) => item.reportOnly).length;
  const hiddenCount = category.truncated ? hiddenUnitCount(category) : 0;

  return (
    <li className="rounded-md border border-border-glass bg-bg-subtle">
      <div className="flex items-start gap-2 p-2">
        <div className="flex min-w-0 flex-1 items-start gap-2 p-1">
          <input
            id={inputId}
            type="checkbox"
            checked={checked && !empty}
            onChange={onToggle}
            disabled={empty || disabled}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border-glass accent-primary text-primary focus:ring-primary disabled:cursor-not-allowed"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <label
                htmlFor={inputId}
                className={clsx(
                  'font-body text-[12px] font-medium text-text',
                  empty || disabled ? 'cursor-default' : 'cursor-pointer'
                )}
              >
                {category.label}
              </label>
              <Badge status={empty ? 'neutral' : 'warning'} noDot>
                {category.count.toLocaleString()}
              </Badge>
              {reportOnlyCount > 0 && (
                <Badge status="info" noDot>
                  {reportOnlyCount.toLocaleString()} report only
                </Badge>
              )}
            </div>
            <p className="mt-0.5 font-body text-[11px] text-text-muted">{category.description}</p>
          </div>
        </div>
        {category.items.length > 0 && (
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            aria-controls={itemsId}
            aria-label={`${expanded ? 'Hide' : 'Show'} ${category.label} details`}
            className="mt-0.5 shrink-0 rounded p-1 text-text-muted transition-colors duration-fast hover:bg-bg-hover hover:text-text"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>

      {expanded && category.items.length > 0 && (
        <ul
          id={itemsId}
          className="flex flex-col divide-y divide-border-glass border-t border-border-glass px-3 py-1"
        >
          {category.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1 py-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
            >
              <div className="min-w-0">
                <div className="font-mono text-[11px] text-text break-all">{item.label}</div>
                {item.detail && (
                  <div className="font-body text-[11px] text-text-muted break-words">
                    {item.detail}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 font-body text-[11px]">
                {item.reportOnly && (
                  <span className="inline-flex items-center gap-1 text-info">
                    <Info size={12} aria-hidden="true" />
                    report only
                  </span>
                )}
                {item.count !== undefined && (
                  <span className="tnum text-text-secondary">{item.count.toLocaleString()}</span>
                )}
              </div>
            </li>
          ))}
          {category.truncated && (
            <li className="py-1.5 font-body text-[11px] text-text-muted">
              {hiddenCount > 0 ? `and ${hiddenCount.toLocaleString()} more…` : 'and more…'}
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

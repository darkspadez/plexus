/**
 * DataTable — shared TanStack-based table for Phase 6+.
 *
 * Features:
 *   - Column defs via @tanstack/react-table with per-column `priority`
 *     ('high'/'medium'/'low') and optional `mobileLabel` / `mobileTitle` /
 *     `widthClass` (opt-in width class applied to that column's th+td, e.g.
 *     'w-px' to shrink a column to its content).
 *   - Desktop (md+): real <table> with sortable headers (tri-state), hover,
 *     selected-row accent left-bar, numeric columns right-aligned mono, no zebra.
 *   - Mobile (below md): card-per-row fallback with a <dl> definition list for
 *     high/medium priority columns; low-priority columns hidden on mobile.
 *     The `mobileTitle` column becomes the card header. Row-actions slot sits
 *     inline with the card title.
 *   - Optional server-side or client-side pagination.
 *   - Loading skeleton + empty state.
 *   - onRowClick. No external filtering baked in — callers filter and pass data.
 *   - Optional opt-in row expansion: pass `renderExpanded` to prepend a
 *     chevron toggle column (desktop) that reveals a colSpan detail `<tr>`
 *     below the row, and a "Details" Disclosure on mobile cards. `getRowId` /
 *     `expandedIds` / `onExpandedChange` let callers key and/or control the
 *     expanded set; all four are absent by default, so existing tables
 *     render exactly as before this feature existed.
 */
import React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type CellContext,
  type ColumnDef,
  type SortingState,
  type RowData,
} from '@tanstack/react-table';
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './Button';
import { Disclosure } from './Disclosure';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

// ---------------------------------------------------------------------------
// Module augmentation — add our custom column meta to TanStack's ColumnMeta
// ---------------------------------------------------------------------------

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Column alignment — numeric cols should use 'right' */
    align?: 'left' | 'right' | 'center';
    /** Column priority controls mobile visibility */
    priority?: 'high' | 'medium' | 'low';
    /** Label shown in the mobile card definition list. Defaults to the column header string. */
    mobileLabel?: string;
    /** When true this column's value becomes the mobile card header title. */
    mobileTitle?: boolean;
    /**
     * Opt-in width class appended to this column's <th> and <td> (e.g. 'w-px'
     * to shrink the column to its content). No effect when unset.
     */
    widthClass?: string;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData extends RowData> {
    /**
     * Row-expansion API threaded through `useReactTable`'s `meta` option so
     * the expander cell (a module-level component, not a per-render closure
     * — see `ExpanderCell` below) can read live expansion state without
     * capturing it.
     */
    isRowExpanded?: (id: string) => boolean;
    toggleExpanded?: (id: string) => void;
  }
}

// ---------------------------------------------------------------------------
// ResponsiveTableColumn — legacy type alias kept for callers that import it
// from ResponsiveTable; now lives here so ResponsiveTable.tsx can be removed.
// ---------------------------------------------------------------------------

export interface ResponsiveTableColumn<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T, index: number) => React.ReactNode;
  /** Column priority controls mobile visibility. `high` always shows; `low` hidden on mobile. */
  priority?: 'high' | 'medium' | 'low';
  align?: 'left' | 'center' | 'right';
  width?: string;
  /** Label shown above the value in mobile card mode. Defaults to `header`. */
  mobileLabel?: React.ReactNode;
  /** Override: show as the main title of the mobile card. */
  mobileTitle?: boolean;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DataTablePaginationProps {
  /** Total number of rows (server-side) or undefined for client-side */
  total?: number;
  /** Current page (0-indexed) */
  page: number;
  /** Rows per page */
  pageSize: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<TData> {
  /** TanStack column definitions. Extend ColumnMeta with priority/mobileLabel/mobileTitle. */
  columns: ColumnDef<TData>[];
  data: TData[];
  /** Loading state — shows skeletons when true and data is empty */
  loading?: boolean;
  /** Error state */
  error?: React.ReactNode;
  /** Empty state title */
  emptyTitle?: React.ReactNode;
  /** Empty state description */
  emptyDescription?: React.ReactNode;
  /** Empty state icon */
  emptyIcon?: React.ReactNode;
  /** Empty state action */
  emptyAction?: React.ReactNode;
  /** Called when a row is clicked */
  onRowClick?: (row: TData) => void;
  /** Pagination config. Omit for no pagination. */
  pagination?: DataTablePaginationProps;
  /** Key extractor for mobile cards (defaults to row index) */
  getRowKey?: (row: TData, index: number) => string | number;
  /** Additional class on the root wrapper */
  className?: string;
  /**
   * Slot rendered inside the mobile card header alongside the mobileTitle.
   * Receives the row; return null/undefined to render nothing.
   */
  mobileActions?: (row: TData) => React.ReactNode;
  /** Break point at which mobile cards switch to desktop table. Default: 'md'. */
  breakpoint?: 'md' | 'lg' | 'xl';
  /**
   * Optional per-row class string applied to BOTH the desktop <tr> and the mobile
   * card <div>. Use for state-driven row tints (e.g. pending highlight, slide-in
   * animation on newest row). The `group` class is always present on <tr>
   * regardless of this prop.
   */
  rowClassName?: (row: TData) => string;
  /** Title strip rendered INSIDE the frame, above the table (replaces wrapping Card titles). */
  title?: React.ReactNode;
  /** Right side of the title strip (counts, small actions). */
  titleExtra?: React.ReactNode;
  /** Full-width strip inside the frame, below the title strip / above the table (filter rows, top pagination). */
  headerSlot?: React.ReactNode;
  /** Full-width strip inside the frame, below the table (bottom pagination, footnotes). */
  footerSlot?: React.ReactNode;
  /**
   * Row identity for expansion tracking — wired straight into TanStack's
   * `getRowId`. Pass a stable key (e.g. a request id) so expansion survives
   * row prepends/reorders; omitted falls back to TanStack's default row.id.
   */
  getRowId?: (row: TData) => string;
  /**
   * Presence enables opt-in row expansion: a chevron toggle column + colSpan
   * detail row on desktop, and a "Details" Disclosure per mobile card. Omit
   * entirely to leave the table exactly as it was before this feature existed.
   * Known caveat: when combined with `onRowClick`, non-interactive clicks
   * inside the mobile expanded panel still reach `onRowClick` (no current
   * consumer combines them).
   */
  renderExpanded?: (row: TData) => React.ReactNode;
  /** Controlled set of expanded row ids. Omit to manage expansion internally. */
  expandedIds?: ReadonlySet<string>;
  /** Notified with the next expanded-ids set on every toggle, controlled or not. */
  onExpandedChange?: (next: Set<string>) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Column id for the injected row-expansion toggle column (desktop only). */
const EXPANDER_COLUMN_ID = '__expander__';

/**
 * True when a click originated on a nested interactive element (copy buttons,
 * status pills, delete buttons, the Disclosure toggle, …). Row-level click
 * handling must ignore those whenever row expansion is enabled.
 */
const isInteractiveElementClick = (e: React.MouseEvent) =>
  Boolean((e.target as HTMLElement).closest('button, a, input, select, textarea, [role="button"]'));

/**
 * Expander toggle cell — module-level (not a closure built fresh inside a
 * ColumnDef on every render). flexRender renders a `cell` function as a
 * component; a new function identity every render is a new component TYPE
 * to React, which unmounts/remounts this button's DOM node on every render.
 * Logs.tsx re-renders this table at 10Hz while SSE is connected, which was
 * destroying and recreating the chevron continuously and dropping clicks
 * whose press straddled a remount. Reads expansion state off
 * `table.options.meta` instead of a closure so it works for whichever table
 * instance renders it.
 */
function ExpanderCell<TData>({ row, table }: CellContext<TData, unknown>) {
  const isRowExpanded = table.options.meta?.isRowExpanded?.(row.id) ?? false;
  return (
    <button
      type="button"
      onClick={(e) => {
        // The chevron only toggles — never bubble into onRowClick.
        e.stopPropagation();
        table.options.meta?.toggleExpanded?.(row.id);
      }}
      aria-expanded={isRowExpanded}
      aria-label="Toggle details"
      className="flex h-6 w-6 items-center justify-center rounded text-foreground-muted transition-colors duration-150 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
    >
      <ChevronRight
        size={14}
        className={cn('transition-transform duration-150', isRowExpanded && 'rotate-90')}
      />
    </button>
  );
}

/**
 * Module-level expander ColumnDef, prepended to `columns` only when
 * `renderExpanded` is enabled (see `tableColumns` below). Declared once at
 * module scope — not rebuilt per render — so `cell: ExpanderCell` keeps a
 * stable identity across renders. The `any` here is narrowed back to
 * `ColumnDef<TData>` with a cast at each usage site.
 */
const EXPANDER_COLUMN: ColumnDef<any> = {
  id: EXPANDER_COLUMN_ID,
  header: '',
  enableSorting: false,
  cell: ExpanderCell,
};

export function DataTable<TData>({
  columns,
  data,
  loading,
  error,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyIcon,
  emptyAction,
  onRowClick,
  pagination,
  getRowKey,
  className,
  mobileActions,
  breakpoint = 'md',
  rowClassName,
  title,
  titleExtra,
  headerSlot,
  footerSlot,
  getRowId,
  renderExpanded,
  expandedIds: expandedIdsProp,
  onExpandedChange,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  // ── Row expansion — opt-in, a no-op unless `renderExpanded` is passed ─────
  // Uncontrolled by default (internal Set state); controlled when the caller
  // passes `expandedIds`. Mirrors Disclosure's controlled/uncontrolled split.
  const [internalExpandedIds, setInternalExpandedIds] = React.useState<Set<string>>(
    () => new Set()
  );
  const isExpandedControlled = expandedIdsProp !== undefined;
  const expandedIds = isExpandedControlled ? expandedIdsProp : internalExpandedIds;
  const toggleExpanded = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    if (!isExpandedControlled) setInternalExpandedIds(next);
    onExpandedChange?.(next);
  };

  // Expander toggle column, prepended only when the feature is enabled — when
  // `renderExpanded` is absent, `tableColumns === columns` so TanStack sees
  // the exact same column list it always has. `EXPANDER_COLUMN` is already a
  // stable module-level constant; memoizing the array itself just keeps
  // `tableColumns`'s own identity stable too across unrelated renders.
  const tableColumns = React.useMemo(
    () => (renderExpanded ? [EXPANDER_COLUMN as ColumnDef<TData>, ...columns] : columns),
    [columns, Boolean(renderExpanded)]
  );

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // When pagination is external (server-side) we don't want TanStack to
    // paginate: just sort and display the slice the caller provides.
    manualPagination: !!pagination,
    getRowId,
    // Threads the expansion API to `ExpanderCell` via `table.options.meta`
    // instead of a per-render closure baked into the column's `cell`. A new
    // object identity here every render is fine — only the ColumnDef/cell
    // identity mattered for the remount bug, not this.
    meta: {
      isRowExpanded: (id: string) => expandedIds.has(id),
      toggleExpanded,
    },
  });

  // Breakpoint classes
  const hiddenOnDesktop =
    breakpoint === 'xl' ? 'xl:hidden' : breakpoint === 'lg' ? 'lg:hidden' : 'md:hidden';
  const hiddenOnMobile =
    breakpoint === 'xl'
      ? 'hidden xl:block'
      : breakpoint === 'lg'
        ? 'hidden lg:block'
        : 'hidden md:block';

  // ── Chrome slots (title / titleExtra / headerSlot / footerSlot) ───────────
  // Strictly additive in-frame chrome — replaces wrapping <Card title=…> at
  // call sites. When none of these props are passed every branch below
  // renders exactly as it did before this feature existed.
  const hasChrome = Boolean(title || titleExtra || headerSlot || footerSlot);
  const showTitleStrip = Boolean(title || titleExtra);
  const titleStripContent = (
    <>
      <h3 className="font-sans text-[13px] sm:text-sm font-medium text-foreground m-0 truncate min-w-0">
        {title}
      </h3>
      {titleExtra && <div className="flex items-center gap-2 flex-shrink-0">{titleExtra}</div>}
    </>
  );
  // Framed variants — used inside the desktop frame, and inside the
  // loading/empty frames (which are not breakpoint-split).
  const titleStripFramed = showTitleStrip && (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4 sm:py-3">
      {titleStripContent}
    </div>
  );
  const headerSlotFramed = headerSlot && <div className="border-b border-border">{headerSlot}</div>;
  const footerSlotFramed = footerSlot && <div className="border-t border-border">{footerSlot}</div>;
  // Mobile variants — rendered above/below the frameless card list. The title
  // row stays unframed (it's a heading); headerSlot/footerSlot each get their
  // own standard mini-frame so they read as a distinct block against the
  // frameless card list, mirroring the old Card wrapper they replaced.
  const titleRowMobile = showTitleStrip && (
    <div className={cn('flex items-center justify-between gap-2 px-1', hiddenOnDesktop)}>
      {titleStripContent}
    </div>
  );
  const headerSlotMobile = headerSlot && (
    <div
      className={cn('rounded-lg border border-border bg-surface overflow-hidden', hiddenOnDesktop)}
    >
      {headerSlot}
    </div>
  );
  const footerSlotMobile = footerSlot && (
    <div
      className={cn('rounded-lg border border-border bg-surface overflow-hidden', hiddenOnDesktop)}
    >
      {footerSlot}
    </div>
  );

  // ── State classification ───────────────────────────────────────────────────
  // Mirrors the original branch priority exactly: loading-while-empty beats
  // error, which beats empty, which beats the success (table/cards) render
  // at the bottom of this function.
  const isLoadingEmpty = loading && data.length === 0;
  const isEmpty = !isLoadingEmpty && !error && data.length === 0;

  // ── !hasChrome: byte-identical early returns ──────────────────────────────
  if (!hasChrome) {
    if (isLoadingEmpty) {
      return (
        <div className={cn('flex flex-col gap-2', className)}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={48} />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div
          className={cn(
            'rounded-lg border border-danger/40 bg-danger-subtle p-4 font-sans text-sm text-danger sm:p-6',
            className
          )}
        >
          {error}
        </div>
      );
    }

    if (isEmpty) {
      return (
        <div className={cn('rounded-lg border border-border bg-surface', className)}>
          <EmptyState
            icon={emptyIcon}
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
            variant="dense"
          />
        </div>
      );
    }
  }

  // ── hasChrome, non-success states (loading / error / empty) ────────────────
  // Title strip, headerSlot, and footerSlot render from the exact same
  // element-tree position the success render (bottom of this function) uses:
  // the same frame div on desktop, the same titleRowMobile / headerSlotMobile /
  // footerSlotMobile on mobile. Only the body in between swaps per state. That
  // keeps headerSlot's subtree (e.g. a live filter <form>) mounted across
  // state transitions instead of unmounting into a bare skeleton/error view,
  // which used to drop typed input, focus, and scroll position.
  if (hasChrome && (isLoadingEmpty || error || isEmpty)) {
    let bodyDesktop: React.ReactNode;
    let bodyMobile: React.ReactNode;

    if (isLoadingEmpty) {
      const skeletonStack = (
        <div className="flex flex-col gap-2 p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={48} />
          ))}
        </div>
      );
      bodyDesktop = skeletonStack;
      bodyMobile = skeletonStack;
    } else if (error) {
      const errorBanner = (
        <div className="rounded-lg border border-danger/40 bg-danger-subtle p-4 font-sans text-sm text-danger sm:p-6">
          {error}
        </div>
      );
      bodyDesktop = errorBanner;
      bodyMobile = errorBanner;
    } else {
      const emptyBody = (
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
          variant="dense"
        />
      );
      bodyDesktop = emptyBody;
      // Mobile has no overall frame border (unlike the desktop frame below),
      // so EmptyState gets the same mini-frame treatment as headerSlotMobile/
      // footerSlotMobile so it reads as a contained block, not bare floating
      // text.
      bodyMobile = (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          {emptyBody}
        </div>
      );
    }

    return (
      <div className={cn('flex flex-col gap-4', className)}>
        {/* Desktop frame — chrome + body in one stable position */}
        <div
          className={cn(
            'overflow-hidden rounded-lg border border-border bg-surface',
            hiddenOnMobile
          )}
        >
          {titleStripFramed}
          {headerSlotFramed}
          {bodyDesktop}
          {footerSlotFramed}
        </div>

        {/* Mobile chrome: unframed title + mini-framed slots, same rules the
            success render's mobile track uses below */}
        {titleRowMobile}
        {headerSlotMobile}
        <div className={hiddenOnDesktop}>{bodyMobile}</div>
        {footerSlotMobile}
      </div>
    );
  }

  // Pagination math (client-side fallback — if pagination prop, the caller
  // owns slicing; we just render the buttons)
  const totalItems = pagination?.total ?? data.length;
  const pageSize = pagination?.pageSize ?? 0;
  const currentPage = pagination?.page ?? 0;
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalItems / pageSize)) : 1;

  // Shared pagination content — rendered once inside the desktop frame (as a
  // bordered bottom strip) and once, unchanged, below the mobile card list.
  const paginationInner = pagination && pageSize > 0 && (
    <>
      <div className="text-xs text-foreground-muted">
        Page {currentPage + 1} of {totalPages}
        {pagination.total !== undefined && ` · ${pagination.total} items`}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => pagination.onPageChange(currentPage - 1)}
          disabled={currentPage === 0}
          leftIcon={<ChevronLeft size={14} />}
        >
          Prev
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => pagination.onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
        >
          Next
          <ChevronRight size={14} />
        </Button>
      </div>
    </>
  );

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* ------------------------------------------------------------------ */}
      {/* Desktop table                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={cn('overflow-hidden rounded-lg border border-border bg-surface', hiddenOnMobile)}
      >
        {titleStripFramed}
        {headerSlotFramed}
        {/* Horizontal-scroll fallback: when columns exceed the container the
            table scrolls inside the frame while the in-frame chrome (title /
            headerSlot / footerSlot / pagination) stays fixed. The outer frame
            keeps overflow-hidden for its rounded corners. The scrollbar is
            forced visible as a thin bar (instead of the macOS auto-hiding
            overlay) so overflow reads as scrollable rather than clipped. */}
        <div className="overflow-x-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border-strong [&::-webkit-scrollbar-track]:bg-transparent">
          <table className="w-full border-collapse font-sans text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-border bg-surface-elevated/50">
                  {hg.headers.map((h) => {
                    const meta = h.column.columnDef.meta ?? {};
                    const align = meta.align;
                    const canSort = h.column.getCanSort();
                    const sorted = h.column.getIsSorted();
                    const isExpanderCol = h.column.id === EXPANDER_COLUMN_ID;
                    return (
                      <th
                        key={h.id}
                        className={cn(
                          'h-9 text-[10px] font-medium uppercase tracking-wider text-foreground-muted',
                          isExpanderCol ? 'w-6 px-2' : 'px-4',
                          align === 'right'
                            ? 'text-right'
                            : align === 'center'
                              ? 'text-center'
                              : 'text-left',
                          canSort && 'cursor-pointer select-none hover:text-foreground',
                          meta.widthClass
                        )}
                        onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                      >
                        {h.isPlaceholder ? null : (
                          <span className="inline-flex items-center gap-1">
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {canSort &&
                              (sorted === 'asc' ? (
                                <ArrowUp size={10} />
                              ) : sorted === 'desc' ? (
                                <ArrowDown size={10} />
                              ) : (
                                <ArrowUpDown size={10} className="opacity-40" />
                              ))}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, rowIdx) => {
                const cells = row.getVisibleCells();
                // Toggle-on-row-click only kicks in when expansion is enabled
                // and the caller hasn't claimed onClick for its own purpose;
                // if both are set onRowClick wins (the chevron still toggles).
                const canToggleRow = Boolean(renderExpanded) && !onRowClick;
                const isRowExpanded = Boolean(renderExpanded) && expandedIds.has(row.id);
                // Row-level click. When expansion is enabled the row hosts
                // nested interactive elements (chevron, copy buttons, status
                // pills, …), so BOTH expansion-aware branches bail on clicks
                // from those; the plain onRowClick path (no renderExpanded)
                // stays exactly as it was before this feature existed.
                const handleRowClick = onRowClick
                  ? renderExpanded
                    ? (e: React.MouseEvent<HTMLTableRowElement>) => {
                        if (isInteractiveElementClick(e)) return;
                        onRowClick(row.original);
                      }
                    : () => onRowClick(row.original)
                  : canToggleRow
                    ? (e: React.MouseEvent<HTMLTableRowElement>) => {
                        if (isInteractiveElementClick(e)) return;
                        toggleExpanded(row.id);
                      }
                    : undefined;
                return (
                  <React.Fragment key={getRowKey ? getRowKey(row.original, rowIdx) : row.id}>
                    <tr
                      onClick={handleRowClick}
                      className={cn(
                        'group border-b border-border last:border-b-0 transition-colors duration-150',
                        (onRowClick || canToggleRow) &&
                          'cursor-pointer hover:bg-surface-elevated/50',
                        rowClassName?.(row.original)
                      )}
                    >
                      {cells.map((cell) => {
                        const meta = cell.column.columnDef.meta ?? {};
                        const align = meta.align;
                        const isExpanderCell = cell.column.id === EXPANDER_COLUMN_ID;
                        return (
                          <td
                            key={cell.id}
                            className={cn(
                              'py-3.5 text-foreground',
                              isExpanderCell ? 'w-6 px-2' : 'px-4',
                              align === 'right' && 'text-right',
                              align === 'center' && 'text-center',
                              meta.widthClass
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                    {renderExpanded && isRowExpanded && (
                      <tr>
                        <td colSpan={cells.length} className="p-0 border-b border-border">
                          {renderExpanded(row.original)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {footerSlotFramed}
        {paginationInner && (
          <div className="border-t border-border px-3 py-2 sm:px-4">
            <div className="flex items-center justify-between gap-3">{paginationInner}</div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile chrome: title row (unframed) + headerSlot (mini-frame), above  */}
      {/* the cards                                                            */}
      {/* ------------------------------------------------------------------ */}
      {titleRowMobile}
      {headerSlotMobile}

      {/* ------------------------------------------------------------------ */}
      {/* Mobile card layout — always a single column: card lists are usually */}
      {/* sequences (e.g. chronological logs), and a multi-column grid makes   */}
      {/* the reading order ambiguous.                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className={cn('flex flex-col gap-3', hiddenOnDesktop)}>
        {/* Hoist column derivations outside the row map — they depend only on
            `columns` (stable), not on per-row data.  Logs fires setLiveTick
            every 100 ms while SSE is connected; recomputing these per-row per-
            tick caused hundreds of unnecessary iterations per second. */}
        {(() => {
          const allCols = columns.map((col) => ({
            col,
            meta: (col.meta ?? {}) as NonNullable<(typeof col)['meta']>,
          }));
          const titleEntry = allCols.find((c) => c.meta.mobileTitle);
          const detailEntries = allCols.filter(
            (c) => !c.meta.mobileTitle && c.meta.priority !== 'low'
          );
          const getHeader = (colDef: ColumnDef<TData>): string => {
            const meta = (colDef.meta ?? {}) as NonNullable<(typeof colDef)['meta']>;
            if (meta.mobileLabel) return meta.mobileLabel;
            if (typeof colDef.header === 'string') return colDef.header;
            return '';
          };

          return table.getRowModel().rows.map((tanstackRow, rowIdx) => {
            // Fix #1: iterate sorted/paginated row model directly so card cells,
            // onRowClick, and mobileActions always reference the correct row.
            const rowData = tanstackRow.original;

            const renderCell = (colDef: ColumnDef<TData>) => {
              // Fix #5: resolve column id from explicit id OR accessorKey so
              // accessor-only columns (no explicit id) render correctly in mobile cards.
              const resolvedId =
                colDef.id ?? (colDef as { accessorKey?: string }).accessorKey ?? '';
              const cell = tanstackRow.getVisibleCells().find((c) => c.column.id === resolvedId);
              if (!cell) return null;
              return flexRender(cell.column.columnDef.cell, cell.getContext());
            };

            return (
              <div
                key={getRowKey ? getRowKey(rowData, rowIdx) : rowIdx}
                onClick={
                  onRowClick
                    ? renderExpanded
                      ? (e: React.MouseEvent<HTMLDivElement>) => {
                          // Same guard as desktop — the card hosts the Details
                          // Disclosure toggle when expansion is enabled.
                          if (isInteractiveElementClick(e)) return;
                          onRowClick(rowData);
                        }
                      : () => onRowClick(rowData)
                    : undefined
                }
                className={cn(
                  'rounded-lg border border-border bg-surface p-4 flex flex-col gap-2',
                  onRowClick &&
                    'cursor-pointer hover:border-accent/40 transition-colors duration-150',
                  rowClassName?.(rowData)
                )}
              >
                {/* Card header: title column + row actions slot */}
                {(titleEntry || mobileActions) && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 font-sans text-sm font-medium text-foreground break-words">
                      {titleEntry && renderCell(titleEntry.col)}
                    </div>
                    {mobileActions && (
                      <div className="shrink-0 inline-flex items-center gap-1">
                        {mobileActions(rowData)}
                      </div>
                    )}
                  </div>
                )}

                {/* Detail definition list */}
                {detailEntries.length > 0 && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    {detailEntries.map(({ col }, colIdx) => (
                      // Fix #6: stable key — col.id when available, else map index.
                      <React.Fragment key={col.id ?? String(colIdx)}>
                        <dt className="self-center text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
                          {getHeader(col)}
                        </dt>
                        <dd className="break-words text-foreground">{renderCell(col)}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                )}

                {/* Row expansion — same expansion state as desktop, wired to a
                    controlled Disclosure so programmatic toggles stay in sync. */}
                {renderExpanded && (
                  <Disclosure
                    title="Details"
                    open={expandedIds.has(tanstackRow.id)}
                    onOpenChange={() => toggleExpanded(tanstackRow.id)}
                  >
                    {renderExpanded(rowData)}
                  </Disclosure>
                )}
              </div>
            );
          });
        })()}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile chrome: footerSlot (mini-frame), below the cards              */}
      {/* ------------------------------------------------------------------ */}
      {footerSlotMobile}

      {/* ------------------------------------------------------------------ */}
      {/* Pagination (mobile placement — unchanged; the desktop copy lives    */}
      {/* inside the frame above, so this copy is hidden at the desktop       */}
      {/* breakpoint to avoid rendering it twice).                             */}
      {/* ------------------------------------------------------------------ */}
      {paginationInner && (
        <div className={cn('flex items-center justify-between gap-3', hiddenOnDesktop)}>
          {paginationInner}
        </div>
      )}
    </div>
  );
}

import React, { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { BarChart3 } from 'lucide-react';
import { Card } from '../ui/Card';
import { DataTable } from '../ui/DataTable';
import type { UsageSummaryBreakdownResult } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatCost, formatMs, formatNumber, formatPercent, formatTPS } from '../../lib/format';
import {
  formatCountLabel,
  successRateTone,
  topUsageRows,
  type SuccessTone,
  type TopUsageRow,
} from './top-usage';

const SUCCESS_TONE_CLASS: Record<SuccessTone, string> = {
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
};

const NUMERIC_CELL = 'font-mono tabular-nums';

// Rows arrive ranked by requests, which is the point of a top-N table, so none
// of the columns re-sort it.
const COLUMNS: ColumnDef<TopUsageRow>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    enableSorting: false,
    // Takes the width the numeric columns leave (never under 6rem), so a long
    // name ellipsizes on one line instead of wrapping mid-identifier.
    meta: { mobileTitle: true, widthClass: 'w-full max-w-0 min-w-24' },
    cell: ({ row }) => (
      <span className="block min-w-0 truncate" title={row.original.label}>
        {row.original.label}
      </span>
    ),
  },
  {
    accessorKey: 'requests',
    header: 'Req',
    enableSorting: false,
    meta: { align: 'right' },
    cell: ({ row }) => (
      <span className={NUMERIC_CELL}>{formatNumber(row.original.requests, 0)}</span>
    ),
  },
  {
    accessorKey: 'successRate',
    header: 'Success',
    enableSorting: false,
    meta: { align: 'right' },
    cell: ({ row }) => (
      <span
        className={cn(NUMERIC_CELL, SUCCESS_TONE_CLASS[successRateTone(row.original.successRate)])}
      >
        {formatPercent(row.original.successRate)}
      </span>
    ),
  },
  {
    accessorKey: 'avgDurationMs',
    header: 'Latency',
    enableSorting: false,
    meta: { align: 'right' },
    cell: ({ row }) => <span className={NUMERIC_CELL}>{formatMs(row.original.avgDurationMs)}</span>,
  },
  {
    accessorKey: 'totalCost',
    header: 'Cost',
    enableSorting: false,
    meta: { align: 'right' },
    cell: ({ row }) => <span className={NUMERIC_CELL}>{formatCost(row.original.totalCost)}</span>,
  },
  {
    accessorKey: 'avgTokensPerSec',
    header: 'TPS',
    enableSorting: false,
    meta: { align: 'right' },
    cell: ({ row }) => (
      <span className={NUMERIC_CELL}>{formatTPS(row.original.avgTokensPerSec)}</span>
    ),
  },
];

interface TopUsageCardProps {
  title: string;
  /** Singular name of the breakdown's entity ("provider"), for the header count and row labels. */
  noun: string;
  /** One `grouped` dimension of the dashboard's usage summary; absent while it loads. */
  breakdown?: UsageSummaryBreakdownResult;
  loading: boolean;
}

/**
 * Busiest entities of one usage-summary breakdown (providers or model aliases)
 * over the dashboard's selected range, from the same summary request as the
 * KPI tiles so the numbers agree. The header counts every entity in range,
 * not just the rows shown.
 */
export const TopUsageCard: React.FC<TopUsageCardProps> = ({ title, noun, breakdown, loading }) => {
  const rows = useMemo(() => topUsageRows(breakdown, noun), [breakdown, noun]);

  return (
    <Card
      title={title}
      className="min-w-0"
      flush
      extra={
        breakdown && (
          <span className="text-xs text-foreground-muted">
            {formatCountLabel(breakdown.totalDimensions, noun)}
          </span>
        )
      }
    >
      <DataTable<TopUsageRow>
        frameless
        columns={COLUMNS}
        data={rows}
        loading={loading}
        getRowKey={(row) => row.name}
        emptyIcon={<BarChart3 />}
        emptyTitle="No requests in range"
      />
    </Card>
  );
};

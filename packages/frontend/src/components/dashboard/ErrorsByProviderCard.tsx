import React, { useMemo } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { Tooltip } from '../ui/Tooltip';
import { AlertOctagon } from 'lucide-react';
import { type TimeRange } from './TimeRangeSelector';
import { useErrorsByProvider } from '../../hooks/queries/useUsage';
import { formatNumber, formatPercent } from '../../lib/format';

interface ErrorsByProviderCardProps {
  timeRange: TimeRange;
  startDate?: string;
  endDate?: string;
}

/**
 * Error-rate breakdown by provider, visually paired with `ServiceAlertsCard`
 * (same alert-styled row treatment). Always renders — falls back to an
 * `EmptyState` when every provider shows zero errors, since the 3-up row
 * layout it feeds expects all three cards to always be present.
 */
export const ErrorsByProviderCard: React.FC<ErrorsByProviderCardProps> = ({
  timeRange,
  startDate,
  endDate,
}) => {
  const { data } = useErrorsByProvider(timeRange, { startDate, endDate });

  const errorRows = useMemo(() => (data ?? []).filter((row) => row.errors > 0), [data]);
  const hasErrors = errorRows.length > 0;

  return (
    <Card title="Errors by Provider">
      {!hasErrors ? (
        <EmptyState variant="dense" icon={<AlertOctagon />} title="No errors in range" />
      ) : (
        <div className="flex flex-col gap-2">
          {errorRows.map((row) => {
            const label = row.provider ?? 'Unattributed';
            return (
              <div
                key={label}
                className="flex items-center gap-2 rounded-md bg-danger-subtle px-3 py-2"
              >
                {row.lastErrorMessage ? (
                  <Tooltip content={row.lastErrorMessage}>
                    <span
                      className="flex shrink-0 cursor-help"
                      aria-label={`Last error: ${row.lastErrorMessage}`}
                    >
                      <AlertOctagon size={14} className="text-danger" />
                    </span>
                  </Tooltip>
                ) : (
                  <AlertOctagon size={14} className="text-danger shrink-0" />
                )}
                <span className="text-xs font-medium text-foreground truncate">{label}</span>
                <Badge status="danger" noDot className="ml-auto shrink-0">
                  {formatNumber(row.errors, 0)} / {formatNumber(row.requests, 0)} req &middot;{' '}
                  {formatPercent(row.errorRate * 100)}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

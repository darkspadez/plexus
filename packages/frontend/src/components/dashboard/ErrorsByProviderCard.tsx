import React, { useMemo } from 'react';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { AlertOctagon } from 'lucide-react';
import { rangeRefetchMs, type TimeRange } from './TimeRangeSelector';
import { useErrorsByProvider } from '../../hooks/queries/useUsage';
import { formatPercent } from '../../lib/format';
import { AlertRow } from './AlertRow';
import { errorRowMeta } from './alert-rows';

interface ErrorsByProviderCardProps {
  timeRange: TimeRange;
  startDate?: string;
  endDate?: string;
}

/**
 * Error-rate breakdown by provider, visually paired with `ServiceAlertsCard`
 * (same `AlertRow` treatment). Always renders — falls back to an
 * `EmptyState` when every provider shows zero errors, since the row layout it
 * feeds expects both cards to always be present.
 */
export const ErrorsByProviderCard: React.FC<ErrorsByProviderCardProps> = ({
  timeRange,
  startDate,
  endDate,
}) => {
  const { data } = useErrorsByProvider(timeRange, {
    startDate,
    endDate,
    refetchInterval: rangeRefetchMs(timeRange),
  });

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
              <AlertRow
                key={label}
                tone="danger"
                icon={<AlertOctagon size={14} />}
                title={label}
                right={
                  <span className="font-mono text-xs tabular-nums text-danger">
                    {formatPercent(row.errorRate * 100)}
                  </span>
                }
                meta={errorRowMeta(row)}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
};

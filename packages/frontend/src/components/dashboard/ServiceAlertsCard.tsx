import React, { useMemo, useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Tooltip } from '../ui/Tooltip';
import { AlertTriangle } from 'lucide-react';
import type { Cooldown } from '../../lib/api';
import { formatMsToMinSec } from '@plexus/shared';

const LiveCountdown: React.FC<{ expiry: number }> = ({ expiry }) => {
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, expiry - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setRemainingMs(Math.max(0, expiry - Date.now())), 1000);
    return () => clearInterval(id);
  }, [expiry]);
  return <>{formatMsToMinSec(remainingMs)}</>;
};

/** "1st"/"2nd"/"3rd"/"4th"... */
const ordinal = (n: number): string => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
};

interface ServiceAlertsCardProps {
  cooldowns: Cooldown[];
  onClearAll: () => void;
  onClearSingle: (provider: string) => void;
}

/**
 * Provider-level cooldown alert list. Cooldowns are grouped by provider only
 * (no per-model detail/expansion — that granularity is intentionally dropped).
 * Always renders (via `EmptyState` when there are no active cooldowns) so it
 * behaves as a stable sibling alongside `ErrorsByProviderCard` in a 3-up row.
 */
export const ServiceAlertsCard: React.FC<ServiceAlertsCardProps> = ({
  cooldowns,
  onClearAll,
  onClearSingle,
}) => {
  // Group cooldowns by provider only (model-level detail intentionally dropped)
  const groupedCooldowns = useMemo(() => {
    return cooldowns.reduce(
      (acc, c) => {
        if (!acc[c.provider]) {
          acc[c.provider] = [];
        }
        acc[c.provider].push(c);
        return acc;
      },
      {} as Record<string, Cooldown[]>
    );
  }, [cooldowns]);

  const hasCooldowns = cooldowns.length > 0;

  return (
    <Card
      title="Service Alerts"
      extra={
        hasCooldowns && (
          <Button variant="primary" size="sm" onClick={onClearAll} className="w-[70px]">
            Clear All
          </Button>
        )
      }
    >
      {!hasCooldowns ? (
        <EmptyState
          variant="dense"
          icon={<AlertTriangle />}
          title="No active cooldowns"
          description="All providers are currently healthy."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {Object.entries(groupedCooldowns).map(([provider, providerCooldowns]) => {
            // The single longest-remaining cooldown in the group drives the
            // displayed countdown, failure count, and last-error tooltip —
            // i.e. the most severe entry, not an arbitrary/first one.
            const primary = providerCooldowns.reduce((worst, c) =>
              c.expiry > worst.expiry ? c : worst
            );
            const count = providerCooldowns.length;

            return (
              <div key={provider} className="flex items-stretch gap-2">
                <div className="flex items-center gap-2 rounded-md bg-warning-subtle px-3 py-2 min-w-0 flex-1">
                  {primary.lastError ? (
                    <Tooltip content={primary.lastError}>
                      <span
                        className="flex shrink-0 cursor-help"
                        aria-label={`Last error: ${primary.lastError}`}
                      >
                        <AlertTriangle size={14} className="text-warning" />
                      </span>
                    </Tooltip>
                  ) : (
                    <AlertTriangle size={14} className="text-warning shrink-0" />
                  )}
                  <span className="text-xs font-medium text-foreground truncate">{provider}</span>
                  <Badge status="warning" noDot className="ml-auto shrink-0">
                    {count} on cooldown
                    {primary.consecutiveFailures ? (
                      <>&middot; {ordinal(primary.consecutiveFailures)} failure</>
                    ) : null}
                    &middot; up to <LiveCountdown expiry={primary.expiry} />
                  </Badge>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onClearSingle(provider)}
                  aria-label={`Clear cooldown for ${provider}`}
                  className="w-[70px] shrink-0 self-center"
                >
                  Clear
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

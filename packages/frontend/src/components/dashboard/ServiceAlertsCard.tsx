import React, { useMemo, useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { AlertTriangle, Timer } from 'lucide-react';
import type { Cooldown } from '../../lib/api';
import { AlertRow } from './AlertRow';
import {
  cooldownAlertMeta,
  cooldownModelNames,
  cooldownTickMs,
  formatCooldownCountdown,
  groupCooldownsByProvider,
  joinAlertMeta,
} from './alert-rows';

const LiveCountdown: React.FC<{ expiry: number; lastError?: string; multipleModels: boolean }> = ({
  expiry,
  lastError,
  multipleModels,
}) => {
  const [now, setNow] = useState(Date.now);
  const remainingMs = expiry - now;
  // Re-arms when the cadence changes, i.e. once the wait drops under an hour.
  const tickMs = cooldownTickMs(remainingMs);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return <>{formatCooldownCountdown(remainingMs, { multipleModels, lastError })}</>;
};

interface ServiceAlertsCardProps {
  cooldowns: Cooldown[];
  onClearAll: () => void;
  onClearSingle: (provider: string) => void;
}

/**
 * Provider-level cooldown alert list. Cooldowns are grouped by provider only
 * (no per-model detail/expansion — the model names are only in hover text).
 * Always renders (via `EmptyState` when there are no active cooldowns) so it
 * behaves as a stable sibling alongside `ErrorsByProviderCard`.
 */
export const ServiceAlertsCard: React.FC<ServiceAlertsCardProps> = ({
  cooldowns,
  onClearAll,
  onClearSingle,
}) => {
  const groups = useMemo(() => groupCooldownsByProvider(cooldowns), [cooldowns]);
  const hasCooldowns = cooldowns.length > 0;

  return (
    <Card
      title="Service Alerts"
      extra={
        hasCooldowns && (
          <Button variant="soft" size="sm" onClick={onClearAll}>
            Clear all
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
          {groups.map((group) => {
            const meta = cooldownAlertMeta(group);
            return (
              <AlertRow
                key={group.provider}
                tone="warning"
                icon={<AlertTriangle size="0.875rem" />}
                title={group.provider}
                right={
                  <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-warning-text">
                    <Timer size="0.75rem" />
                    <LiveCountdown
                      expiry={group.primary.expiry}
                      lastError={group.primary.lastError}
                      multipleModels={group.entries.length > 1}
                    />
                  </span>
                }
                action={
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => onClearSingle(group.provider)}
                    aria-label={`Clear cooldown for ${group.provider}`}
                  >
                    Clear
                  </Button>
                }
                meta={meta}
                metaTitle={`${joinAlertMeta(meta)}\nModels: ${cooldownModelNames(group.entries)}`}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
};

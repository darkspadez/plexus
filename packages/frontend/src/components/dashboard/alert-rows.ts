import { formatMsToMinSec, INDEFINITE_COOLDOWN_THRESHOLD_MS } from '@plexus/shared';
import type { Cooldown, ErrorsByProviderPoint } from '../../lib/api';
import { formatDuration, formatNumber } from '../../lib/format';

/**
 * Row derivation for the dashboard's two-line alert rows (`AlertRow`), kept
 * free of React so it can be unit-tested in the node test environment.
 */

/** An alert row's facts line: empty parts dropped, the rest joined with " · ". */
export function joinAlertMeta(parts: readonly (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' · ');
}

export interface ProviderCooldownGroup {
  provider: string;
  entries: Cooldown[];
  /** The longest-remaining entry: it drives the countdown and the shown error. */
  primary: Cooldown;
}

/** Cooldowns grouped by provider, in the order each provider first appears. */
export function groupCooldownsByProvider(cooldowns: readonly Cooldown[]): ProviderCooldownGroup[] {
  const byProvider = new Map<string, Cooldown[]>();
  for (const c of cooldowns) {
    const entries = byProvider.get(c.provider);
    if (entries) entries.push(c);
    else byProvider.set(c.provider, [c]);
  }
  return Array.from(byProvider, ([provider, entries]) => ({
    provider,
    entries,
    primary: entries.reduce((worst, c) => (c.expiry > worst.expiry ? c : worst)),
  }));
}

/** An empty model means the whole provider is cooling down (e.g. quota exhausted). */
const isProviderWide = (c: Cooldown) => c.model === '';

/** "1 model" / "N models", or "all models" when any entry is provider-wide. */
export function cooldownModelLabel(entries: readonly Cooldown[]): string {
  if (entries.some(isProviderWide)) return 'all models';
  return entries.length === 1 ? '1 model' : `${entries.length} models`;
}

/** Comma-separated model names, for hover text. */
export function cooldownModelNames(entries: readonly Cooldown[]): string {
  return entries
    .map((c) => (isProviderWide(c) ? 'all models (provider-wide)' : c.model))
    .join(', ');
}

/** The group's highest consecutive-failure count, or null when there are none. */
export function cooldownFailureLabel(entries: readonly Cooldown[]): string | null {
  const failures = Math.max(0, ...entries.map((c) => c.consecutiveFailures ?? 0));
  if (failures === 0) return null;
  return failures === 1 ? '1 failure' : `${failures} failures`;
}

/** Facts line for a provider's cooldown row: models, failures, primary error. */
export function cooldownAlertMeta(group: ProviderCooldownGroup): (string | null | undefined)[] {
  return [
    cooldownModelLabel(group.entries),
    cooldownFailureLabel(group.entries),
    group.primary.lastError,
  ];
}

/**
 * Countdown text for a cooldown, e.g. "9m 12s" or "4h 37m". Prefixed with
 * "up to " when several models are cooling down, since only the longest is
 * shown. Indefinite waits keep the "until reset" / "until positive balance"
 * wording, where "up to" would read wrong.
 */
export function formatCooldownCountdown(
  remainingMs: number,
  options: { multipleModels: boolean; lastError?: string }
): string {
  if (remainingMs >= INDEFINITE_COOLDOWN_THRESHOLD_MS) {
    return formatMsToMinSec(remainingMs, options.lastError);
  }
  const text = formatDuration(Math.max(0, Math.ceil(remainingMs / 1000)));
  return options.multipleModels ? `up to ${text}` : text;
}

const HOUR_MS = 60 * 60 * 1000;

/** Re-render cadence: every second while seconds are shown (under an hour), else 30s. */
export function cooldownTickMs(remainingMs: number): number {
  return remainingMs < HOUR_MS ? 1_000 : 30_000;
}

/** Facts line for a provider's error-rate row: failed of total, then last error. */
export function errorRowMeta(row: ErrorsByProviderPoint): (string | null | undefined)[] {
  return [
    `${formatNumber(row.errors, 0)} of ${formatNumber(row.requests, 0)} requests failed`,
    row.lastErrorMessage,
  ];
}

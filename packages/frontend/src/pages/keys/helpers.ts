import type { KeyConfig, QuotaStatusEntry, UserQuota } from '../../lib/api';

/** A rolling requests/tokens def is inherently leaky (usage isn't stored
 * per-request in a recomputable way) — recompute is refused backend-side
 * for these. Mirrors `QuotaEnforcer.recomputeQuota`'s guard. */
export function isLeakyRollingDef(def: UserQuota | undefined): boolean {
  if (!def) return false;
  return def.type === 'rolling' && (def.limitType === 'requests' || def.limitType === 'tokens');
}

export function isKeyDisabled(key: KeyConfig): boolean {
  return (
    key.disabledAt !== undefined || (key.expiresAt !== undefined && key.expiresAt <= Date.now())
  );
}

export function getQuotaStatusColor(percent: number): string {
  if (percent >= 90) return 'var(--color-danger)';
  if (percent >= 75) return 'var(--color-warning)';
  return 'var(--color-success)';
}

/** Percentage (0-100) of a single quota status entry's limit currently used. */
export function entryUsagePercent(entry: QuotaStatusEntry): number {
  if (!entry.limit || entry.limit === 0) return 0;
  return Math.min(100, (entry.currentUsage / entry.limit) * 100);
}

export function hasScope(scope: QuotaStatusEntry['scope'] | undefined): boolean {
  if (!scope) return false;
  return Boolean(
    scope.allowedProviders?.length ||
      scope.excludedProviders?.length ||
      scope.allowedModels?.length ||
      scope.excludedModels?.length
  );
}

export function filterKeys(keys: KeyConfig[], search: string): KeyConfig[] {
  const query = search.toLowerCase();
  return keys.filter(
    (key) =>
      key.key.toLowerCase().includes(query) ||
      (key.comment && key.comment.toLowerCase().includes(query)) ||
      key.quotas?.some((name) => name.toLowerCase().includes(query)) ||
      key.allowedModels?.some((model) => model.toLowerCase().includes(query)) ||
      key.allowedProviders?.some((provider) => provider.toLowerCase().includes(query)) ||
      key.excludedModels?.some((model) => model.toLowerCase().includes(query)) ||
      key.excludedProviders?.some((provider) => provider.toLowerCase().includes(query))
  );
}

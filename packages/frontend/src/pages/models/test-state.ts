/**
 * Alias test-state helpers.
 *
 * Per-target test results live in a flat `testStates` record keyed by the
 * string the page passes to `onTestTarget`, always built * via `targetTestKey` (`${aliasId}-${groupIdx}-${targetIdx}`) — desktop,
 * ProviderMappingsEditor, "test all" and the mobile card (group 0) all use it.
 * Keys are derived from the alias's actual target groups instead of matching
 * by prefix, so alias `x` never picks up results that belong to alias `x-0`.
 */
import type { Alias } from '../../lib/api';

export interface TargetTestState {
  loading?: boolean;
  result?: 'success' | 'error';
  showResult?: boolean;
  showMessage?: boolean;
  message?: string;
}

export interface RowTestState {
  loading: boolean;
  error: boolean;
  success: boolean;
}

/** The single test-state key shape: one per (alias, group, target). */
export function targetTestKey(aliasId: string, groupIndex: number, targetIndex: number): string {
  return `${aliasId}-${groupIndex}-${targetIndex}`;
}

export function getAliasTestKeys(alias: Pick<Alias, 'id' | 'target_groups'>): string[] {
  const keys: string[] = [];
  (alias.target_groups ?? []).forEach((group, groupIdx) => {
    group.targets.forEach((_, targetIdx) => {
      keys.push(targetTestKey(alias.id, groupIdx, targetIdx));
    });
  });
  return keys;
}

export function getRowTestState(
  alias: Pick<Alias, 'id' | 'target_groups'>,
  testStates: Record<string, TargetTestState | undefined>
): RowTestState {
  const states = getAliasTestKeys(alias)
    .map((k) => testStates[k])
    .filter((s): s is TargetTestState => !!s);
  return {
    loading: states.some((s) => s.loading),
    error: states.some((s) => s.showResult && s.result === 'error'),
    success: states.some((s) => s.showResult && s.result === 'success'),
  };
}

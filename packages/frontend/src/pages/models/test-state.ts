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

/**
 * Per-key run counter. Each test run bumps its key's counter and captures the
 * value; delayed updates (result/message hide timers, late results) only apply
 * while their captured run is still the latest, so a stale run can never
 * clobber a newer run's state.
 */
export function createRunTracker() {
  const runs = new Map<string, number>();
  return {
    start(key: string): number {
      const next = (runs.get(key) ?? 0) + 1;
      runs.set(key, next);
      return next;
    },
    isCurrent(key: string, run: number): boolean {
      return runs.get(key) === run;
    },
  };
}

/** API types exercised when testing a target of the given alias. */
export function aliasTestApiTypes(alias: Pick<Alias, 'type'>): string[] {
  switch (alias.type) {
    case 'embeddings':
      return ['embeddings'];
    case 'image':
      return ['images'];
    case 'decisions':
      return ['decisions'];
    default:
      return ['chat'];
  }
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

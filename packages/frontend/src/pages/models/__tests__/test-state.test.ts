import { describe, expect, it } from 'vitest';
import {
  aliasTestApiTypes,
  createRunTracker,
  getAliasTestKeys,
  getRowTestState,
  targetTestKey,
} from '../test-state';

const alias = (id: string, targetCounts: number[]) => ({
  id,
  target_groups: targetCounts.map((n, g) => ({
    name: `g${g}`,
    selector: 'random',
    targets: Array.from({ length: n }, () => ({ provider: 'p', model: 'm', enabled: true })),
  })),
});

describe('targetTestKey', () => {
  it('builds a single id-group-target key', () => {
    expect(targetTestKey('x', 1, 2)).toBe('x-1-2');
  });
});

describe('getAliasTestKeys', () => {
  it('derives one key per target across every group', () => {
    expect(getAliasTestKeys(alias('x', [2, 1]))).toEqual(['x-0-0', 'x-0-1', 'x-1-0']);
  });

  it('returns no keys for an alias with empty target_groups', () => {
    expect(getAliasTestKeys({ id: 'x', target_groups: [] })).toEqual([]);
  });
});

describe('getRowTestState', () => {
  it('does not pick up results belonging to a different alias with a prefixed id', () => {
    // `x-0-0-0` is desktop group 0 / target 0 of alias `x-0`, not a target of `x`.
    const states = { 'x-0-0-0': { loading: true, showResult: false } };
    expect(getRowTestState(alias('x', [1]), states)).toEqual({
      loading: false,
      error: false,
      success: false,
    });
  });

  it('aggregates loading, error and success for its own targets', () => {
    const states = {
      'x-0-0': { showResult: true, result: 'success' as const },
      'x-1-0': { showResult: true, result: 'error' as const },
      'x-0-1': { loading: true },
    };
    expect(getRowTestState(alias('x', [2, 1]), states)).toEqual({
      loading: true,
      error: true,
      success: true,
    });
  });

  it('ignores an expired result (showResult false)', () => {
    const states = { 'x-0-0': { showResult: false, result: 'error' as const } };
    expect(getRowTestState(alias('x', [1]), states)).toEqual({
      loading: false,
      error: false,
      success: false,
    });
  });

  it('returns all-false for an alias with empty target_groups', () => {
    expect(getRowTestState({ id: 'x', target_groups: [] }, { 'x-0-0': { loading: true } })).toEqual(
      { loading: false, error: false, success: false }
    );
  });
});

describe('aliasTestApiTypes', () => {
  it.each([
    [undefined, ['chat']],
    ['text', ['chat']],
    ['embeddings', ['embeddings']],
    ['image', ['images']],
    ['decisions', ['decisions']],
    ['speech', ['chat']],
  ] as const)('maps alias type %s to %j', (type, expected) => {
    expect(aliasTestApiTypes({ type })).toEqual([...expected]);
  });
});

describe('createRunTracker', () => {
  it('treats only the latest run per key as current', () => {
    const t = createRunTracker();
    const r1 = t.start('a');
    const r2 = t.start('a');
    expect(t.isCurrent('a', r1)).toBe(false);
    expect(t.isCurrent('a', r2)).toBe(true);
  });

  it('tracks keys independently', () => {
    const t = createRunTracker();
    const a = t.start('a');
    t.start('b');
    expect(t.isCurrent('a', a)).toBe(true);
  });
});

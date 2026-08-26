import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GlobalAnomalyPolicy, PerKeyAnomalyPolicy } from '../policy-schema';
import {
  AnomalyEvaluationScheduler,
  type AnomalyEvaluationStore,
} from '../anomaly-evaluation-scheduler';

const MINUTE_MS = 60_000;

const observePolicy: GlobalAnomalyPolicy = {
  mode: 'observe',
  lookbackMinutes: 5,
  exclusionGapMinutes: 1,
  windowMinutes: 1,
  sustainedWindows: 1,
  minimumRequestsPerMinute: 2,
  baselineMultiplier: 1,
  minimumBaselineRequests: 5,
  minimumActiveMinutes: 5,
};

const inherit: PerKeyAnomalyPolicy = { mode: 'inherit' };

type FakeStore = AnomalyEvaluationStore & {
  readonly observed: readonly string[];
  readonly paused: readonly string[];
  readonly queriedRanges: readonly { readonly startMs: number; readonly endMs: number }[];
  readonly deletedBefore: readonly number[];
};

function createStore(
  options: {
    readonly global?: GlobalAnomalyPolicy;
    readonly keys?: readonly {
      readonly id: number;
      readonly name: string;
      readonly policy: PerKeyAnomalyPolicy;
    }[];
    readonly buckets?: readonly { readonly bucketStartMs: number; readonly count: number }[];
    readonly bucketGate?: Promise<void>;
  } = {}
): FakeStore {
  const observed: string[] = [];
  const paused: string[] = [];
  const queriedRanges: { startMs: number; endMs: number }[] = [];
  const deletedBefore: number[] = [];
  const keys = options.keys ?? [{ id: 1, name: 'anomalous', policy: inherit }];

  return {
    observed,
    paused,
    queriedRanges,
    deletedBefore,
    async getGlobalPolicy() {
      return options.global ?? observePolicy;
    },
    async listKeyPolicies() {
      return keys.map((key) => key.policy);
    },
    async listEligibleKeys() {
      return keys;
    },
    async loadBuckets(_keyId, startMs, endMs) {
      queriedRanges.push({ startMs, endMs });
      await options.bucketGate;
      return (
        options.buckets ?? [
          { bucketStartMs: 0, count: 1 },
          { bucketStartMs: 60_000, count: 1 },
          { bucketStartMs: 120_000, count: 1 },
          { bucketStartMs: 180_000, count: 1 },
          { bucketStartMs: 240_000, count: 1 },
          { bucketStartMs: 300_000, count: 1 },
          { bucketStartMs: 360_000, count: 3 },
        ]
      );
    },
    async recordWouldPauseOnce(key, evidence) {
      observed.push(`${key.name}:${evidence.evaluationEndMs}`);
    },
    async pauseAutomatically(key, evidence) {
      paused.push(`${key.name}:${evidence.evaluationEndMs}`);
      return 'paused';
    },
    async deleteBucketsBefore(cutoffMs) {
      deletedBefore.push(cutoffMs);
    },
  };
}

describe('AnomalyEvaluationScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('evaluates only a bounded aligned range and records one observe event per trigger window', async () => {
    // Given
    const store = createStore();
    const scheduler = new AnomalyEvaluationScheduler({ store, clock: () => 480_000 });

    // When
    await scheduler.evaluateNow();
    await scheduler.evaluateNow();

    // Then
    expect(store.queriedRanges).toEqual([
      { startMs: 0, endMs: 480_000 },
      { startMs: 0, endMs: 480_000 },
    ]);
    expect(store.observed).toEqual(['anomalous:420000']);
    expect(store.paused).toEqual([]);
  });

  it('passes detector evidence to enforce exactly once while duplicate evaluations overlap', async () => {
    // Given
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = createStore({ global: { ...observePolicy, mode: 'enforce' }, bucketGate: gate });
    const scheduler = new AnomalyEvaluationScheduler({ store, clock: () => 480_000 });

    // When
    const first = scheduler.evaluateNow();
    const second = scheduler.evaluateNow();
    release?.();
    await Promise.all([first, second]);

    // Then
    expect(store.paused).toEqual(['anomalous:420000']);
    expect(store.observed).toEqual([]);
  });

  it('does not query history or schedule work when globally disabled', async () => {
    // Given
    vi.useFakeTimers({ now: 480_000 });
    const store = createStore({ global: { ...observePolicy, mode: 'disabled' } });
    const scheduler = new AnomalyEvaluationScheduler({ store, clock: () => Date.now() });

    // When
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(MINUTE_MS);

    // Then
    expect(store.queriedRanges).toEqual([]);
    expect(store.deletedBefore).toEqual([]);
    scheduler.stop();
  });

  it('skips history for a key whose policy disables detection', async () => {
    // Given
    const store = createStore({
      keys: [{ id: 1, name: 'excluded', policy: { mode: 'disabled', reason: 'manual exemption' } }],
    });
    const scheduler = new AnomalyEvaluationScheduler({ store, clock: () => 480_000 });

    // When
    await scheduler.evaluateNow();

    // Then
    expect(store.queriedRanges).toEqual([]);
    expect(store.observed).toEqual([]);
  });

  it('keeps the retention boundary and clears its aligned timer on stop', async () => {
    // Given
    vi.useFakeTimers({ now: 480_123 });
    const store = createStore();
    const scheduler = new AnomalyEvaluationScheduler({ store, clock: () => Date.now() });

    // When
    await scheduler.start();
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(MINUTE_MS * 2);

    // Then
    expect(store.deletedBefore).toEqual([480_000 - (5 + 1_440) * MINUTE_MS]);
    expect(store.queriedRanges).toHaveLength(1);
  });

  it('uses the longest effective override lookback for retention even when that key is paused', async () => {
    // Given
    const store = createStore({
      keys: [
        { id: 1, name: 'active', policy: inherit },
        {
          id: 2,
          name: 'longer-policy',
          policy: {
            mode: 'override',
            reason: 'long baseline',
            policy: { ...observePolicy, lookbackMinutes: 9 },
          },
        },
      ],
    });
    const scheduler = new AnomalyEvaluationScheduler({ store, clock: () => 480_000 });

    // When
    await scheduler.evaluateNow();

    // Then
    expect(store.deletedBefore).toEqual([480_000 - (9 + 1_440) * MINUTE_MS]);
  });

  it('reconstructs evaluation from the store after a scheduler restart', async () => {
    // Given
    const store = createStore();
    const first = new AnomalyEvaluationScheduler({ store, clock: () => 480_000 });
    await first.evaluateNow();
    first.stop();
    const restarted = new AnomalyEvaluationScheduler({ store, clock: () => 480_000 });

    // When
    await restarted.evaluateNow();

    // Then
    expect(store.queriedRanges).toHaveLength(2);
    expect(store.observed).toEqual(['anomalous:420000', 'anomalous:420000']);
  });
});

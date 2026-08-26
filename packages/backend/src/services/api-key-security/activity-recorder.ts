import { logger } from '../../utils/logger';
import { writeActivityBuckets } from './activity-recorder-storage';

const MINUTE_MS = 60_000;
const DEFAULT_DEBOUNCE_MS = 1_000;

export const ACTIVITY_FLUSH_FAILURE_WARNING =
  'API key activity bucket flush failed; pending samples retained for retry';

export type ActivityBucketDelta = {
  readonly keyId: number;
  readonly bucketStartMs: number;
  readonly count: number;
};

export type ActivityBucketWriter = (buckets: readonly ActivityBucketDelta[]) => Promise<void>;

export type ApiKeyActivityRecorderOptions = {
  readonly writer?: ActivityBucketWriter;
  readonly debounceMs?: number;
};

type PendingBucket = {
  readonly keyId: number;
  readonly bucketStartMs: number;
  count: number;
};

type KeyState = {
  readonly keyId: number;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<FlushResult> | null;
};

type FlushResult = 'success' | 'failure';

type FlushFailure = {
  readonly keyId: number;
  readonly batch: readonly ActivityBucketDelta[];
  readonly generation: number;
  readonly errorType: string;
};

export class ApiKeyActivityRecorder {
  private static instance: ApiKeyActivityRecorder | undefined;

  private readonly pending = new Map<string, PendingBucket>();
  private readonly keyStates = new Map<number, KeyState>();
  private readonly writer: ActivityBucketWriter;
  private readonly debounceMs: number;
  private lifecycleGeneration = 0;
  private stopped = false;
  private stopPromise: Promise<void> | null = null;

  public droppedSampleCount = 0;

  public constructor(options: ApiKeyActivityRecorderOptions = {}) {
    this.writer = options.writer ?? writeActivityBuckets;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  public static getInstance(): ApiKeyActivityRecorder {
    if (!ApiKeyActivityRecorder.instance) {
      ApiKeyActivityRecorder.instance = new ApiKeyActivityRecorder();
    }
    return ApiKeyActivityRecorder.instance;
  }

  public static resetForTesting(): void {
    ApiKeyActivityRecorder.instance?.resetForTesting();
    ApiKeyActivityRecorder.instance = undefined;
  }

  public recordSuccessfulAuth(keyId: number, now: number): void {
    if (this.stopped || !Number.isSafeInteger(keyId) || keyId <= 0 || !Number.isFinite(now)) {
      return;
    }

    const bucketStartMs = Math.floor(now / MINUTE_MS) * MINUTE_MS;
    const pendingKey = this.makePendingKey(keyId, bucketStartMs);
    const existing = this.pending.get(pendingKey);
    if (existing) {
      existing.count += 1;
    } else {
      this.pending.set(pendingKey, { keyId, bucketStartMs, count: 1 });
    }

    let state = this.keyStates.get(keyId);
    if (!state) {
      state = { keyId, timer: null, inFlight: null };
      this.keyStates.set(keyId, state);
    }
    if (state.timer === null && state.inFlight === null) {
      this.schedule(state);
    }
  }

  public getPendingCount(keyId: number): number {
    let count = 0;
    for (const bucket of this.pending.values()) {
      if (bucket.keyId === keyId) count += bucket.count;
    }
    return count;
  }

  public async flush(): Promise<void> {
    while (this.keyStates.size > 0) {
      const keyIds = [...this.keyStates.keys()];
      const results = await Promise.all(keyIds.map((keyId) => this.startFlush(keyId)));
      if (results.includes('failure')) return;
      if (this.pending.size === 0 && !this.hasInFlightState()) return;
    }
  }

  public async stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;

    this.stopped = true;
    const generation = this.lifecycleGeneration;
    this.stopPromise = (async () => {
      await this.flush();
      if (generation !== this.lifecycleGeneration) return;
      for (const state of this.keyStates.values()) {
        if (state.timer !== null) clearTimeout(state.timer);
      }
      this.keyStates.clear();
    })();
    return this.stopPromise;
  }

  public resetForTesting(): void {
    this.lifecycleGeneration += 1;
    for (const state of this.keyStates.values()) {
      if (state.timer !== null) clearTimeout(state.timer);
    }
    this.pending.clear();
    this.keyStates.clear();
    this.droppedSampleCount = 0;
    this.stopped = false;
    this.stopPromise = null;
  }

  private startFlush(keyId: number): Promise<FlushResult> {
    const state = this.keyStates.get(keyId);
    if (!state) return Promise.resolve('success');
    if (state.inFlight) return state.inFlight;
    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    const promise = this.flushState(state);
    state.inFlight = promise;
    void promise.then(
      () => this.finishFlush(state, promise),
      () => this.finishFlush(state, promise)
    );
    return promise;
  }

  private async flushState(state: KeyState): Promise<FlushResult> {
    const batch = this.takeBatch(state.keyId);
    if (batch.length === 0) return 'success';

    const generation = this.lifecycleGeneration;
    try {
      await this.writer(batch);
      return 'success';
    } catch (error) {
      const errorType = error instanceof Error ? error.name : typeof error;
      this.recordFlushFailure({ keyId: state.keyId, batch, generation, errorType });
      return 'failure';
    }
  }

  private finishFlush(state: KeyState, promise: Promise<FlushResult>): void {
    if (this.keyStates.get(state.keyId) !== state || state.inFlight !== promise) return;
    state.inFlight = null;
    if (this.hasPendingForKey(state.keyId)) {
      if (!this.stopped) this.schedule(state);
      return;
    }
    this.keyStates.delete(state.keyId);
  }

  private takeBatch(keyId: number): ActivityBucketDelta[] {
    const batch: ActivityBucketDelta[] = [];
    for (const [pendingKey, bucket] of this.pending) {
      if (bucket.keyId !== keyId) continue;
      batch.push({ ...bucket });
      this.pending.delete(pendingKey);
    }
    return batch;
  }

  private recordFlushFailure(failure: FlushFailure): void {
    if (failure.generation !== this.lifecycleGeneration) return;
    let sampleCount = 0;
    for (const bucket of failure.batch) {
      sampleCount += bucket.count;
      const pendingKey = this.makePendingKey(bucket.keyId, bucket.bucketStartMs);
      const existing = this.pending.get(pendingKey);
      if (existing) {
        existing.count += bucket.count;
      } else {
        this.pending.set(pendingKey, { ...bucket });
      }
    }
    this.droppedSampleCount += sampleCount;
    logger.warn(ACTIVITY_FLUSH_FAILURE_WARNING, {
      keyId: failure.keyId,
      sampleCount,
      droppedSampleCount: this.droppedSampleCount,
      errorType: failure.errorType,
    });
  }

  private schedule(state: KeyState): void {
    if (this.stopped || state.timer !== null || state.inFlight !== null) return;
    state.timer = setTimeout(() => {
      state.timer = null;
      void this.startFlush(state.keyId);
    }, this.debounceMs);
  }

  private hasPendingForKey(keyId: number): boolean {
    for (const bucket of this.pending.values()) {
      if (bucket.keyId === keyId) return true;
    }
    return false;
  }

  private hasInFlightState(): boolean {
    for (const state of this.keyStates.values()) {
      if (state.inFlight) return true;
    }
    return false;
  }

  private makePendingKey(keyId: number, bucketStartMs: number): string {
    return `${keyId}:${bucketStartMs}`;
  }
}

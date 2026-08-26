import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSpy } from '../../../../test/test-utils';
import { logger } from '../../../utils/logger';
import {
  ACTIVITY_FLUSH_FAILURE_WARNING,
  ApiKeyActivityRecorder,
  type ActivityBucketDelta,
} from '../activity-recorder';

const MINUTE_MS = 60_000;

describe('ApiKeyActivityRecorder', () => {
  let recorder: ApiKeyActivityRecorder | null = null;

  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(async () => {
    if (recorder) {
      await recorder.stop();
      recorder.resetForTesting();
      recorder = null;
    }
    vi.useRealTimers();
  });

  it('coalesces 1,000 same-minute records into one per-key flush window', async () => {
    // Given
    const writes: ActivityBucketDelta[][] = [];
    recorder = new ApiKeyActivityRecorder({
      writer: async (batch) => {
        writes.push([...batch]);
      },
    });

    // When
    for (let index = 0; index < 1_000; index += 1) {
      recorder.recordSuccessfulAuth(41, 12_345);
    }

    // Then
    expect(recorder.getPendingCount(41)).toBe(1_000);
    await vi.advanceTimersByTimeAsync(999);
    expect(writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toEqual([[{ keyId: 41, bucketStartMs: 0, count: 1_000 }]]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(writes).toHaveLength(1);
  });

  it('combines all records for one key and minute without attribution variants', async () => {
    // Given
    const writes: ActivityBucketDelta[][] = [];
    recorder = new ApiKeyActivityRecorder({
      writer: async (batch) => {
        writes.push([...batch]);
      },
    });

    // When
    recorder.recordSuccessfulAuth(42, MINUTE_MS + 1);
    recorder.recordSuccessfulAuth(42, MINUTE_MS + 2);
    recorder.recordSuccessfulAuth(42, MINUTE_MS + 3);
    await recorder.flush();

    // Then
    expect(writes).toEqual([[{ keyId: 42, bucketStartMs: MINUTE_MS, count: 3 }]]);
  });

  it('splits records at the minute boundary', async () => {
    // Given
    const writes: ActivityBucketDelta[][] = [];
    recorder = new ApiKeyActivityRecorder({
      writer: async (batch) => {
        writes.push([...batch]);
      },
    });

    // When
    recorder.recordSuccessfulAuth(43, MINUTE_MS - 1);
    recorder.recordSuccessfulAuth(43, MINUTE_MS);
    await recorder.flush();

    // Then
    expect(writes).toEqual([
      [
        { keyId: 43, bucketStartMs: 0, count: 1 },
        { keyId: 43, bucketStartMs: MINUTE_MS, count: 1 },
      ],
    ]);
  });

  it('retains failed batches, records delayed samples, and retries asynchronously', async () => {
    // Given
    let shouldFail = true;
    const persisted: ActivityBucketDelta[] = [];
    recorder = new ApiKeyActivityRecorder({
      writer: async (batch) => {
        if (shouldFail) {
          throw new Error('injected database failure');
        }
        persisted.push(...batch);
      },
    });
    const warning = registerSpy(logger, 'warn');

    // When
    expect(() => {
      recorder?.recordSuccessfulAuth(44, 12_345);
      recorder?.recordSuccessfulAuth(44, 12_346);
    }).not.toThrow();
    await recorder.flush();

    // Then
    expect(recorder.getPendingCount(44)).toBe(2);
    expect(recorder.droppedSampleCount).toBe(2);
    expect(warning).toHaveBeenCalledWith(
      ACTIVITY_FLUSH_FAILURE_WARNING,
      expect.objectContaining({ keyId: 44, sampleCount: 2 })
    );

    // When
    shouldFail = false;
    await vi.advanceTimersByTimeAsync(1_000);

    // Then
    expect(recorder.getPendingCount(44)).toBe(0);
    expect(persisted).toEqual([{ keyId: 44, bucketStartMs: 0, count: 2 }]);
  });

  it('flushes on idempotent stop and reset clears pending state and metrics', async () => {
    // Given
    const writes: ActivityBucketDelta[][] = [];
    recorder = new ApiKeyActivityRecorder({
      writer: async (batch) => {
        writes.push([...batch]);
      },
    });
    recorder.recordSuccessfulAuth(45, 12_345);

    // When
    await recorder.stop();
    await recorder.stop();

    // Then
    expect(writes).toEqual([[{ keyId: 45, bucketStartMs: 0, count: 1 }]]);

    // When
    recorder.resetForTesting();
    recorder.recordSuccessfulAuth(0, 12_345);
    recorder.recordSuccessfulAuth(-1, 12_345);
    recorder.recordSuccessfulAuth(45, Number.NaN);
    await recorder.flush();

    // Then
    expect(recorder.getPendingCount(45)).toBe(0);
    expect(recorder.droppedSampleCount).toBe(0);
    expect(writes).toHaveLength(1);
  });
});

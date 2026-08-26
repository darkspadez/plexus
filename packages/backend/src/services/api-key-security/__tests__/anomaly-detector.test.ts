import { describe, expect, it } from 'vitest';
import { evaluateAnomaly, type MinuteBucket } from '../anomaly-detector';
import {
  DEFAULT_ANOMALY_THRESHOLD_POLICY,
  type GlobalAnomalyPolicy,
  type PerKeyAnomalyPolicy,
} from '../policy-schema';

const MINUTE_MS = 60_000;
const EVALUATION_END_MS = Date.UTC(2026, 6, 31, 12, 0, 0);
const NOW_MS = EVALUATION_END_MS + MINUTE_MS;
const ENFORCE_POLICY = {
  mode: 'enforce',
  ...DEFAULT_ANOMALY_THRESHOLD_POLICY,
} satisfies GlobalAnomalyPolicy;
const INHERIT_POLICY = { mode: 'inherit' } satisfies PerKeyAnomalyPolicy;

function createBaseline(activeMinutes = 240): readonly MinuteBucket[] {
  const baselineStartMs = EVALUATION_END_MS - 1_480 * MINUTE_MS;
  return Array.from({ length: activeMinutes }, (_, index) => ({
    bucketStartMs: baselineStartMs + index * MINUTE_MS,
    count: index < 48 ? 2 : 1,
  }));
}

function createCurrentBuckets(
  ratePerMinute: number
): readonly [MinuteBucket, MinuteBucket, MinuteBucket] {
  return [
    { bucketStartMs: EVALUATION_END_MS - 30 * MINUTE_MS, count: ratePerMinute * 10 },
    { bucketStartMs: EVALUATION_END_MS - 20 * MINUTE_MS, count: ratePerMinute * 10 },
    { bucketStartMs: EVALUATION_END_MS - 10 * MINUTE_MS, count: ratePerMinute * 10 },
  ];
}

function evaluate(
  buckets: readonly MinuteBucket[],
  globalPolicy: GlobalAnomalyPolicy = ENFORCE_POLICY,
  keyPolicy: PerKeyAnomalyPolicy = INHERIT_POLICY
) {
  return evaluateAnomaly({ now: NOW_MS, buckets, globalPolicy, keyPolicy });
}

describe('evaluateAnomaly', () => {
  it('returns thresholdRpm=50 and result=would_pause for a 0.2 RPM baseline and 50 RPM sustained for 30 minutes', () => {
    // Given
    const buckets = [...createBaseline(), ...createCurrentBuckets(50)];

    // When
    const evaluation = evaluate(buckets);

    // Then
    expect(evaluation).toMatchObject({
      result: 'would_pause',
      baselineRpm: 0.2,
      thresholdRpm: 50,
      currentRates: [50, 50, 50],
      activeMinutes: 240,
      requestCount: 288,
      eligible: true,
    });
  });

  it('triggers when every current window equals the effective threshold', () => {
    // Given
    const buckets = [...createBaseline(), ...createCurrentBuckets(50)];

    // When
    const evaluation = evaluate(buckets);

    // Then
    expect(evaluation.result).toBe('would_pause');
  });

  it('reports the same would-pause decision in observe mode', () => {
    // Given
    const observePolicy = {
      mode: 'observe',
      ...DEFAULT_ANOMALY_THRESHOLD_POLICY,
    } satisfies GlobalAnomalyPolicy;
    const buckets = [...createBaseline(), ...createCurrentBuckets(50)];

    // When
    const evaluation = evaluate(buckets, observePolicy);

    // Then
    expect(evaluation.result).toBe('would_pause');
  });

  it('returns normal when one current window is 49.9 RPM below the 50 RPM floor', () => {
    // Given
    const current = createCurrentBuckets(50);
    const buckets = [...createBaseline(), current[0], { ...current[1], count: 499 }, current[2]];

    // When
    const evaluation = evaluate(buckets);

    // Then
    expect(evaluation).toMatchObject({ result: 'normal', currentRates: [50, 49.9, 50] });
  });

  it('keeps learning with fewer than 100 baseline requests', () => {
    // Given
    const keyPolicy = {
      mode: 'override',
      reason: 'Isolate the request-count eligibility gate',
      policy: {
        ...DEFAULT_ANOMALY_THRESHOLD_POLICY,
        lookbackMinutes: 120,
        minimumActiveMinutes: 90,
      },
    } satisfies PerKeyAnomalyPolicy;
    const baselineStartMs = EVALUATION_END_MS - 160 * MINUTE_MS;
    const buckets = [
      ...Array.from({ length: 99 }, (_, index) => ({
        bucketStartMs: baselineStartMs + index * MINUTE_MS,
        count: 1,
      })),
      ...createCurrentBuckets(50),
    ];

    // When
    const evaluation = evaluate(buckets, ENFORCE_POLICY, keyPolicy);

    // Then
    expect(evaluation).toMatchObject({
      result: 'learning',
      requestCount: 99,
      activeMinutes: 99,
      eligible: false,
    });
  });

  it('keeps learning with exactly 239 active baseline minutes', () => {
    // Given
    const buckets = [...createBaseline(239), ...createCurrentBuckets(50)];

    // When
    const evaluation = evaluate(buckets);

    // Then
    expect(evaluation).toMatchObject({
      result: 'learning',
      requestCount: 287,
      activeMinutes: 239,
      eligible: false,
    });
  });

  it('short-circuits when the global policy is disabled', () => {
    // Given
    const disabledPolicy = {
      mode: 'disabled',
      ...DEFAULT_ANOMALY_THRESHOLD_POLICY,
    } satisfies GlobalAnomalyPolicy;

    // When
    const evaluation = evaluate([], disabledPolicy);

    // Then
    expect(evaluation).toMatchObject({ result: 'disabled', disabledBy: 'global', eligible: false });
  });

  it('short-circuits when the per-key policy is disabled', () => {
    // Given
    const keyPolicy = {
      mode: 'disabled',
      reason: 'Known batch workload',
    } satisfies PerKeyAnomalyPolicy;

    // When
    const evaluation = evaluate([], ENFORCE_POLICY, keyPolicy);

    // Then
    expect(evaluation).toMatchObject({ result: 'disabled', disabledBy: 'key', eligible: false });
  });

  it('uses every value from a complete per-key override', () => {
    // Given
    const keyPolicy = {
      mode: 'override',
      reason: 'Custom low-volume key',
      policy: {
        lookbackMinutes: 60,
        exclusionGapMinutes: 5,
        windowMinutes: 5,
        sustainedWindows: 2,
        minimumRequestsPerMinute: 20,
        baselineMultiplier: 5,
        minimumBaselineRequests: 10,
        minimumActiveMinutes: 10,
      },
    } satisfies PerKeyAnomalyPolicy;
    const baselineStartMs = EVALUATION_END_MS - 75 * MINUTE_MS;
    const buckets = [
      ...Array.from({ length: 10 }, (_, index) => ({
        bucketStartMs: baselineStartMs + index * MINUTE_MS,
        count: 30,
      })),
      { bucketStartMs: EVALUATION_END_MS - 10 * MINUTE_MS, count: 125 },
      { bucketStartMs: EVALUATION_END_MS - 5 * MINUTE_MS, count: 125 },
    ];

    // When
    const evaluation = evaluate(buckets, ENFORCE_POLICY, keyPolicy);

    // Then
    expect(evaluation).toMatchObject({
      result: 'would_pause',
      requestCount: 300,
      activeMinutes: 10,
      baselineRpm: 5,
      thresholdRpm: 25,
      currentRates: [25, 25],
    });
  });

  it('excludes a spike in the gap from baseline measurements', () => {
    // Given
    const gapSpike = {
      bucketStartMs: EVALUATION_END_MS - 35 * MINUTE_MS,
      count: 1_000_000,
    };
    const buckets = [...createBaseline(), gapSpike, ...createCurrentBuckets(50)];

    // When
    const evaluation = evaluate(buckets);

    // Then
    expect(evaluation).toMatchObject({
      result: 'would_pause',
      baselineRpm: 0.2,
      requestCount: 288,
      thresholdRpm: 50,
    });
  });

  it('uses deterministic half-open boundaries after rounding evaluation time down', () => {
    // Given
    const baselineStartMs = EVALUATION_END_MS - 1_480 * MINUTE_MS;
    const baselineEndMs = EVALUATION_END_MS - 40 * MINUTE_MS;
    const buckets = [
      { bucketStartMs: baselineStartMs - MINUTE_MS, count: 10_000 },
      { bucketStartMs: baselineStartMs, count: 100 },
      { bucketStartMs: baselineEndMs - MINUTE_MS, count: 1 },
      { bucketStartMs: baselineEndMs, count: 10_000 },
      { bucketStartMs: EVALUATION_END_MS - 30 * MINUTE_MS, count: 500 },
      { bucketStartMs: EVALUATION_END_MS - 20 * MINUTE_MS, count: 500 },
      { bucketStartMs: EVALUATION_END_MS - 10 * MINUTE_MS, count: 500 },
      { bucketStartMs: EVALUATION_END_MS, count: 10_000 },
    ];

    // When
    const evaluation = evaluateAnomaly({
      now: NOW_MS + 599_999,
      buckets,
      globalPolicy: ENFORCE_POLICY,
      keyPolicy: INHERIT_POLICY,
    });

    // Then
    expect(evaluation).toMatchObject({
      evaluationEndMs: EVALUATION_END_MS,
      requestCount: 101,
      currentRates: [50, 50, 50],
    });
  });
});

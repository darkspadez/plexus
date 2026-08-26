import type {
  AnomalyThresholdPolicy,
  GlobalAnomalyPolicy,
  PerKeyAnomalyPolicy,
} from './policy-schema';

const MINUTE_MS = 60_000;

export type MinuteBucket = {
  readonly bucketStartMs: number;
  readonly count: number;
};

export type AnomalyEvaluationInput = {
  readonly now: number;
  readonly buckets: readonly MinuteBucket[];
  readonly globalPolicy: GlobalAnomalyPolicy;
  readonly keyPolicy: PerKeyAnomalyPolicy;
};

type AnomalyEvidence = {
  readonly evaluationEndMs: number;
  readonly baselineRpm: number;
  readonly thresholdRpm: number;
  readonly currentRates: readonly number[];
  readonly activeMinutes: number;
  readonly requestCount: number;
  readonly eligible: boolean;
};

export type AnomalyEvaluation =
  | (AnomalyEvidence & {
      readonly result: 'disabled';
      readonly disabledBy: 'global' | 'key';
    })
  | (AnomalyEvidence & { readonly result: 'learning' })
  | (AnomalyEvidence & { readonly result: 'normal' })
  | (AnomalyEvidence & { readonly result: 'would_pause' });

type EffectivePolicyResolution =
  | { readonly kind: 'disabled'; readonly disabledBy: 'key' }
  | { readonly kind: 'enabled'; readonly policy: AnomalyThresholdPolicy };

function assertNever(value: never): never {
  return value;
}

function resolveKeyPolicy(
  globalPolicy: GlobalAnomalyPolicy,
  keyPolicy: PerKeyAnomalyPolicy
): EffectivePolicyResolution {
  switch (keyPolicy.mode) {
    case 'inherit':
      return { kind: 'enabled', policy: globalPolicy };
    case 'disabled':
      return { kind: 'disabled', disabledBy: 'key' };
    case 'override':
      return { kind: 'enabled', policy: keyPolicy.policy };
    default:
      return assertNever(keyPolicy);
  }
}

function createDisabledEvaluation(
  evaluationEndMs: number,
  policy: AnomalyThresholdPolicy,
  disabledBy: 'global' | 'key'
): AnomalyEvaluation {
  return {
    result: 'disabled',
    disabledBy,
    evaluationEndMs,
    baselineRpm: 0,
    thresholdRpm: policy.minimumRequestsPerMinute,
    currentRates: Array.from({ length: policy.sustainedWindows }, () => 0),
    activeMinutes: 0,
    requestCount: 0,
    eligible: false,
  };
}

/**
 * Evaluates aligned request buckets without reading clocks, storage, or logs.
 * Slow-ramp abuse that grows within the learned baseline is explicitly out of scope.
 */
export function evaluateAnomaly(input: AnomalyEvaluationInput): AnomalyEvaluation {
  const globalWindowMs = input.globalPolicy.windowMinutes * MINUTE_MS;
  const globalEvaluationEndMs =
    Math.floor((input.now - MINUTE_MS) / globalWindowMs) * globalWindowMs;

  const globalMode = input.globalPolicy.mode;
  switch (globalMode) {
    case 'disabled':
      return createDisabledEvaluation(globalEvaluationEndMs, input.globalPolicy, 'global');
    case 'observe':
      break;
    case 'enforce':
      break;
    default:
      return assertNever(globalMode);
  }

  const resolution = resolveKeyPolicy(input.globalPolicy, input.keyPolicy);
  switch (resolution.kind) {
    case 'disabled':
      return createDisabledEvaluation(globalEvaluationEndMs, input.globalPolicy, 'key');
    case 'enabled': {
      const policy = resolution.policy;
      const windowMs = policy.windowMinutes * MINUTE_MS;
      const evaluationEndMs = Math.floor((input.now - MINUTE_MS) / windowMs) * windowMs;
      const currentStartMs = evaluationEndMs - policy.sustainedWindows * windowMs;
      const baselineEndMs = currentStartMs - policy.exclusionGapMinutes * MINUTE_MS;
      const baselineStartMs = baselineEndMs - policy.lookbackMinutes * MINUTE_MS;
      const activeBucketStarts = new Set<number>();
      let requestCount = 0;
      // Mutable by design: these are local aggregation accumulators.
      const currentCounts = Array.from({ length: policy.sustainedWindows }, () => 0);

      for (const bucket of input.buckets) {
        if (bucket.bucketStartMs >= baselineStartMs && bucket.bucketStartMs < baselineEndMs) {
          requestCount += bucket.count;
          if (bucket.count > 0) activeBucketStarts.add(bucket.bucketStartMs);
          continue;
        }

        if (bucket.bucketStartMs >= currentStartMs && bucket.bucketStartMs < evaluationEndMs) {
          const windowIndex = Math.floor((bucket.bucketStartMs - currentStartMs) / windowMs);
          const currentCount = currentCounts[windowIndex];
          if (currentCount !== undefined) currentCounts[windowIndex] = currentCount + bucket.count;
        }
      }

      const baselineRpm = requestCount / policy.lookbackMinutes;
      const thresholdRpm = Math.max(
        policy.minimumRequestsPerMinute,
        baselineRpm * policy.baselineMultiplier
      );
      const currentRates = currentCounts.map((count) => count / policy.windowMinutes);
      const activeMinutes = activeBucketStarts.size;
      const eligible =
        requestCount >= policy.minimumBaselineRequests &&
        activeMinutes >= policy.minimumActiveMinutes;
      const evidence = {
        evaluationEndMs,
        baselineRpm,
        thresholdRpm,
        currentRates,
        activeMinutes,
        requestCount,
        eligible,
      } as const;

      if (!eligible) return { result: 'learning', ...evidence };
      if (currentRates.every((rate) => rate >= thresholdRpm)) {
        return { result: 'would_pause', ...evidence };
      }
      return { result: 'normal', ...evidence };
    }
    default:
      return assertNever(resolution);
  }
}

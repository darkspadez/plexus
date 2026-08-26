import { logger } from '../../utils/logger';
import { evaluateAnomaly, type AnomalyEvaluation, type MinuteBucket } from './anomaly-detector';
import { DatabaseAnomalyEvaluationStore } from './anomaly-evaluation-store';
import type { ApiKeyPauseEvidence, ApiKeyPauseResult } from './pause-contract';
import type { GlobalAnomalyPolicy, PerKeyAnomalyPolicy } from './policy-schema';

const MINUTE_MS = 60_000;
const RETENTION_BUFFER_MINUTES = 1_440;

export type EligibleAnomalyKey = {
  readonly id: number;
  readonly name: string;
  readonly policy: PerKeyAnomalyPolicy;
};

export type AnomalyEvaluationStore = {
  readonly getGlobalPolicy: () => Promise<GlobalAnomalyPolicy>;
  readonly listKeyPolicies: () => Promise<readonly PerKeyAnomalyPolicy[]>;
  readonly listEligibleKeys: (now: number) => Promise<readonly EligibleAnomalyKey[]>;
  readonly loadBuckets: (
    keyId: number,
    startMs: number,
    endMs: number
  ) => Promise<readonly MinuteBucket[]>;
  readonly recordWouldPauseOnce: (
    key: EligibleAnomalyKey,
    evidence: ApiKeyPauseEvidence & { readonly evaluationEndMs: number }
  ) => Promise<void>;
  readonly pauseAutomatically: (
    key: EligibleAnomalyKey,
    evidence: ApiKeyPauseEvidence
  ) => Promise<ApiKeyPauseResult>;
  readonly deleteBucketsBefore: (cutoffMs: number) => Promise<void>;
};

type SchedulerOptions = {
  readonly store?: AnomalyEvaluationStore;
  readonly clock?: () => number;
};

function assertNever(value: never): never {
  throw new Error(`Unexpected anomaly evaluation result: ${JSON.stringify(value)}`);
}

function effectiveLookback(policy: GlobalAnomalyPolicy, keyPolicy: PerKeyAnomalyPolicy): number {
  switch (keyPolicy.mode) {
    case 'inherit':
    case 'disabled':
      return policy.lookbackMinutes;
    case 'override':
      return keyPolicy.policy.lookbackMinutes;
    default:
      return assertNever(keyPolicy);
  }
}

function rangeStart(
  policy: GlobalAnomalyPolicy,
  keyPolicy: PerKeyAnomalyPolicy,
  now: number
): number {
  switch (keyPolicy.mode) {
    case 'inherit':
    case 'disabled':
      return (
        Math.floor((now - MINUTE_MS) / (policy.windowMinutes * MINUTE_MS)) *
          policy.windowMinutes *
          MINUTE_MS -
        (policy.lookbackMinutes +
          policy.exclusionGapMinutes +
          policy.windowMinutes * policy.sustainedWindows) *
          MINUTE_MS
      );
    case 'override':
      return (
        Math.floor((now - MINUTE_MS) / (keyPolicy.policy.windowMinutes * MINUTE_MS)) *
          keyPolicy.policy.windowMinutes *
          MINUTE_MS -
        (keyPolicy.policy.lookbackMinutes +
          keyPolicy.policy.exclusionGapMinutes +
          keyPolicy.policy.windowMinutes * keyPolicy.policy.sustainedWindows) *
          MINUTE_MS
      );
    default:
      return assertNever(keyPolicy);
  }
}

export class AnomalyEvaluationScheduler {
  private static instance: AnomalyEvaluationScheduler | undefined;
  private static evaluationRunning = false;
  private readonly store: AnomalyEvaluationStore;
  private readonly clock: () => number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  // Mutable by design: prevents repeat observe evidence for the same key/window in this process.
  private readonly observedTriggerWindows = new Set<string>();

  constructor(options: SchedulerOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.store = options.store ?? new DatabaseAnomalyEvaluationStore(this.clock);
  }

  static getInstance(): AnomalyEvaluationScheduler {
    AnomalyEvaluationScheduler.instance ??= new AnomalyEvaluationScheduler();
    return AnomalyEvaluationScheduler.instance;
  }

  static resetForTesting(): void {
    AnomalyEvaluationScheduler.instance?.stop();
    AnomalyEvaluationScheduler.instance = undefined;
    AnomalyEvaluationScheduler.evaluationRunning = false;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.evaluateSafely();
    this.scheduleNext();
  }

  async evaluateNow(): Promise<void> {
    if (AnomalyEvaluationScheduler.evaluationRunning) return;
    AnomalyEvaluationScheduler.evaluationRunning = true;
    try {
      const now = this.clock();
      const globalPolicy = await this.store.getGlobalPolicy();
      if (globalPolicy.mode === 'disabled') return;
      const policies = await this.store.listKeyPolicies();
      const keys = await this.store.listEligibleKeys(now);
      let maximumLookback = globalPolicy.lookbackMinutes;
      for (const keyPolicy of policies) {
        maximumLookback = Math.max(maximumLookback, effectiveLookback(globalPolicy, keyPolicy));
      }
      for (const key of keys) {
        if (key.policy.mode === 'disabled') continue;
        const evaluation = evaluateAnomaly({
          now,
          globalPolicy,
          keyPolicy: key.policy,
          buckets: await this.store.loadBuckets(
            key.id,
            rangeStart(globalPolicy, key.policy, now),
            now
          ),
        });
        await this.applyEvaluation(globalPolicy, key, evaluation);
      }
      const alignedNow = Math.floor(now / MINUTE_MS) * MINUTE_MS;
      await this.store.deleteBucketsBefore(
        alignedNow - (maximumLookback + RETENTION_BUFFER_MINUTES) * MINUTE_MS
      );
    } finally {
      AnomalyEvaluationScheduler.evaluationRunning = false;
    }
  }

  stop(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.stopped = true;
    this.observedTriggerWindows.clear();
  }

  private async applyEvaluation(
    policy: GlobalAnomalyPolicy,
    key: EligibleAnomalyKey,
    evaluation: AnomalyEvaluation
  ): Promise<void> {
    if (evaluation.result !== 'would_pause') return;
    switch (policy.mode) {
      case 'observe': {
        const trigger = `${key.id}:${evaluation.evaluationEndMs}`;
        if (this.observedTriggerWindows.has(trigger)) return;
        await this.store.recordWouldPauseOnce(key, evaluation);
        this.observedTriggerWindows.add(trigger);
        return;
      }
      case 'enforce':
        await this.store.pauseAutomatically(key, evaluation);
        return;
      case 'disabled':
        return;
      default:
        return assertNever(policy.mode);
    }
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    const delay = MINUTE_MS - (this.clock() % MINUTE_MS);
    this.timer = setTimeout(async () => {
      await this.evaluateSafely();
      this.scheduleNext();
    }, delay);
  }

  private async evaluateSafely(): Promise<void> {
    try {
      await this.evaluateNow();
    } catch (error) {
      logger.error('API key anomaly evaluation failed', error);
    }
  }
}

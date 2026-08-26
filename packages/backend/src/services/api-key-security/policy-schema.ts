import { z } from 'zod';

export const DEFAULT_ANOMALY_THRESHOLD_POLICY = {
  lookbackMinutes: 1440,
  exclusionGapMinutes: 10,
  windowMinutes: 10,
  sustainedWindows: 3,
  minimumRequestsPerMinute: 50,
  baselineMultiplier: 10,
  minimumBaselineRequests: 100,
  minimumActiveMinutes: 240,
} as const;

const anomalyThresholdPolicyShape = {
  lookbackMinutes: z.number().int().positive(),
  exclusionGapMinutes: z.number().int().positive(),
  windowMinutes: z.number().int().positive(),
  sustainedWindows: z.number().int().positive(),
  minimumRequestsPerMinute: z.number().positive(),
  baselineMultiplier: z.number().positive(),
  minimumBaselineRequests: z.number().int().nonnegative(),
  minimumActiveMinutes: z.number().int().nonnegative(),
} as const;

type PolicyWindowDimensions = {
  readonly lookbackMinutes: number;
  readonly exclusionGapMinutes: number;
  readonly windowMinutes: number;
  readonly sustainedWindows: number;
  readonly minimumActiveMinutes: number;
};

function refinePolicyWindowDimensions(
  policy: PolicyWindowDimensions,
  context: z.RefinementCtx
): void {
  if (policy.minimumActiveMinutes > policy.lookbackMinutes) {
    context.addIssue({
      code: 'custom',
      path: ['minimumActiveMinutes'],
      message: 'Minimum active minutes must not exceed lookback minutes',
      params: { rule: 'active_minutes_within_lookback' },
    });
  }

  const detectionHorizonMinutes =
    policy.exclusionGapMinutes + policy.windowMinutes * policy.sustainedWindows;
  if (policy.lookbackMinutes <= detectionHorizonMinutes) {
    context.addIssue({
      code: 'custom',
      path: ['lookbackMinutes'],
      message: 'Lookback minutes must exceed the exclusion gap and current windows',
      params: { rule: 'lookback_exceeds_detection_horizon' },
    });
  }
}

export const AnomalyThresholdPolicySchema = z
  .strictObject(anomalyThresholdPolicyShape)
  .superRefine(refinePolicyWindowDimensions)
  .readonly();

export const GlobalAnomalyPolicySchema = z
  .strictObject({
    mode: z.enum(['disabled', 'observe', 'enforce']),
    lookbackMinutes: anomalyThresholdPolicyShape.lookbackMinutes.default(
      DEFAULT_ANOMALY_THRESHOLD_POLICY.lookbackMinutes
    ),
    exclusionGapMinutes: anomalyThresholdPolicyShape.exclusionGapMinutes.default(
      DEFAULT_ANOMALY_THRESHOLD_POLICY.exclusionGapMinutes
    ),
    windowMinutes: anomalyThresholdPolicyShape.windowMinutes.default(
      DEFAULT_ANOMALY_THRESHOLD_POLICY.windowMinutes
    ),
    sustainedWindows: anomalyThresholdPolicyShape.sustainedWindows.default(
      DEFAULT_ANOMALY_THRESHOLD_POLICY.sustainedWindows
    ),
    minimumRequestsPerMinute: anomalyThresholdPolicyShape.minimumRequestsPerMinute.default(
      DEFAULT_ANOMALY_THRESHOLD_POLICY.minimumRequestsPerMinute
    ),
    baselineMultiplier: anomalyThresholdPolicyShape.baselineMultiplier.default(
      DEFAULT_ANOMALY_THRESHOLD_POLICY.baselineMultiplier
    ),
    minimumBaselineRequests: anomalyThresholdPolicyShape.minimumBaselineRequests.default(
      DEFAULT_ANOMALY_THRESHOLD_POLICY.minimumBaselineRequests
    ),
    minimumActiveMinutes: anomalyThresholdPolicyShape.minimumActiveMinutes.default(
      DEFAULT_ANOMALY_THRESHOLD_POLICY.minimumActiveMinutes
    ),
  })
  .superRefine(refinePolicyWindowDimensions)
  .readonly();

export const DEFAULT_GLOBAL_ANOMALY_POLICY = GlobalAnomalyPolicySchema.parse({ mode: 'disabled' });

export const PerKeyAnomalyPolicySchema = z
  .discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('inherit') }),
    z.strictObject({ mode: z.literal('disabled'), reason: z.string().trim().min(1) }),
    z.strictObject({
      mode: z.literal('override'),
      reason: z.string().trim().min(1),
      policy: AnomalyThresholdPolicySchema,
    }),
  ])
  .readonly();

export type AnomalyThresholdPolicy = z.infer<typeof AnomalyThresholdPolicySchema>;
export type GlobalAnomalyPolicy = z.infer<typeof GlobalAnomalyPolicySchema>;
export type PerKeyAnomalyPolicy = z.infer<typeof PerKeyAnomalyPolicySchema>;

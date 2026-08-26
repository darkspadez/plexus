import type {
  AnomalyThresholdPolicy,
  GlobalAnomalyPolicy,
  KeyPolicyPreview,
} from '../../lib/api/keySecurity';
import type { KeyConfig } from '../../lib/api/keys';

export const DEFAULT_THRESHOLDS: AnomalyThresholdPolicy = {
  lookbackMinutes: 1440,
  exclusionGapMinutes: 10,
  windowMinutes: 10,
  sustainedWindows: 3,
  minimumRequestsPerMinute: 50,
  baselineMultiplier: 10,
  minimumBaselineRequests: 100,
  minimumActiveMinutes: 240,
};

export type ThresholdField = keyof AnomalyThresholdPolicy;
export type PolicyErrors = Partial<Record<ThresholdField | 'reason', string>>;
export type KeySecurityStatus =
  | 'active'
  | 'paused'
  | 'expired'
  | 'disabled'
  | 'learning'
  | 'observing';

export const validateThresholds = (policy: AnomalyThresholdPolicy): PolicyErrors => {
  const errors: PolicyErrors = {};
  const integerPositive: readonly ThresholdField[] = [
    'lookbackMinutes',
    'exclusionGapMinutes',
    'windowMinutes',
    'sustainedWindows',
  ];
  const integerNonnegative: readonly ThresholdField[] = [
    'minimumBaselineRequests',
    'minimumActiveMinutes',
  ];
  const positive: readonly ThresholdField[] = ['minimumRequestsPerMinute', 'baselineMultiplier'];

  for (const field of integerPositive) {
    if (!Number.isInteger(policy[field]) || policy[field] <= 0) {
      errors[field] = 'Enter a positive whole number';
    }
  }
  for (const field of integerNonnegative) {
    if (!Number.isInteger(policy[field]) || policy[field] < 0) {
      errors[field] = 'Enter zero or a positive whole number';
    }
  }
  for (const field of positive) {
    if (!Number.isFinite(policy[field]) || policy[field] <= 0) {
      errors[field] = 'Enter a number greater than zero';
    }
  }
  if (policy.minimumActiveMinutes > policy.lookbackMinutes) {
    errors.minimumActiveMinutes = 'Must not exceed lookback minutes';
  }
  const horizon = policy.exclusionGapMinutes + policy.windowMinutes * policy.sustainedWindows;
  if (policy.lookbackMinutes <= horizon) {
    errors.lookbackMinutes = 'Must exceed the exclusion gap and sustained windows';
  }
  return errors;
};

export const detectionSummary = (policy: AnomalyThresholdPolicy): string => {
  const activeWindow = policy.windowMinutes * policy.sustainedWindows;
  return `${policy.sustainedWindows} consecutive ${policy.windowMinutes}-minute windows (${activeWindow} minutes total) after a ${policy.exclusionGapMinutes}-minute exclusion gap, compared with a ${policy.lookbackMinutes}-minute baseline.`;
};

export const keySecurityStatus = (
  key: KeyConfig,
  preview: KeyPolicyPreview | undefined
): KeySecurityStatus => {
  if (key.disabledAt !== undefined) return 'disabled';
  if (key.expiresAt !== undefined && key.expiresAt <= Date.now()) return 'expired';
  if (key.pausedAt !== undefined) return 'paused';
  if (preview?.effective.mode === 'observe') return 'observing';
  if (preview?.effective.mode === 'enforce') return 'learning';
  return 'active';
};

export const effectivePolicyFor = (
  global: GlobalAnomalyPolicy,
  preview: KeyPolicyPreview | undefined
): GlobalAnomalyPolicy => preview?.effective ?? global;

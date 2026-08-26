import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DEFAULT_ANOMALY_THRESHOLD_POLICY,
  GlobalAnomalyPolicySchema,
  PerKeyAnomalyPolicySchema,
} from '../policy-schema';

describe('anomaly policy schemas', () => {
  it('applies every effective default when the global policy only specifies its mode', () => {
    // Given
    const input = { mode: 'observe' };

    // When
    const policy = GlobalAnomalyPolicySchema.parse(input);

    // Then
    expect(policy).toEqual({ mode: 'observe', ...DEFAULT_ANOMALY_THRESHOLD_POLICY });
  });

  it('accepts a complete per-key override policy', () => {
    // Given
    const input = {
      mode: 'override',
      reason: 'High-volume integration',
      policy: {
        lookbackMinutes: 720,
        exclusionGapMinutes: 5,
        windowMinutes: 5,
        sustainedWindows: 4,
        minimumRequestsPerMinute: 75,
        baselineMultiplier: 8,
        minimumBaselineRequests: 200,
        minimumActiveMinutes: 120,
      },
    };

    // When
    const policy = PerKeyAnomalyPolicySchema.parse(input);

    // Then
    expect(policy).toEqual(input);
  });

  it('rejects a partial per-key override policy', () => {
    // Given
    const input = {
      mode: 'override',
      reason: 'Incomplete policy must not merge with defaults',
      policy: {
        minimumRequestsPerMinute: 75,
      },
    };

    // When
    const parse = (): unknown => PerKeyAnomalyPolicySchema.parse(input);

    // Then
    expect(parse).toThrow(z.ZodError);
  });

  it('rejects unknown policy fields rather than silently stripping them', () => {
    // Given
    const input = { mode: 'inherit', threshold: 99 };

    // When
    const parse = (): unknown => PerKeyAnomalyPolicySchema.parse(input);

    // Then
    expect(parse).toThrow(z.ZodError);
  });

  it('rejects a global policy whose active-minute requirement exceeds its lookback', () => {
    // Given
    const input = {
      mode: 'observe',
      ...DEFAULT_ANOMALY_THRESHOLD_POLICY,
      lookbackMinutes: 60,
      minimumActiveMinutes: 61,
    };

    // When
    const result = GlobalAnomalyPolicySchema.safeParse(input);

    // Then
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        code: 'custom',
        path: ['minimumActiveMinutes'],
        params: { rule: 'active_minutes_within_lookback' },
      })
    );
  });

  it('rejects a complete override whose lookback does not exceed gap plus current horizon', () => {
    // Given
    const input = {
      mode: 'override',
      reason: 'Invalid history horizon',
      policy: {
        ...DEFAULT_ANOMALY_THRESHOLD_POLICY,
        lookbackMinutes: 40,
        minimumActiveMinutes: 40,
      },
    };

    // When
    const result = PerKeyAnomalyPolicySchema.safeParse(input);

    // Then
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        code: 'custom',
        path: ['policy', 'lookbackMinutes'],
        params: { rule: 'lookback_exceeds_detection_horizon' },
      })
    );
  });
});

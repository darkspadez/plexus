/**
 * config-schemas.test.ts — Characterization tests for Config panel schemas.
 *
 * These tests lock down the exact serialization that api.patch* methods receive.
 * Any change that breaks these means API payload parity with the old imperative
 * handlers is broken.
 */
import { expect, test, describe } from 'vitest';
import {
  toFailoverPayload,
  cooldownFormSchema,
  toCooldownPayload,
  timeoutFormSchema,
  stallFormSchema,
  toStallPayload,
  compactionFormSchema,
  toCompactionPayload,
  explorationFormSchema,
  toExplorationPayload,
  networkFormSchema,
  toNetworkPayload,
  grafanaFormSchema,
  toGrafanaPayload,
  type StallFormParsed,
  type CompactionFormParsed,
} from '../config-schemas';

// ---------------------------------------------------------------------------
// Failover payload serialization
// ---------------------------------------------------------------------------

describe('toFailoverPayload', () => {
  test('parses comma-separated status codes, filters out-of-range values', () => {
    const payload = toFailoverPayload({
      enabled: true,
      statusCodesText: '429, 500, 502, 99, 600, abc',
      errorsText: '',
    });
    // 99 and 600 are outside 100–599, "abc" becomes NaN — all filtered out
    expect(payload.retryableStatusCodes).toEqual([429, 500, 502]);
    expect(payload.retryableErrors).toEqual([]);
    expect(payload.enabled).toBe(true);
  });

  test('parses space-and-comma separated error strings', () => {
    const payload = toFailoverPayload({
      enabled: false,
      statusCodesText: '',
      errorsText: 'ECONNREFUSED, ETIMEDOUT  ENOTFOUND',
    });
    expect(payload.retryableErrors).toEqual(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND']);
    expect(payload.retryableStatusCodes).toEqual([]);
  });

  test('empty inputs produce empty arrays', () => {
    const payload = toFailoverPayload({ enabled: true, statusCodesText: '', errorsText: '' });
    expect(payload.retryableStatusCodes).toEqual([]);
    expect(payload.retryableErrors).toEqual([]);
  });

  test('status code boundary values: 100 and 599 are included', () => {
    const payload = toFailoverPayload({
      enabled: true,
      statusCodesText: '100, 599',
      errorsText: '',
    });
    expect(payload.retryableStatusCodes).toEqual([100, 599]);
  });

  test('status code 101 included, 99 and 600 excluded', () => {
    const payload = toFailoverPayload({
      enabled: true,
      statusCodesText: '99 100 599 600',
      errorsText: '',
    });
    expect(payload.retryableStatusCodes).toEqual([100, 599]);
  });

  test('non-integer float status codes filtered (4.5 is out of 100–599 range)', () => {
    const payload = toFailoverPayload({
      enabled: true,
      statusCodesText: '4.5 500',
      errorsText: '',
    });
    // 4.5 is out of range 100-599 so filtered
    expect(payload.retryableStatusCodes).toEqual([500]);
  });
});

// ---------------------------------------------------------------------------
// Cooldown schema validation
// ---------------------------------------------------------------------------

describe('cooldownFormSchema', () => {
  test('accepts valid float values', () => {
    const result = cooldownFormSchema.safeParse({ initialMinutes: 2.5, maxMinutes: 300 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.initialMinutes).toBe(2.5);
      expect(result.data.maxMinutes).toBe(300);
    }
  });

  test('rejects value below 0.1', () => {
    const result = cooldownFormSchema.safeParse({ initialMinutes: 0.05, maxMinutes: 300 });
    expect(result.success).toBe(false);
  });

  test('accepts integer values', () => {
    const result = cooldownFormSchema.safeParse({ initialMinutes: 2, maxMinutes: 300 });
    expect(result.success).toBe(true);
  });
});

describe('toCooldownPayload', () => {
  test('passes through initialMinutes and maxMinutes exactly', () => {
    const payload = toCooldownPayload({ initialMinutes: 2.5, maxMinutes: 300 });
    expect(payload).toEqual({ initialMinutes: 2.5, maxMinutes: 300 });
  });
});

// ---------------------------------------------------------------------------
// Timeout schema validation
// ---------------------------------------------------------------------------

describe('timeoutFormSchema', () => {
  test('accepts integer in range 1–3600', () => {
    const result = timeoutFormSchema.safeParse({ defaultSeconds: 300 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.defaultSeconds).toBe(300);
  });

  test('rejects 0', () => {
    const result = timeoutFormSchema.safeParse({ defaultSeconds: 0 });
    expect(result.success).toBe(false);
  });

  test('rejects 3601', () => {
    const result = timeoutFormSchema.safeParse({ defaultSeconds: 3601 });
    expect(result.success).toBe(false);
  });

  test('rejects float', () => {
    const result = timeoutFormSchema.safeParse({ defaultSeconds: 1.5 });
    expect(result.success).toBe(false);
  });

  test('boundary 1 and 3600 pass', () => {
    expect(timeoutFormSchema.safeParse({ defaultSeconds: 1 }).success).toBe(true);
    expect(timeoutFormSchema.safeParse({ defaultSeconds: 3600 }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stall detection payload serialization
// This is the most complex panel — old handleSaveStall builds a partial patch.
// ---------------------------------------------------------------------------

describe('stallFormSchema + toStallPayload — identical to old handleSaveStall', () => {
  test('empty ttfbSeconds → null in payload (disabled)', () => {
    const parsed = stallFormSchema.safeParse({
      ttfbSeconds: '',
      ttfbBytes: '100',
      minBytesPerSecond: '',
      windowSeconds: '10',
      gracePeriodSeconds: '30',
    });
    expect(parsed.success).toBe(true);
    const payload = toStallPayload(parsed.data as StallFormParsed);
    expect(payload.ttfbSeconds).toBeNull();
    expect('ttfbSeconds' in payload).toBe(true);
  });

  test('empty minBytesPerSecond → null in payload (disabled)', () => {
    const parsed = stallFormSchema.safeParse({
      ttfbSeconds: '30',
      ttfbBytes: '100',
      minBytesPerSecond: '',
      windowSeconds: '10',
      gracePeriodSeconds: '30',
    });
    expect(parsed.success).toBe(true);
    const payload = toStallPayload(parsed.data as StallFormParsed);
    expect(payload.minBytesPerSecond).toBeNull();
  });

  test('populated ttfbSeconds → number in payload', () => {
    const parsed = stallFormSchema.safeParse({
      ttfbSeconds: '45',
      ttfbBytes: '100',
      minBytesPerSecond: '200',
      windowSeconds: '10',
      gracePeriodSeconds: '30',
    });
    expect(parsed.success).toBe(true);
    const payload = toStallPayload(parsed.data as StallFormParsed);
    expect(payload.ttfbSeconds).toBe(45);
    expect(payload.minBytesPerSecond).toBe(200);
  });

  test('empty ttfbBytes → omitted from payload (not sent)', () => {
    const parsed = stallFormSchema.safeParse({
      ttfbSeconds: '',
      ttfbBytes: '',
      minBytesPerSecond: '',
      windowSeconds: '',
      gracePeriodSeconds: '',
    });
    expect(parsed.success).toBe(true);
    const payload = toStallPayload(parsed.data as StallFormParsed);
    // Optional fields omitted when empty
    expect('ttfbBytes' in payload).toBe(false);
    expect('windowSeconds' in payload).toBe(false);
    expect('gracePeriodSeconds' in payload).toBe(false);
    // Nullable fields always present
    expect('ttfbSeconds' in payload).toBe(true);
    expect('minBytesPerSecond' in payload).toBe(true);
  });

  test('full payload when all fields populated', () => {
    const parsed = stallFormSchema.safeParse({
      ttfbSeconds: '30',
      ttfbBytes: '100',
      minBytesPerSecond: '500',
      windowSeconds: '15',
      gracePeriodSeconds: '60',
    });
    expect(parsed.success).toBe(true);
    const payload = toStallPayload(parsed.data as StallFormParsed);
    expect(payload).toEqual({
      ttfbSeconds: 30,
      ttfbBytes: 100,
      minBytesPerSecond: 500,
      windowSeconds: 15,
      gracePeriodSeconds: 60,
    });
  });

  test('ttfbSeconds out-of-range (4) fails validation', () => {
    const result = stallFormSchema.safeParse({
      ttfbSeconds: '4',
      ttfbBytes: '100',
      minBytesPerSecond: '',
      windowSeconds: '10',
      gracePeriodSeconds: '30',
    });
    expect(result.success).toBe(false);
  });

  test('ttfbSeconds out-of-range (121) fails validation', () => {
    const result = stallFormSchema.safeParse({
      ttfbSeconds: '121',
      ttfbBytes: '100',
      minBytesPerSecond: '',
      windowSeconds: '10',
      gracePeriodSeconds: '30',
    });
    expect(result.success).toBe(false);
  });

  test('ttfbBytes out-of-range (49) fails validation', () => {
    const result = stallFormSchema.safeParse({
      ttfbSeconds: '',
      ttfbBytes: '49',
      minBytesPerSecond: '',
      windowSeconds: '10',
      gracePeriodSeconds: '30',
    });
    expect(result.success).toBe(false);
  });

  test('gracePeriodSeconds = 0 is valid (boundary)', () => {
    const result = stallFormSchema.safeParse({
      ttfbSeconds: '',
      ttfbBytes: '',
      minBytesPerSecond: '',
      windowSeconds: '',
      gracePeriodSeconds: '0',
    });
    expect(result.success).toBe(true);
    const payload = toStallPayload(result.data as StallFormParsed);
    expect(payload.gracePeriodSeconds).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Context Compaction payload serialization
//
// Mirrors old handleSaveCompaction: the whole settings object is re-sent on
// every save. Fields split into the same two groups as Stall:
//   - "empty = off" nullable fields (absoluteTriggerTokens, headroom.targetRatio)
//     are ALWAYS present in the payload (null when blank).
//   - "server default when omitted" optional fields (triggerRatio, minTokens,
//     protectRecent, native.*, headroom.baseUrl/apiKey/timeoutMs) are omitted
//     from the payload entirely when blank.
// native/headroom sub-objects must never be dropped based on which strategy
// is currently selected (regression coverage for the exploration-panel bug).
// ---------------------------------------------------------------------------

describe('compactionFormSchema + toCompactionPayload — identical to old handleSaveCompaction', () => {
  const blankRaw = {
    enabled: false,
    strategy: 'native' as const,
    triggerRatio: '',
    absoluteTriggerTokens: '',
    minTokens: '',
    protectRecent: '',
    native: { maxArrayItems: '', maxStringChars: '' },
    headroom: { baseUrl: '', apiKey: '', targetRatio: '', timeoutMs: '' },
  };

  test('enabled and strategy always present in payload', () => {
    const parsed = compactionFormSchema.safeParse(blankRaw);
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect(payload.enabled).toBe(false);
    expect(payload.strategy).toBe('native');
  });

  test('empty triggerRatio → omitted from payload', () => {
    const parsed = compactionFormSchema.safeParse(blankRaw);
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect('triggerRatio' in payload).toBe(false);
  });

  test('populated triggerRatio → number in payload', () => {
    const parsed = compactionFormSchema.safeParse({ ...blankRaw, triggerRatio: '0.8' });
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect(payload.triggerRatio).toBe(0.8);
  });

  test('empty absoluteTriggerTokens → null in payload (always present, disabled)', () => {
    const parsed = compactionFormSchema.safeParse(blankRaw);
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect(payload.absoluteTriggerTokens).toBeNull();
    expect('absoluteTriggerTokens' in payload).toBe(true);
  });

  test('populated absoluteTriggerTokens → number in payload', () => {
    const parsed = compactionFormSchema.safeParse({ ...blankRaw, absoluteTriggerTokens: '5000' });
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect(payload.absoluteTriggerTokens).toBe(5000);
  });

  test('empty minTokens and protectRecent → omitted from payload', () => {
    const parsed = compactionFormSchema.safeParse(blankRaw);
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect('minTokens' in payload).toBe(false);
    expect('protectRecent' in payload).toBe(false);
  });

  test('populated minTokens and protectRecent → numbers in payload', () => {
    const parsed = compactionFormSchema.safeParse({
      ...blankRaw,
      minTokens: '1000',
      protectRecent: '4',
    });
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect(payload.minTokens).toBe(1000);
    expect(payload.protectRecent).toBe(4);
  });

  test('native and headroom sub-objects always present, empty when blank', () => {
    const parsed = compactionFormSchema.safeParse(blankRaw);
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect(payload.native).toEqual({});
    expect(payload.headroom).toEqual({ targetRatio: null });
  });

  test('empty native.maxArrayItems/maxStringChars → omitted from native sub-object', () => {
    const parsed = compactionFormSchema.safeParse(blankRaw);
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect('maxArrayItems' in payload.native).toBe(false);
    expect('maxStringChars' in payload.native).toBe(false);
  });

  test('populated native fields → numbers in native sub-object', () => {
    const parsed = compactionFormSchema.safeParse({
      ...blankRaw,
      native: { maxArrayItems: '20', maxStringChars: '500' },
    });
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect(payload.native).toEqual({ maxArrayItems: 20, maxStringChars: 500 });
  });

  test('native fields survive in payload even when strategy is headroom (no toggle-based omission)', () => {
    const parsed = compactionFormSchema.safeParse({
      ...blankRaw,
      strategy: 'headroom',
      native: { maxArrayItems: '20', maxStringChars: '500' },
    });
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect(payload.strategy).toBe('headroom');
    expect(payload.native).toEqual({ maxArrayItems: 20, maxStringChars: 500 });
  });

  test('empty headroom.baseUrl/apiKey/timeoutMs → omitted from headroom sub-object', () => {
    const parsed = compactionFormSchema.safeParse(blankRaw);
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect('baseUrl' in payload.headroom).toBe(false);
    expect('apiKey' in payload.headroom).toBe(false);
    expect('timeoutMs' in payload.headroom).toBe(false);
  });

  test('empty headroom.targetRatio → null in headroom sub-object (always present, disabled)', () => {
    const parsed = compactionFormSchema.safeParse(blankRaw);
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect(payload.headroom.targetRatio).toBeNull();
    expect('targetRatio' in payload.headroom).toBe(true);
  });

  test('populated headroom fields → values in headroom sub-object', () => {
    const parsed = compactionFormSchema.safeParse({
      ...blankRaw,
      strategy: 'headroom',
      headroom: {
        baseUrl: 'http://localhost:8787',
        apiKey: 'secret-key',
        targetRatio: '0.7',
        timeoutMs: '30000',
      },
    });
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect(payload.headroom).toEqual({
      baseUrl: 'http://localhost:8787',
      apiKey: 'secret-key',
      targetRatio: 0.7,
      timeoutMs: 30000,
    });
  });

  test('headroom fields survive in payload even when strategy is native (no toggle-based omission)', () => {
    const parsed = compactionFormSchema.safeParse({
      ...blankRaw,
      strategy: 'native',
      headroom: {
        baseUrl: 'http://localhost:8787',
        apiKey: '',
        targetRatio: '',
        timeoutMs: '',
      },
    });
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect(payload.strategy).toBe('native');
    expect(payload.headroom.baseUrl).toBe('http://localhost:8787');
  });

  test('full payload when all fields populated (native strategy)', () => {
    const parsed = compactionFormSchema.safeParse({
      enabled: true,
      strategy: 'native',
      triggerRatio: '0.8',
      absoluteTriggerTokens: '5000',
      minTokens: '1000',
      protectRecent: '4',
      native: { maxArrayItems: '20', maxStringChars: '500' },
      headroom: { baseUrl: '', apiKey: '', targetRatio: '', timeoutMs: '' },
    });
    expect(parsed.success).toBe(true);
    const payload = toCompactionPayload(parsed.data as CompactionFormParsed);
    expect(payload).toEqual({
      enabled: true,
      strategy: 'native',
      triggerRatio: 0.8,
      absoluteTriggerTokens: 5000,
      minTokens: 1000,
      protectRecent: 4,
      native: { maxArrayItems: 20, maxStringChars: 500 },
      headroom: { targetRatio: null },
    });
  });

  test('rejects non-numeric triggerRatio', () => {
    const result = compactionFormSchema.safeParse({ ...blankRaw, triggerRatio: 'abc' });
    expect(result.success).toBe(false);
  });

  test('rejects non-numeric headroom.timeoutMs', () => {
    const result = compactionFormSchema.safeParse({
      ...blankRaw,
      headroom: { ...blankRaw.headroom, timeoutMs: 'abc' },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Exploration rates schema
// ---------------------------------------------------------------------------

describe('explorationFormSchema', () => {
  test('accepts valid rates and bg config', () => {
    const result = explorationFormSchema.safeParse({
      performanceExplorationRate: 0.05,
      latencyExplorationRate: 0.1,
      e2ePerformanceExplorationRate: 0,
      bgEnabled: false,
      stalenessThresholdSeconds: 600,
      workerConcurrency: 2,
    });
    expect(result.success).toBe(true);
  });

  test('rejects rate > 1', () => {
    const result = explorationFormSchema.safeParse({
      performanceExplorationRate: 1.1,
      latencyExplorationRate: 0.05,
      e2ePerformanceExplorationRate: 0.05,
      bgEnabled: false,
      stalenessThresholdSeconds: 600,
      workerConcurrency: 2,
    });
    expect(result.success).toBe(false);
  });

  test('rejects rate < 0', () => {
    const result = explorationFormSchema.safeParse({
      performanceExplorationRate: -0.1,
      latencyExplorationRate: 0.05,
      e2ePerformanceExplorationRate: 0.05,
      bgEnabled: false,
      stalenessThresholdSeconds: 600,
      workerConcurrency: 2,
    });
    expect(result.success).toBe(false);
  });

  test('rejects workerConcurrency > 16', () => {
    const result = explorationFormSchema.safeParse({
      performanceExplorationRate: 0.05,
      latencyExplorationRate: 0.05,
      e2ePerformanceExplorationRate: 0.05,
      bgEnabled: true,
      stalenessThresholdSeconds: 600,
      workerConcurrency: 17,
    });
    expect(result.success).toBe(false);
  });

  test('rejects staleness < 1', () => {
    const result = explorationFormSchema.safeParse({
      performanceExplorationRate: 0.05,
      latencyExplorationRate: 0.05,
      e2ePerformanceExplorationRate: 0.05,
      bgEnabled: true,
      stalenessThresholdSeconds: 0,
      workerConcurrency: 2,
    });
    expect(result.success).toBe(false);
  });
});

describe('toExplorationPayload', () => {
  test('produces bgExploration and rates when bg is enabled', () => {
    const values = {
      performanceExplorationRate: 0.05,
      latencyExplorationRate: 0.1,
      e2ePerformanceExplorationRate: 0.03,
      bgEnabled: true,
      stalenessThresholdSeconds: 600,
      workerConcurrency: 2,
    };
    const payload = toExplorationPayload(values);
    expect(payload.bgExploration).toEqual({
      enabled: true,
      stalenessThresholdSeconds: 600,
      workerConcurrency: 2,
    });
    expect(payload.rates).toBeDefined();
  });

  test('bgEnabled=false — bgExploration enabled is false', () => {
    const values = {
      performanceExplorationRate: 0.05,
      latencyExplorationRate: 0.05,
      e2ePerformanceExplorationRate: 0.05,
      bgEnabled: false,
      stalenessThresholdSeconds: 600,
      workerConcurrency: 2,
    };
    const payload = toExplorationPayload(values);
    expect(payload.bgExploration.enabled).toBe(false);
    expect(payload.rates.performanceExplorationRate).toBe(0.05);
  });
});

// ---------------------------------------------------------------------------
// Network Settings (Trusted Proxies)
// ---------------------------------------------------------------------------

describe('networkFormSchema + toNetworkPayload', () => {
  test('accepts array of CIDRs', () => {
    const result = networkFormSchema.safeParse({ trustedProxies: ['10.0.0.0/8', '192.168.1.5'] });
    expect(result.success).toBe(true);
    if (result.success) {
      const payload = toNetworkPayload(result.data);
      expect(payload).toEqual(['10.0.0.0/8', '192.168.1.5']);
    }
  });

  test('accepts empty array', () => {
    const result = networkFormSchema.safeParse({ trustedProxies: [] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(toNetworkPayload(result.data)).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Grafana URL Settings
// ---------------------------------------------------------------------------

describe('grafanaFormSchema + toGrafanaPayload', () => {
  test('accepts empty string (feature disabled, optional field)', () => {
    const result = grafanaFormSchema.safeParse({ grafanaUrl: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(toGrafanaPayload(result.data)).toBe('');
    }
  });

  test('accepts a valid http:// URL', () => {
    const result = grafanaFormSchema.safeParse({ grafanaUrl: 'http://grafana.example.com' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(toGrafanaPayload(result.data)).toBe('http://grafana.example.com');
    }
  });

  test('accepts a valid https:// URL', () => {
    const result = grafanaFormSchema.safeParse({ grafanaUrl: 'https://grafana.example.com' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(toGrafanaPayload(result.data)).toBe('https://grafana.example.com');
    }
  });

  test('rejects a string without an http(s):// prefix', () => {
    const result = grafanaFormSchema.safeParse({ grafanaUrl: 'grafana.example.com' });
    expect(result.success).toBe(false);
  });

  test('trims surrounding whitespace before validating a URL', () => {
    const result = grafanaFormSchema.safeParse({
      grafanaUrl: '  https://grafana.example.com  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // .transform(v => v.trim()) runs before the http(s):// refine check
      expect(result.data.grafanaUrl).toBe('https://grafana.example.com');
      expect(toGrafanaPayload(result.data)).toBe('https://grafana.example.com');
    }
  });
});

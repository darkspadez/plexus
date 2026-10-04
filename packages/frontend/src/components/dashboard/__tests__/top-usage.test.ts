import { describe, expect, it } from 'vitest';
import type { UsageSummaryBreakdownResult, UsageSummaryGroup } from '../../../lib/api';
import { formatCountLabel, successRateTone, topUsageRows } from '../top-usage';

const group = (name: string, requests = 10): UsageSummaryGroup => ({
  name,
  requests,
  errors: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cachedTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
  totalCost: 0,
  avgDurationMs: 0,
  totalDurationMs: 0,
  avgTtftMs: 0,
  avgTokensPerSec: 0,
  successRate: 100,
});

const breakdown = (
  names: string[],
  overrides: Partial<UsageSummaryBreakdownResult> = {}
): UsageSummaryBreakdownResult => ({
  items: names.map((name) => group(name)),
  totalDimensions: names.length,
  truncated: false,
  ...overrides,
});

const rowNames = (result: UsageSummaryBreakdownResult | undefined) =>
  topUsageRows(result, 'model').map((row) => row.name);

describe('topUsageRows', () => {
  it('returns no rows before the breakdown has loaded', () => {
    expect(topUsageRows(undefined, 'provider')).toEqual([]);
  });

  it('drops the trailing synthetic Other roll-up from a truncated breakdown', () => {
    const result = breakdown(['a', 'b', 'Other'], { totalDimensions: 7, truncated: true });
    expect(rowNames(result)).toEqual(['a', 'b']);
  });

  it('keeps a real entity named Other when the breakdown is not truncated', () => {
    expect(rowNames(breakdown(['a', 'Other']))).toEqual(['a', 'Other']);
  });

  it('drops only the roll-up when a real Other also made the top rows', () => {
    const result = breakdown(['Other', 'a', 'Other'], { totalDimensions: 9, truncated: true });
    expect(rowNames(result)).toEqual(['Other', 'a']);
  });

  it("labels the provider breakdown's unknown bucket Unattributed, keeping its raw name", () => {
    const rows = topUsageRows(breakdown(['openai', 'unknown']), 'provider');
    expect(rows.map(({ name, label }) => ({ name, label }))).toEqual([
      { name: 'openai', label: 'openai' },
      { name: 'unknown', label: 'Unattributed' },
    ]);
  });

  it('leaves a model breakdown row named unknown as it is', () => {
    const rows = topUsageRows(breakdown(['unknown']), 'model');
    expect(rows.map((row) => row.label)).toEqual(['unknown']);
  });
});

describe('successRateTone', () => {
  it('is success from 95%', () => {
    expect(successRateTone(100)).toBe('success');
    expect(successRateTone(95)).toBe('success');
  });

  it('is warning from 80% up to 95%', () => {
    expect(successRateTone(94.9)).toBe('warning');
    expect(successRateTone(80)).toBe('warning');
  });

  it('is danger below 80%', () => {
    expect(successRateTone(79.9)).toBe('danger');
    expect(successRateTone(0)).toBe('danger');
  });
});

describe('formatCountLabel', () => {
  it('uses the singular noun for exactly one', () => {
    expect(formatCountLabel(1, 'provider')).toBe('1 provider');
  });

  it('pluralizes every other count', () => {
    expect(formatCountLabel(0, 'model')).toBe('0 models');
    expect(formatCountLabel(12, 'model')).toBe('12 models');
  });
});

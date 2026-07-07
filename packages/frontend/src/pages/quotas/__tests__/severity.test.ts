import { describe, expect, test } from 'vitest';
import {
  SEVERITY_LABEL,
  SEVERITY_DOT_CLASS,
  SEVERITY_BAR_CLASS,
  SEVERITY_TRACK_CLASS,
  SEVERITY_ACCENT_CLASS,
} from '../severity';
import type { QuotaRowSeverity } from '../quota-table-rows';

// The canonical six-severity set, derived from a full (non-Partial) Record
// map's keys rather than hardcoded, so these tests stay meaningful even if
// QuotaRowSeverity ever grows or loses a member.
const ALL_SEVERITIES = Object.keys(SEVERITY_LABEL) as QuotaRowSeverity[];
const sorted = (arr: readonly string[]) => [...arr].sort();

// The four severities that get "attention" treatment (row accent); ok/pending
// are deliberately unadorned — see severity.ts's header comment.
const ATTENTION_SEVERITIES: QuotaRowSeverity[] = ['exhausted', 'error', 'critical', 'warning'];

describe('SEVERITY_LABEL', () => {
  test(
    'all six severities have unique labels — regression test for the defect ' +
      'where critical (>=90%) and exhausted (>=100%) both rendered as "Exceeded"',
    () => {
      const labels = ALL_SEVERITIES.map((severity) => SEVERITY_LABEL[severity]);
      expect(new Set(labels).size).toBe(labels.length);
    }
  );

  test('matches the exact label strings from the spec', () => {
    expect(SEVERITY_LABEL).toEqual({
      exhausted: 'Exhausted',
      error: 'Error',
      critical: 'Critical',
      warning: 'Warning',
      ok: 'OK',
      pending: 'Pending',
    });
  });
});

describe('critical vs exhausted stay visually distinct', () => {
  test('SEVERITY_DOT_CLASS.critical differs from SEVERITY_DOT_CLASS.exhausted', () => {
    expect(SEVERITY_DOT_CLASS.critical).not.toBe(SEVERITY_DOT_CLASS.exhausted);
  });

  test('SEVERITY_BAR_CLASS.critical differs from SEVERITY_BAR_CLASS.exhausted', () => {
    expect(SEVERITY_BAR_CLASS.critical).not.toBe(SEVERITY_BAR_CLASS.exhausted);
  });
});

describe('every map covers its documented severities', () => {
  test('SEVERITY_DOT_CLASS covers all six severities', () => {
    expect(sorted(Object.keys(SEVERITY_DOT_CLASS))).toEqual(sorted(ALL_SEVERITIES));
  });

  test('SEVERITY_BAR_CLASS covers all six severities', () => {
    expect(sorted(Object.keys(SEVERITY_BAR_CLASS))).toEqual(sorted(ALL_SEVERITIES));
  });

  test('SEVERITY_TRACK_CLASS covers all six severities', () => {
    expect(sorted(Object.keys(SEVERITY_TRACK_CLASS))).toEqual(sorted(ALL_SEVERITIES));
  });

  test('SEVERITY_ACCENT_CLASS covers exactly the four attention severities (ok/pending rows are unadorned)', () => {
    expect(sorted(Object.keys(SEVERITY_ACCENT_CLASS))).toEqual(sorted(ATTENTION_SEVERITIES));
  });
});

describe('exact class strings from the spec', () => {
  test('SEVERITY_DOT_CLASS', () => {
    expect(SEVERITY_DOT_CLASS).toEqual({
      exhausted: 'bg-danger',
      error: 'bg-danger',
      critical: 'bg-critical',
      warning: 'bg-warning',
      ok: 'bg-success',
      pending: 'bg-foreground-subtle',
    });
  });

  test('SEVERITY_BAR_CLASS', () => {
    expect(SEVERITY_BAR_CLASS).toEqual({
      exhausted: 'bg-danger',
      error: 'bg-danger',
      critical: 'bg-critical',
      warning: 'bg-warning',
      ok: 'bg-success',
      pending: 'bg-foreground-subtle',
    });
  });

  test('SEVERITY_TRACK_CLASS', () => {
    expect(SEVERITY_TRACK_CLASS).toEqual({
      exhausted: 'bg-danger-subtle',
      error: 'bg-danger-subtle',
      critical: 'bg-critical-subtle',
      warning: 'bg-warning-subtle',
      ok: 'bg-success-subtle',
      pending: 'bg-surface-sunken',
    });
  });

  test('SEVERITY_ACCENT_CLASS', () => {
    expect(SEVERITY_ACCENT_CLASS).toEqual({
      exhausted: 'border-l-2 border-l-danger',
      error: 'border-l-2 border-l-danger',
      critical: 'border-l-2 border-l-critical',
      warning: 'border-l-2 border-l-warning',
    });
  });
});

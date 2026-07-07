/**
 * severity.ts — the Quotas page's single source of truth for severity
 * vocabulary: display order, labels, and every Tailwind class string used to
 * render severity (filter-chip dots, status-column pills, usage-meter bars +
 * tracks, and row accents).
 *
 * Why critical vs exhausted matters: the page used to render `critical`
 * (>=90% utilization) and `exhausted` (>=100%) as identical red "Exceeded"
 * pills, hiding the difference between "almost out" and "actually out."
 * Every map below keeps them visually and textually distinct — exhausted is
 * the page's only solid-filled pill (max alarm); critical uses the orange
 * `--critical` token instead of `--danger` so it never collides with true
 * exhaustion.
 */
import type { QuotaRowSeverity } from './quota-table-rows';

export const SEVERITY_ORDER: readonly QuotaRowSeverity[] = [
  'exhausted',
  'error',
  'critical',
  'warning',
  'ok',
  'pending',
];

export const SEVERITY_LABEL: Record<QuotaRowSeverity, string> = {
  exhausted: 'Exhausted',
  error: 'Error',
  critical: 'Critical',
  warning: 'Warning',
  ok: 'OK',
  pending: 'Pending',
};

// Dots (filter chips; also the ok/pending status treatment)
export const SEVERITY_DOT_CLASS: Record<QuotaRowSeverity, string> = {
  exhausted: 'bg-danger',
  error: 'bg-danger',
  critical: 'bg-critical',
  warning: 'bg-warning',
  ok: 'bg-success',
  pending: 'bg-foreground-subtle',
};

// Status-column pills — exhausted is the ONLY filled pill (max alarm);
// ok/pending deliberately have no pill (dot + muted label) to preserve the
// page's anti-alarm color budget.
export const SEVERITY_PILL_CLASS: Partial<Record<QuotaRowSeverity, string>> = {
  exhausted: 'bg-danger text-danger-foreground',
  error: 'bg-danger-subtle text-danger',
  critical: 'bg-critical-subtle text-critical',
  warning: 'bg-warning-subtle text-warning',
};

// Usage-meter fill + its hue-matched track (track = dim step of the SAME hue)
export const SEVERITY_BAR_CLASS: Record<QuotaRowSeverity, string> = {
  exhausted: 'bg-danger',
  error: 'bg-danger',
  critical: 'bg-critical',
  warning: 'bg-warning',
  ok: 'bg-success',
  pending: 'bg-foreground-subtle',
};
export const SEVERITY_TRACK_CLASS: Record<QuotaRowSeverity, string> = {
  exhausted: 'bg-danger-subtle',
  error: 'bg-danger-subtle',
  critical: 'bg-critical-subtle',
  warning: 'bg-warning-subtle',
  ok: 'bg-success-subtle',
  pending: 'bg-surface-sunken',
};

// 2px left row accent — attention severities only; ok/pending rows unadorned.
export const SEVERITY_ACCENT_CLASS: Partial<Record<QuotaRowSeverity, string>> = {
  exhausted: 'border-l-2 border-l-danger',
  error: 'border-l-2 border-l-danger',
  critical: 'border-l-2 border-l-critical',
  warning: 'border-l-2 border-l-warning',
};

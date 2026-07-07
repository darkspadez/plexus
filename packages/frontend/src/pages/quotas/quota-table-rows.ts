/**
 * quota-table-rows.ts — flattens QuotaCheckerInfo[] (one entry per provider,
 * each with 0+ meters) into one table row per meter, ready for the Quotas
 * page's DataTable. Groups (a provider's rows) always stay adjacent and are
 * sorted as a unit by their worst meter's severity — an individual row never
 * gets separated from its provider's other rows.
 */
import type { Meter, QuotaCheckerInfo } from '../../types/quota';
import { getCheckerDisplayName } from '../../components/quota/checker-presentation';

export type QuotaRowSeverity = 'exhausted' | 'error' | 'critical' | 'warning' | 'ok' | 'pending';

export interface QuotaTableRow {
  rowId: string;
  checkerId: string;
  checkerType?: string;
  displayName: string;
  oauthAccountId?: string;
  isFirstInGroup: boolean;
  /** First row of a group that is NOT the table's overall first row — used for the group divider rule. */
  showGroupRule: boolean;
  meter?: Meter;
  severity: QuotaRowSeverity;
  checkerSuccess: boolean;
  checkerError?: string;
  checkedAt?: string;
  pending: boolean;
}

// A failed check ranks above "critical" — no visibility into the real state is
// worse than seeing a provider is nearly exhausted.
const SEVERITY_RANK: Record<QuotaRowSeverity, number> = {
  exhausted: 5,
  error: 4,
  critical: 3,
  warning: 2,
  ok: 1,
  pending: 0,
};

function severitiesForChecker(
  checker: QuotaCheckerInfo & { pending?: boolean }
): { severity: QuotaRowSeverity; meter?: Meter }[] {
  if (checker.pending) return [{ severity: 'pending' }];
  if (!checker.success) return [{ severity: 'error' }];
  if (checker.meters.length === 0) return [{ severity: 'ok' }];
  return checker.meters.map((meter) => ({ severity: meter.status, meter }));
}

export function buildQuotaTableRows(
  checkers: (QuotaCheckerInfo & { pending?: boolean })[],
  displayNameMap?: Map<string, string>
): QuotaTableRow[] {
  const groups = checkers.map((checker) => {
    const entries = severitiesForChecker(checker);
    const groupSeverityRank = Math.max(...entries.map((e) => SEVERITY_RANK[e.severity]));
    const displayName = getCheckerDisplayName(
      checker.checkerType,
      checker.checkerId,
      displayNameMap
    );
    const sortedEntries = [...entries].sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    );
    const rows: QuotaTableRow[] = sortedEntries.map((entry, index) => ({
      rowId: `${checker.checkerId}:${entry.meter?.key ?? '_none'}`,
      checkerId: checker.checkerId,
      checkerType: checker.checkerType,
      displayName,
      oauthAccountId: checker.oauthAccountId,
      isFirstInGroup: index === 0,
      // Finalized below, once group order and the overall flattened index are known.
      showGroupRule: false,
      meter: entry.meter,
      severity: entry.severity,
      checkerSuccess: checker.success,
      checkerError: checker.error,
      checkedAt: checker.checkedAt,
      pending: checker.pending ?? false,
    }));
    return { displayName, groupSeverityRank, rows };
  });

  groups.sort((a, b) => {
    if (a.groupSeverityRank !== b.groupSeverityRank)
      return b.groupSeverityRank - a.groupSeverityRank;
    return a.displayName.localeCompare(b.displayName);
  });

  // The very first row overall is a group head too, but it sits directly
  // under the <thead>, so it gets no divider; every later group head does.
  return groups
    .flatMap((g) => g.rows)
    .map((row, index) => ({
      ...row,
      showGroupRule: row.isFirstInGroup && index > 0,
    }));
}

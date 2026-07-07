import { expect, test, describe } from 'vitest';
import { buildQuotaTableRows, toVisibleRows } from '../quota-table-rows';
import type { QuotaTableRow, QuotaRowSeverity } from '../quota-table-rows';
import type { Meter, QuotaCheckerInfo } from '../../../types/quota';

function meter(overrides: Partial<Meter> & { key: string; status: Meter['status'] }): Meter {
  return {
    label: overrides.key,
    kind: 'allowance',
    unit: 'requests',
    utilizationPercent: 'unknown',
    ...overrides,
  };
}

// Minimal QuotaTableRow builder for toVisibleRows tests — these exercise
// filtering/adjacency logic directly, so tests construct rows by hand rather
// than going through buildQuotaTableRows.
function makeRow(
  overrides: Partial<QuotaTableRow> & {
    rowId: string;
    checkerId: string;
    displayName: string;
    severity: QuotaRowSeverity;
  }
): QuotaTableRow {
  return {
    checkerSuccess: true,
    isFirstInGroup: false,
    pending: false,
    ...overrides,
  };
}

const CHECKERS: (QuotaCheckerInfo & { pending?: boolean })[] = [
  {
    checkerId: 'openrouter-1',
    checkerType: 'openrouter',
    success: true,
    meters: [
      meter({
        key: 'balance',
        label: 'Credit Balance',
        kind: 'balance',
        unit: 'usd',
        status: 'ok',
        remaining: 37.32,
        utilizationPercent: 25,
      }),
    ],
  },
  {
    checkerId: 'nanogpt-1',
    checkerType: 'nanogpt',
    checkedAt: '2026-07-01T12:00:00Z',
    success: true,
    meters: [
      meter({
        key: 'daily',
        label: 'Daily Tokens',
        unit: 'tokens',
        status: 'ok',
        remaining: 3750,
        utilizationPercent: 25,
      }),
      meter({
        key: 'weekly',
        label: 'Weekly Tokens',
        unit: 'tokens',
        status: 'warning',
        remaining: 13500,
        utilizationPercent: 77.5,
      }),
    ],
  },
  {
    checkerId: 'apertis-1',
    checkerType: 'apertis',
    success: true,
    meters: [
      meter({
        key: 'credits',
        label: 'Account Credits',
        kind: 'balance',
        unit: 'usd',
        status: 'ok',
        remaining: 8.5,
        utilizationPercent: 57.5,
      }),
      meter({
        key: 'cycle',
        label: 'Cycle Quota',
        status: 'critical',
        remaining: 80,
        utilizationPercent: 92,
      }),
    ],
  },
  {
    checkerId: 'wafer-1',
    checkerType: 'wafer',
    success: true,
    meters: [
      meter({
        key: 'included',
        label: 'Included Requests',
        status: 'critical',
        remaining: 100,
        utilizationPercent: 95,
      }),
    ],
  },
  {
    checkerId: 'copilot-1',
    checkerType: 'copilot',
    success: true,
    meters: [
      meter({
        key: 'premium',
        label: 'Premium Requests',
        status: 'exhausted',
        remaining: 0,
        utilizationPercent: 100,
      }),
    ],
  },
  {
    checkerId: 'broken-1',
    checkerType: 'broken',
    success: false,
    error: 'HTTP 401: Unauthorized',
    meters: [],
  },
  {
    checkerId: 'empty-1',
    checkerType: 'zzz-empty',
    success: true,
    meters: [],
  },
  {
    checkerId: 'pending-1',
    checkerType: 'pending-type',
    success: false,
    pending: true,
    meters: [],
  },
];

describe('buildQuotaTableRows', () => {
  test('produces one row per meter, plus one row for checkers with no meters', () => {
    const rows = buildQuotaTableRows(CHECKERS);
    // 1 + 2 + 2 + 1 + 1 + 1 + 1 + 1 = 10
    expect(rows).toHaveLength(10);
  });

  test('sorts groups by severity rank, most urgent first, ties broken by displayName', () => {
    const rows = buildQuotaTableRows(CHECKERS);
    const groupOrder = rows.filter((r) => r.isFirstInGroup).map((r) => r.checkerId);
    expect(groupOrder).toEqual([
      'copilot-1', // exhausted
      'broken-1', // error
      'apertis-1', // critical, 'apertis' < 'wafer'
      'wafer-1', // critical
      'nanogpt-1', // warning
      'openrouter-1', // ok, 'openrouter' < 'zzz-empty'
      'empty-1', // ok
      'pending-1', // pending
    ]);
  });

  test("keeps a group's rows adjacent and sorted worst-first within the group", () => {
    const rows = buildQuotaTableRows(CHECKERS);
    const apertisRows = rows.filter((r) => r.checkerId === 'apertis-1');
    expect(apertisRows).toHaveLength(2);
    expect(apertisRows[0].meter?.key).toBe('cycle'); // critical, sorts before...
    expect(apertisRows[1].meter?.key).toBe('credits'); // ...ok
    expect(apertisRows[0].isFirstInGroup).toBe(true);
    expect(apertisRows[1].isFirstInGroup).toBe(false);
  });

  test('a checker with a failed check produces one row with severity "error" and no meter', () => {
    const rows = buildQuotaTableRows(CHECKERS);
    const row = rows.find((r) => r.checkerId === 'broken-1')!;
    expect(row.severity).toBe('error');
    expect(row.meter).toBeUndefined();
    expect(row.checkerSuccess).toBe(false);
    expect(row.checkerError).toBe('HTTP 401: Unauthorized');
    expect(row.pending).toBe(false);
  });

  test('a pending checker produces one row with severity "pending" and no meter', () => {
    const rows = buildQuotaTableRows(CHECKERS);
    const row = rows.find((r) => r.checkerId === 'pending-1')!;
    expect(row.severity).toBe('pending');
    expect(row.meter).toBeUndefined();
    expect(row.pending).toBe(true);
  });

  test('a successful checker with zero meters produces one row with severity "ok" and no meter', () => {
    const rows = buildQuotaTableRows(CHECKERS);
    const row = rows.find((r) => r.checkerId === 'empty-1')!;
    expect(row.severity).toBe('ok');
    expect(row.meter).toBeUndefined();
    expect(row.checkerSuccess).toBe(true);
  });

  test('rowId is unique and stable per meter', () => {
    const rows = buildQuotaTableRows(CHECKERS);
    const ids = rows.map((r) => r.rowId);
    expect(new Set(ids).size).toBe(ids.length);
    const nanogptRows = rows.filter((r) => r.checkerId === 'nanogpt-1');
    expect(nanogptRows.map((r) => r.rowId).sort()).toEqual(
      ['nanogpt-1:daily', 'nanogpt-1:weekly'].sort()
    );
  });

  test('uses displayNameMap when provided, falls back to checkerType otherwise', () => {
    const withMap = buildQuotaTableRows(CHECKERS, new Map([['openrouter', 'OpenRouter']]));
    const mapped = withMap.find((r) => r.checkerId === 'openrouter-1')!;
    expect(mapped.displayName).toBe('OpenRouter');

    const withoutMap = buildQuotaTableRows(CHECKERS);
    const fallback = withoutMap.find((r) => r.checkerId === 'openrouter-1')!;
    expect(fallback.displayName).toBe('openrouter');
  });

  test('checkedAt: present on the checker is copied to every row of that checker', () => {
    const rows = buildQuotaTableRows(CHECKERS);
    const nanogptRows = rows.filter((r) => r.checkerId === 'nanogpt-1');
    expect(nanogptRows).toHaveLength(2);
    for (const r of nanogptRows) {
      expect(r.checkedAt).toBe('2026-07-01T12:00:00Z');
    }
  });

  test('checkedAt: absent on the checker leaves rows undefined', () => {
    const rows = buildQuotaTableRows(CHECKERS);
    const row = rows.find((r) => r.checkerId === 'openrouter-1')!;
    expect(row.checkedAt).toBeUndefined();
  });
});

describe('toVisibleRows', () => {
  test('search matches displayName, checkerType, and meter label, case-insensitively', () => {
    const rows: QuotaTableRow[] = [
      makeRow({
        rowId: 'a',
        checkerId: 'a',
        displayName: 'Alpha Provider',
        checkerType: 'alpha-type',
        severity: 'ok',
      }),
      makeRow({
        rowId: 'b',
        checkerId: 'b',
        displayName: 'Beta',
        checkerType: 'beta-type',
        severity: 'ok',
        meter: meter({ key: 'special', label: 'Special Meter Label', status: 'ok' }),
      }),
      makeRow({
        rowId: 'c',
        checkerId: 'c',
        displayName: 'Gamma',
        checkerType: 'gamma-type',
        severity: 'ok',
      }),
    ];

    // Matches displayName only ('provider' isn't a substring of any checkerType or meter label here).
    expect(toVisibleRows(rows, 'PROVIDER').map((r) => r.rowId)).toEqual(['a']);
    // Matches checkerType only.
    expect(toVisibleRows(rows, 'BETA-TYPE').map((r) => r.rowId)).toEqual(['b']);
    // Matches meter label only.
    expect(toVisibleRows(rows, 'special meter').map((r) => r.rowId)).toEqual(['b']);
  });

  test('whitespace-only search matches all rows', () => {
    const rows: QuotaTableRow[] = [
      makeRow({ rowId: 'a', checkerId: 'a', displayName: 'Alpha', severity: 'ok' }),
      makeRow({ rowId: 'b', checkerId: 'b', displayName: 'Beta', severity: 'critical' }),
    ];
    expect(toVisibleRows(rows, '   ').map((r) => r.rowId)).toEqual(['a', 'b']);
  });

  test('a surviving non-first row becomes the visible group head when the true first row is filtered out', () => {
    const rows: QuotaTableRow[] = [
      makeRow({
        rowId: 'g1',
        checkerId: 'group-1',
        displayName: 'Group',
        checkerType: 'group-critical',
        severity: 'critical',
        isFirstInGroup: true,
      }),
      makeRow({
        rowId: 'g2',
        checkerId: 'group-1',
        displayName: 'Group',
        checkerType: 'group-ok',
        severity: 'ok',
        isFirstInGroup: false,
      }),
    ];
    // Search for 'group-ok' matches only g2's checkerType, filtering out the
    // true first row (g1) and leaving g2 as the sole survivor.
    const visible = toVisibleRows(rows, 'group-ok');
    expect(visible).toHaveLength(1);
    expect(visible[0].rowId).toBe('g2');
    expect(visible[0].visibleIsFirstInGroup).toBe(true);
  });

  test('showGroupRule is false for the first visible row, true for later group heads, false within a group', () => {
    const rows: QuotaTableRow[] = [
      makeRow({
        rowId: 'a1',
        checkerId: 'a',
        displayName: 'Alpha',
        severity: 'critical',
        isFirstInGroup: true,
      }),
      makeRow({
        rowId: 'a2',
        checkerId: 'a',
        displayName: 'Alpha',
        severity: 'ok',
        isFirstInGroup: false,
      }),
      makeRow({
        rowId: 'b1',
        checkerId: 'b',
        displayName: 'Beta',
        severity: 'warning',
        isFirstInGroup: true,
      }),
    ];
    const visible = toVisibleRows(rows, '');
    expect(visible.map((r) => ({ rowId: r.rowId, showGroupRule: r.showGroupRule }))).toEqual([
      { rowId: 'a1', showGroupRule: false }, // very first visible row
      { rowId: 'a2', showGroupRule: false }, // not first-in-group
      { rowId: 'b1', showGroupRule: true }, // later group head
    ]);
  });
});

import { expect, test, describe } from 'vitest';
import { countFailedChecks } from '../quota';

function fulfilled(value: unknown): PromiseSettledResult<unknown> {
  return { status: 'fulfilled', value };
}

function rejected(reason: unknown = new Error('boom')): PromiseSettledResult<unknown> {
  return { status: 'rejected', reason };
}

describe('countFailedChecks', () => {
  test('empty array → 0', () => {
    expect(countFailedChecks([])).toBe(0);
  });

  test('all fulfilled non-null → 0', () => {
    const results = [fulfilled({ ok: true }), fulfilled('data'), fulfilled(0), fulfilled(false)];
    expect(countFailedChecks(results)).toBe(0);
  });

  test('fulfilled null counts as a failure', () => {
    expect(countFailedChecks([fulfilled(null)])).toBe(1);
  });

  test('fulfilled undefined counts as a failure (== null covers both)', () => {
    expect(countFailedChecks([fulfilled(undefined)])).toBe(1);
  });

  test('falsy-but-not-nullish fulfillments do not count (pins == null, not truthiness)', () => {
    expect(countFailedChecks([fulfilled(0)])).toBe(0);
    expect(countFailedChecks([fulfilled('')])).toBe(0);
    expect(countFailedChecks([fulfilled(false)])).toBe(0);
  });

  test('rejected counts as a failure', () => {
    expect(countFailedChecks([rejected()])).toBe(1);
  });

  test('mixed results only count rejected and null/undefined fulfillments', () => {
    const results = [
      fulfilled({ ok: true }),
      fulfilled(null),
      rejected(),
      fulfilled(undefined),
      fulfilled('ok'),
    ];
    expect(countFailedChecks(results)).toBe(3);
  });
});

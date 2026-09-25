import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDatabase,
  getCurrentDialect,
  getDatabase,
  getSchema,
  initializeDatabase,
} from '../../../db/client';
import { runMigrations } from '../../../db/migrate';
import { toDbTimestampMs } from '../../../utils/normalize';
import {
  CompactionInProgressError,
  compactDatabase,
  getDatabaseSize,
  isCompactionInProgress,
} from '../database-compactor';

const testDialect = process.env.PLEXUS_TEST_DIALECT;

async function insertBulkyRows(rows: number) {
  const db = getDatabase() as any;
  const schema = getSchema() as any;
  const at = toDbTimestampMs(Date.now(), getCurrentDialect());
  const label = 'x'.repeat(2000);
  for (let start = 0; start < rows; start += 100) {
    const batch = Array.from({ length: Math.min(100, rows - start) }, (_, i) => ({
      checkerId: 'compactor-test',
      checkerType: 'test',
      provider: 'compactor-test',
      meterKey: `meter-${start + i}`,
      kind: 'allowance',
      unit: '',
      label,
      utilizationState: 'reported',
      status: 'ok',
      checkedAt: at,
      createdAt: at,
    }));
    await db.insert(schema.meterSnapshots).values(batch);
  }
}

describe('database compactor', () => {
  beforeEach(async () => {
    await closeDatabase();
    initializeDatabase(process.env.DATABASE_URL);
    await runMigrations();
  });

  afterEach(async () => {
    await closeDatabase();
  });

  it('reports the size of the active database', async () => {
    const size = await getDatabaseSize();

    expect(size.dialect).toBe(getCurrentDialect());
    expect(size.totalBytes).toBeGreaterThan(0);
    if (size.dialect === 'sqlite') {
      expect(size.reclaimableBytes).toBeGreaterThanOrEqual(0);
    } else {
      expect(size.reclaimableBytes).toBeUndefined();
    }
  });

  it.runIf(testDialect === 'sqlite')('VACUUMs SQLite and returns freed pages to disk', async () => {
    const db = getDatabase() as any;
    const schema = getSchema() as any;
    await insertBulkyRows(2000);
    await db.delete(schema.meterSnapshots);
    expect((await getDatabaseSize()).reclaimableBytes).toBeGreaterThan(1024 * 1024);

    const result = await compactDatabase({ full: true });

    expect(result).toMatchObject({ dialect: 'sqlite', full: false });
    expect(result.afterBytes).toBeLessThan(result.beforeBytes);
    expect(result.reclaimedBytes).toBe(result.beforeBytes - result.afterBytes);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect((await getDatabaseSize()).reclaimableBytes).toBe(0);
  });

  it.runIf(testDialect === 'postgres')('runs VACUUM and VACUUM FULL on Postgres', async () => {
    const plain = await compactDatabase();
    expect(plain).toMatchObject({ dialect: 'postgres', full: false });
    expect(plain.afterBytes).toBeGreaterThan(0);

    const full = await compactDatabase({ full: true });
    expect(full).toMatchObject({ dialect: 'postgres', full: true });
    expect(full.reclaimedBytes).toBeGreaterThanOrEqual(0);
  });

  it('rejects a second compaction while one is running', async () => {
    const first = compactDatabase();
    expect(isCompactionInProgress()).toBe(true);

    await expect(compactDatabase()).rejects.toBeInstanceOf(CompactionInProgressError);
    await expect(first).resolves.toMatchObject({ dialect: getCurrentDialect() });
    expect(isCompactionInProgress()).toBe(false);
  });
});

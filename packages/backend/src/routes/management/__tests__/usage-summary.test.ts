import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerUsageRoutes } from '../usage';
import { UsageStorageService } from '../../../services/observability/usage-storage';
import { closeDatabase, getDatabase, getSchema, initializeDatabase } from '../../../db/client';
import { runMigrations } from '../../../db/migrate';

describe('Usage summary route', () => {
  let fastify: ReturnType<typeof Fastify>;
  let db: ReturnType<typeof getDatabase>;
  let schema: any;

  beforeEach(async () => {
    await closeDatabase();
    process.env.DATABASE_URL = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
    initializeDatabase(process.env.DATABASE_URL);
    await runMigrations();

    db = getDatabase();
    schema = getSchema();

    fastify = Fastify();
    const usageStorage = new UsageStorageService();
    await registerUsageRoutes(fastify, usageStorage);
    await db.delete(schema.requestUsage);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fastify.close();
    await closeDatabase();
  });

  it('aggregates kwhUsed in summary series buckets', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'));

    const now = new Date();
    now.setSeconds(0, 0);

    const bucketOneA = now.getTime() - 2 * 60 * 1000;
    const bucketOneB = bucketOneA + 15 * 1000;
    const bucketTwo = now.getTime() - 60 * 1000;

    await db.insert(schema.requestUsage).values([
      {
        requestId: 'usage-summary-kwh-1',
        date: new Date(bucketOneA).toISOString(),
        startTime: bucketOneA,
        durationMs: 120,
        isStreamed: 0,
        isPassthrough: 0,
        tokensEstimated: 0,
        createdAt: bucketOneA,
        kwhUsed: 0.02,
      },
      {
        requestId: 'usage-summary-kwh-2',
        date: new Date(bucketOneB).toISOString(),
        startTime: bucketOneB,
        durationMs: 100,
        isStreamed: 0,
        isPassthrough: 0,
        tokensEstimated: 0,
        createdAt: bucketOneB,
        kwhUsed: 0.03,
      },
      {
        requestId: 'usage-summary-kwh-3',
        date: new Date(bucketTwo).toISOString(),
        startTime: bucketTwo,
        durationMs: 90,
        isStreamed: 0,
        isPassthrough: 0,
        tokensEstimated: 0,
        createdAt: bucketTwo,
        kwhUsed: 0.01,
      },
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage/summary?range=hour',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      series: Array<{ bucketStartMs: number; kwhUsed: number }>;
      stats: { totalKwhUsed: number };
      today: { kwhUsed: number };
    };

    const expectedBucketOneStartMs = Math.floor(bucketOneA / 60_000) * 60_000;
    const expectedBucketTwoStartMs = Math.floor(bucketTwo / 60_000) * 60_000;

    const bucketOne = body.series.find((point) => point.bucketStartMs === expectedBucketOneStartMs);
    const bucketTwoPoint = body.series.find(
      (point) => point.bucketStartMs === expectedBucketTwoStartMs
    );

    expect(bucketOne).toBeDefined();
    expect(bucketTwoPoint).toBeDefined();
    expect(bucketOne?.kwhUsed).toBeCloseTo(0.05, 8);
    expect(bucketTwoPoint?.kwhUsed).toBeCloseTo(0.01, 8);

    const totalFromSeries = body.series.reduce((sum, point) => sum + point.kwhUsed, 0);
    expect(totalFromSeries).toBeCloseTo(0.06, 8);
    expect(body.stats.totalKwhUsed).toBeCloseTo(0.06, 8);
    expect(body.today.kwhUsed).toBeCloseTo(0.06, 8);
  });

  it('scopes stats to the full selected range, not just the trailing 7 days', async () => {
    const now = new Date();
    now.setSeconds(0, 0);

    const oneDayMs = 24 * 60 * 60 * 1000;
    const recentTime = now.getTime() - 1 * oneDayMs; // inside a trailing 7d window
    const midTime = now.getTime() - 10 * oneDayMs; // outside 7d, inside the requested month range
    const oldTime = now.getTime() - 20 * oneDayMs; // outside 7d, inside the requested month range

    await db.insert(schema.requestUsage).values([
      {
        requestId: 'usage-summary-range-recent',
        date: new Date(recentTime).toISOString(),
        startTime: recentTime,
        durationMs: 100,
        isStreamed: 0,
        isPassthrough: 0,
        tokensEstimated: 0,
        createdAt: recentTime,
        kwhUsed: 0.01,
      },
      {
        requestId: 'usage-summary-range-mid',
        date: new Date(midTime).toISOString(),
        startTime: midTime,
        durationMs: 100,
        isStreamed: 0,
        isPassthrough: 0,
        tokensEstimated: 0,
        createdAt: midTime,
        kwhUsed: 0.02,
      },
      {
        requestId: 'usage-summary-range-old',
        date: new Date(oldTime).toISOString(),
        startTime: oldTime,
        durationMs: 100,
        isStreamed: 0,
        isPassthrough: 0,
        tokensEstimated: 0,
        createdAt: oldTime,
        kwhUsed: 0.04,
      },
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage/summary?range=month',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      stats: { totalRequests: number; totalKwhUsed: number };
    };

    // All three rows fall inside the requested month range (now-30d..now), so
    // `stats` must reflect all of them. Under the pre-fix behavior, `stats`
    // additionally intersected with a hardcoded trailing 7-day bound, which
    // would have silently dropped the mid (10d) and old (20d) rows.
    expect(body.stats.totalRequests).toBe(3);
    expect(body.stats.totalKwhUsed).toBeCloseTo(0.07, 8);
  });
});

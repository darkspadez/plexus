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

  it('exposes token splits, cost, errors, and prevStats for the preceding window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'));

    const now = new Date();
    now.setSeconds(0, 0);

    const minuteMs = 60 * 1000;
    const inWindowA = now.getTime() - 30 * minuteMs; // current hour window
    const inWindowB = now.getTime() - 20 * minuteMs; // current hour window
    const prevWindow = now.getTime() - 90 * minuteMs; // preceding hour window
    const prePrev = now.getTime() - 150 * minuteMs; // before both windows

    const baseRow = {
      durationMs: 100,
      isStreamed: 0,
      isPassthrough: 0,
      tokensEstimated: 0,
    };

    await db.insert(schema.requestUsage).values([
      {
        ...baseRow,
        requestId: 'usage-summary-prev-current-a',
        date: new Date(inWindowA).toISOString(),
        startTime: inWindowA,
        createdAt: inWindowA,
        responseStatus: 'success',
        tokensInput: 100,
        tokensOutput: 50,
        tokensCached: 200,
        tokensCacheWrite: 25,
        costTotal: 0.5,
      },
      {
        ...baseRow,
        requestId: 'usage-summary-prev-current-b',
        date: new Date(inWindowB).toISOString(),
        startTime: inWindowB,
        createdAt: inWindowB,
        responseStatus: 'error',
        tokensInput: 300,
        tokensOutput: 150,
        tokensCached: 0,
        tokensCacheWrite: 0,
        costTotal: 1.0,
      },
      {
        ...baseRow,
        requestId: 'usage-summary-prev-window',
        date: new Date(prevWindow).toISOString(),
        startTime: prevWindow,
        createdAt: prevWindow,
        responseStatus: 'success',
        tokensInput: 10,
        tokensOutput: 5,
        tokensCached: 20,
        tokensCacheWrite: 2,
        costTotal: 0.25,
      },
      {
        ...baseRow,
        requestId: 'usage-summary-pre-prev',
        date: new Date(prePrev).toISOString(),
        startTime: prePrev,
        createdAt: prePrev,
        responseStatus: 'success',
        tokensInput: 999,
        tokensOutput: 999,
        tokensCached: 999,
        tokensCacheWrite: 999,
        costTotal: 99,
      },
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage/summary?range=hour',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      stats: Record<string, number>;
      prevStats: Record<string, number> | null;
    };

    expect(body.stats.totalRequests).toBe(2);
    expect(body.stats.inputTokens).toBe(400);
    expect(body.stats.outputTokens).toBe(200);
    expect(body.stats.cachedTokens).toBe(200);
    expect(body.stats.cacheWriteTokens).toBe(25);
    expect(body.stats.totalTokens).toBe(825);
    expect(body.stats.totalCost).toBeCloseTo(1.5, 8);
    expect(body.stats.totalErrors).toBe(1);

    expect(body.prevStats).not.toBeNull();
    expect(body.prevStats?.totalRequests).toBe(1);
    expect(body.prevStats?.inputTokens).toBe(10);
    expect(body.prevStats?.outputTokens).toBe(5);
    expect(body.prevStats?.cachedTokens).toBe(20);
    expect(body.prevStats?.cacheWriteTokens).toBe(2);
    expect(body.prevStats?.totalTokens).toBe(37);
    expect(body.prevStats?.totalCost).toBeCloseTo(0.25, 8);
    expect(body.prevStats?.totalErrors).toBe(0);
  });

  it('counts a row at exactly rangeStart once, in stats not prevStats', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'));

    const now = new Date();
    now.setSeconds(0, 0);

    const hourMs = 60 * 60 * 1000;
    const rangeStart = now.getTime() - hourMs; // 11:00:00.000 for range=hour
    const lastPrevInstant = rangeStart - 1;

    const baseRow = {
      durationMs: 100,
      isStreamed: 0,
      isPassthrough: 0,
      tokensEstimated: 0,
    };

    await db.insert(schema.requestUsage).values([
      {
        ...baseRow,
        requestId: 'usage-summary-boundary-at-start',
        date: new Date(rangeStart).toISOString(),
        startTime: rangeStart,
        createdAt: rangeStart,
      },
      {
        ...baseRow,
        requestId: 'usage-summary-boundary-prev-edge',
        date: new Date(lastPrevInstant).toISOString(),
        startTime: lastPrevInstant,
        createdAt: lastPrevInstant,
      },
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage/summary?range=hour',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      stats: { totalRequests: number };
      prevStats: { totalRequests: number } | null;
    };

    // The windows abut with no gap and no double-count: the boundary instant
    // belongs to the current window only.
    expect(body.stats.totalRequests).toBe(1);
    expect(body.prevStats?.totalRequests).toBe(1);
  });

  it('returns null prevStats for range=all', async () => {
    const now = new Date();
    now.setSeconds(0, 0);
    const t = now.getTime() - 60 * 1000;

    await db.insert(schema.requestUsage).values([
      {
        requestId: 'usage-summary-all-range',
        date: new Date(t).toISOString(),
        startTime: t,
        durationMs: 100,
        isStreamed: 0,
        isPassthrough: 0,
        tokensEstimated: 0,
        createdAt: t,
      },
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage/summary?range=all',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      stats: { totalRequests: number };
      prevStats: unknown;
    };

    expect(body.stats.totalRequests).toBe(1);
    expect(body.prevStats).toBeNull();
  });

  it('scopes prevStats to the limited principal key', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'));

    const scopedFastify = Fastify();
    scopedFastify.addHook('onRequest', async (request) => {
      request.principal = {
        role: 'limited',
        keyName: 'scoped-key',
        allowedProviders: [],
        allowedModels: [],
        excludedProviders: [],
        excludedModels: [],
        quotaNames: [],
      };
    });
    await registerUsageRoutes(scopedFastify, new UsageStorageService());

    try {
      const now = new Date();
      now.setSeconds(0, 0);
      const minuteMs = 60 * 1000;
      const inWindow = now.getTime() - 30 * minuteMs;
      const prevWindow = now.getTime() - 90 * minuteMs;

      const baseRow = {
        durationMs: 100,
        isStreamed: 0,
        isPassthrough: 0,
        tokensEstimated: 0,
      };

      await db.insert(schema.requestUsage).values([
        {
          ...baseRow,
          requestId: 'usage-summary-scope-current',
          date: new Date(inWindow).toISOString(),
          startTime: inWindow,
          createdAt: inWindow,
          apiKey: 'scoped-key',
          costTotal: 0.1,
        },
        {
          ...baseRow,
          requestId: 'usage-summary-scope-prev-mine',
          date: new Date(prevWindow).toISOString(),
          startTime: prevWindow,
          createdAt: prevWindow,
          apiKey: 'scoped-key',
          costTotal: 0.75,
        },
        {
          ...baseRow,
          requestId: 'usage-summary-scope-prev-other',
          date: new Date(prevWindow).toISOString(),
          startTime: prevWindow,
          createdAt: prevWindow,
          apiKey: 'other-key',
          costTotal: 5,
        },
      ]);

      const response = await scopedFastify.inject({
        method: 'GET',
        url: '/v0/management/usage/summary?range=hour',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json() as {
        stats: { totalRequests: number };
        prevStats: { totalRequests: number; totalCost: number } | null;
      };

      expect(body.stats.totalRequests).toBe(1);
      expect(body.prevStats?.totalRequests).toBe(1);
      expect(body.prevStats?.totalCost).toBeCloseTo(0.75, 8);
    } finally {
      await scopedFastify.close();
    }
  });
});

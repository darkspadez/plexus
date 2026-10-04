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

  it('aggregates tokens and requests in summary series buckets', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'));

    const now = new Date();
    now.setSeconds(0, 0);

    const bucketOneA = now.getTime() - 2 * 60 * 1000;
    const bucketOneB = bucketOneA + 15 * 1000;
    const bucketTwo = now.getTime() - 60 * 1000;

    await db.insert(schema.requestUsage).values([
      {
        requestId: 'usage-summary-1',
        date: new Date(bucketOneA).toISOString(),
        startTime: bucketOneA,
        durationMs: 120,
        isStreamed: 0,
        isPassthrough: 0,
        tokensEstimated: 0,
        tokensInput: 20,
        tokensOutput: 10,
        createdAt: bucketOneA,
      },
      {
        requestId: 'usage-summary-2',
        date: new Date(bucketOneB).toISOString(),
        startTime: bucketOneB,
        durationMs: 100,
        isStreamed: 0,
        isPassthrough: 0,
        tokensEstimated: 0,
        tokensInput: 30,
        tokensOutput: 15,
        createdAt: bucketOneB,
      },
      {
        requestId: 'usage-summary-3',
        date: new Date(bucketTwo).toISOString(),
        startTime: bucketTwo,
        durationMs: 90,
        isStreamed: 0,
        isPassthrough: 0,
        tokensEstimated: 0,
        tokensInput: 10,
        tokensOutput: 5,
        createdAt: bucketTwo,
      },
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage/summary?range=hour',
    });

    expect(response.statusCode).toBe(200);
    expect(response.payload.length).toBeLessThan(16 * 1024);

    const body = response.json() as {
      series: Array<{
        bucketStartMs: number;
        requests: number;
        tokens: number;
        inputTokens: number;
        outputTokens: number;
      }>;
      stats: { totalRequests: number; totalTokens: number };
      today: { requests: number; inputTokens: number; outputTokens: number };
    };

    const expectedBucketOneStartMs = Math.floor(bucketOneA / 60_000) * 60_000;
    const expectedBucketTwoStartMs = Math.floor(bucketTwo / 60_000) * 60_000;

    const bucketOne = body.series.find((point) => point.bucketStartMs === expectedBucketOneStartMs);
    const bucketTwoPoint = body.series.find(
      (point) => point.bucketStartMs === expectedBucketTwoStartMs
    );

    expect(bucketOne).toBeDefined();
    expect(bucketTwoPoint).toBeDefined();
    expect(bucketOne?.requests).toBe(2);
    expect(bucketOne?.tokens).toBe(75);
    expect(bucketTwoPoint?.requests).toBe(1);
    expect(bucketTwoPoint?.tokens).toBe(15);

    expect(body.stats.totalRequests).toBe(3);
    expect(body.stats.totalTokens).toBe(90);
    expect(body.today.requests).toBe(3);
    expect(body.today.inputTokens).toBe(60);
    expect(body.today.outputTokens).toBe(30);
  });

  it('scopes stats to the requested range and returns bounded breakdowns', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'));

    const now = new Date().getTime();
    const rows = [
      {
        requestId: 'usage-summary-old',
        startTime: now - 20 * 24 * 60 * 60 * 1000,
        provider: 'old-provider',
        incomingModelAlias: 'old-model',
        apiKey: 'old-key',
        responseStatus: 'error',
        tokensInput: 1,
        tokensOutput: 2,
        tokensReasoning: 3,
        tokensCached: 4,
        tokensCacheWrite: 5,
        costTotal: 0.5,
        durationMs: 100,
        ttftMs: 20,
        tokensPerSec: 2,
      },
      {
        requestId: 'usage-summary-recent-1',
        startTime: now - 2 * 24 * 60 * 60 * 1000,
        provider: 'recent-provider',
        incomingModelAlias: 'recent-model',
        apiKey: 'recent-key',
        responseStatus: 'success',
        tokensInput: 10,
        tokensOutput: 20,
        tokensReasoning: 30,
        tokensCached: 40,
        tokensCacheWrite: 50,
        costTotal: 1,
        durationMs: 200,
        ttftMs: 40,
        tokensPerSec: 4,
      },
      {
        requestId: 'usage-summary-recent-2',
        startTime: now - 60 * 60 * 1000,
        provider: 'recent-provider',
        incomingModelAlias: 'recent-model',
        apiKey: 'recent-key',
        responseStatus: 'success',
        tokensInput: 11,
        tokensOutput: 21,
        tokensReasoning: 31,
        tokensCached: 41,
        tokensCacheWrite: 51,
        costTotal: 2,
        durationMs: 300,
        ttftMs: 60,
        tokensPerSec: 6,
      },
      {
        requestId: 'usage-summary-outside',
        startTime: now - 40 * 24 * 60 * 60 * 1000,
        provider: 'outside-provider',
        incomingModelAlias: 'outside-model',
        apiKey: 'outside-key',
        responseStatus: 'success',
        tokensInput: 100,
        tokensOutput: 100,
        tokensReasoning: 100,
        tokensCached: 100,
        tokensCacheWrite: 100,
        costTotal: 100,
        durationMs: 100,
        ttftMs: 10,
        tokensPerSec: 1,
      },
    ].map((row) => ({
      ...row,
      date: new Date(row.startTime).toISOString(),
      isStreamed: 0,
      isPassthrough: 0,
      tokensEstimated: 0,
      createdAt: row.startTime,
    }));

    await db.insert(schema.requestUsage).values(rows);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage/summary?range=month&breakdowns=provider&breakdownLimit=1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-usage-summary-cache']).toBe('MISS');
    expect(response.payload.length).toBeLessThan(128 * 1024);
    const body = response.json();
    expect(body.stats.totalRequests).toBe(3);
    expect(body.stats.totalErrors).toBe(1);
    expect(body.stats.totalTokens).toBe(320);
    expect(body.stats.totalCost).toBe(3.5);
    expect(body.stats.avgDurationMs).toBe(200);
    expect(body.grouped.provider.totalDimensions).toBe(2);
    expect(body.grouped.provider.truncated).toBe(true);
    expect(body.grouped.provider.items).toHaveLength(2);
    expect(body.grouped.provider.items[0].name).toBe('recent-provider');
    expect(body.grouped.provider.items[0].requests).toBe(2);
    expect(body.grouped.provider.items[1].name).toBe('Other');
    expect(body.grouped.provider.items[1].requests).toBe(1);
    expect(body.grouped.provider.items[1].totalTokens).toBe(15);
    expect(body.grouped.provider.items[1].totalCost).toBe(0.5);
    expect(body.grouped.provider.items[1].avgDurationMs).toBe(100);
    expect(body.grouped.provider.items[1].avgTtftMs).toBe(20);
    expect(body.grouped.provider.items[1].avgTokensPerSec).toBe(2);

    const otherDimensions = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage/summary?range=month&breakdowns=modelAlias,apiKey,status&breakdownLimit=3',
    });
    expect(otherDimensions.statusCode).toBe(200);
    const otherBody = otherDimensions.json();
    expect(otherBody.grouped.modelAlias.items[0].name).toBe('recent-model');
    expect(otherBody.grouped.apiKey.items[0].name).toBe('recent-k...');
    expect(otherBody.grouped.status.items.map((item: { name: string }) => item.name)).toEqual([
      'success',
      'error',
    ]);

    const cachedResponse = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage/summary?range=month&breakdowns=provider&breakdownLimit=1',
    });
    expect(cachedResponse.headers['x-usage-summary-cache']).toBe('HIT');
    expect(cachedResponse.payload.length).toBeLessThan(128 * 1024);

    const customStart = new Date(now - 20 * 24 * 60 * 60 * 1000 - 60_000).toISOString();
    const customEnd = new Date(now - 20 * 24 * 60 * 60 * 1000 + 60_000).toISOString();
    const customResponse = await fastify.inject({
      method: 'GET',
      url: `/v0/management/usage/summary?range=custom&startDate=${customStart}&endDate=${customEnd}`,
    });

    expect(customResponse.statusCode).toBe(200);
    expect(customResponse.headers['x-usage-summary-cache']).toBe('MISS');
    expect(customResponse.json().stats.totalRequests).toBe(1);
    expect(customResponse.json().stats.totalTokens).toBe(15);
  });

  it('rejects custom ranges longer than twelve months', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'));

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage/summary?range=custom&startDate=2024-01-01T00:00:00.000Z&endDate=2026-07-01T00:00:00.000Z',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('12 months');
  });

  it('applies each preset window independently', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'));

    const now = new Date().getTime();
    const offsets = [
      30 * 60 * 1000,
      20 * 60 * 60 * 1000,
      3 * 24 * 60 * 60 * 1000,
      10 * 24 * 60 * 60 * 1000,
      40 * 24 * 60 * 60 * 1000,
    ];
    await db.insert(schema.requestUsage).values(
      offsets.map((offset, index) => {
        const startTime = now - offset;
        return {
          requestId: `usage-summary-preset-${index}`,
          date: new Date(startTime).toISOString(),
          startTime,
          durationMs: 100,
          isStreamed: 0,
          isPassthrough: 0,
          tokensEstimated: 0,
          tokensInput: 1,
          tokensOutput: 1,
          createdAt: startTime,
        };
      })
    );

    for (const [range, expected] of [
      ['hour', 1],
      ['day', 2],
      ['week', 3],
      ['month', 4],
    ] as const) {
      const response = await fastify.inject({
        method: 'GET',
        url: `/v0/management/usage/summary?range=${range}`,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().stats.totalRequests).toBe(expected);
    }
  });

  // Clock sits mid-minute so step anchoring (sub-hour ranges) and minute
  // anchoring (hour and longer) resolve to different window ends.
  const ANCHOR_CLOCK = '2026-07-07T12:00:47.300Z';
  const ANCHOR_CASES = [
    {
      range: '1m',
      start: '2026-07-07T11:59:45.000Z',
      end: '2026-07-07T12:00:45.000Z',
      stepMs: 5_000,
    },
    {
      range: '5m',
      start: '2026-07-07T11:55:45.000Z',
      end: '2026-07-07T12:00:45.000Z',
      stepMs: 15_000,
    },
    {
      range: '15m',
      start: '2026-07-07T11:45:30.000Z',
      end: '2026-07-07T12:00:30.000Z',
      stepMs: 30_000,
    },
    {
      range: 'hour',
      start: '2026-07-07T11:00:00.000Z',
      end: '2026-07-07T12:00:00.000Z',
      stepMs: 60_000,
    },
  ] as const;

  const insertAnchorRows = async (startMs: number, endMs: number, stepMs: number) => {
    const rows = [
      { requestId: 'anchor-before-start', startTime: startMs - 1 },
      { requestId: 'anchor-at-start', startTime: startMs },
      { requestId: 'anchor-first-bucket-end', startTime: startMs + stepMs - 1 },
      { requestId: 'anchor-second-bucket', startTime: startMs + stepMs },
      { requestId: 'anchor-at-end', startTime: endMs },
      { requestId: 'anchor-after-end', startTime: endMs + 1 },
    ];
    await db.insert(schema.requestUsage).values(
      rows.map((row) => ({
        ...row,
        date: new Date(row.startTime).toISOString(),
        provider: 'anchor-provider',
        responseStatus: 'success',
        durationMs: 100,
        isStreamed: 0,
        isPassthrough: 0,
        tokensEstimated: 0,
        createdAt: row.startTime,
      }))
    );
  };

  it.each(ANCHOR_CASES)(
    'summary range=$range spans $start to $end in $stepMs ms buckets',
    async ({ range, start, end, stepMs }) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(ANCHOR_CLOCK));
      const startMs = Date.parse(start);
      const endMs = Date.parse(end);
      await insertAnchorRows(startMs, endMs, stepMs);

      const response = await fastify.inject({
        method: 'GET',
        url: `/v0/management/usage/summary?range=${range}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        range: string;
        series: Array<{ bucketStartMs: number; requests: number }>;
        stats: { totalRequests: number };
        prevStats: { totalRequests: number } | null;
      };
      expect(body.range).toBe(range);
      // Both bounds are inclusive; the row 1ms before the start falls in the
      // preceding window and the row 1ms after the anchor in neither.
      expect(body.stats.totalRequests).toBe(4);
      expect(body.prevStats?.totalRequests).toBe(1);
      expect(body.series.map(({ bucketStartMs, requests }) => [bucketStartMs, requests])).toEqual([
        [startMs, 2],
        [startMs + stepMs, 1],
        [endMs, 1],
      ]);
    }
  );

  it.each(ANCHOR_CASES)(
    'errors-by-provider range=$range spans $start to $end',
    async ({ range, start, end, stepMs }) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(ANCHOR_CLOCK));
      await insertAnchorRows(Date.parse(start), Date.parse(end), stepMs);

      const response = await fastify.inject({
        method: 'GET',
        url: `/v0/management/usage/errors-by-provider?range=${range}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        {
          provider: 'anchor-provider',
          requests: 4,
          errors: 0,
          errorRate: 0,
          lastErrorMessage: null,
        },
      ]);
    }
  );

  it('rejects unknown ranges on summary and errors-by-provider', async () => {
    for (const endpoint of ['summary', 'errors-by-provider']) {
      for (const range of ['2m', '1h', 'year', 'constructor']) {
        const response = await fastify.inject({
          method: 'GET',
          url: `/v0/management/usage/${endpoint}?range=${range}`,
        });
        expect(response.statusCode, `${endpoint} range=${range}`).toBe(400);
        expect(response.json().error).toBe('Invalid range');
      }
    }
  });

  it('returns a basic summary at the maximum bucket count', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'));

    // A 24h custom range would need 288 five-minute buckets, so the step
    // widens to 864s (100 spans); aligning the start to that step and seeding
    // the inclusive end bound fills the 101-bucket maximum.
    const stepMs = 864_000;
    const startMs = Math.ceil(Date.parse('2026-07-06T00:00:00.000Z') / stepMs) * stepMs;
    const endMs = startMs + 100 * stepMs;
    const rows = Array.from({ length: 101 }, (_, bucket) => {
      const startTime = startMs + bucket * stepMs;
      return [100, 200, 401].map((durationMs, index) => ({
        requestId: `usage-summary-max-buckets-${bucket}-${index}`,
        date: new Date(startTime).toISOString(),
        startTime,
        createdAt: startTime,
        responseStatus: index === 2 ? 'error' : 'success',
        durationMs,
        ttftMs: 411.2 + index * 37.9,
        tokensPerSec: 24.263046301165026 + bucket,
        costTotal: 0.00106585 * (bucket + index + 1),
        tokensInput: 940 + bucket,
        tokensOutput: 1003,
        tokensReasoning: 120,
        tokensCached: 801,
        tokensCacheWrite: 64,
        isStreamed: 0,
        isPassthrough: 0,
        tokensEstimated: 0,
      }));
    }).flat();
    await db.insert(schema.requestUsage).values(rows);

    const response = await fastify.inject({
      method: 'GET',
      url: `/v0/management/usage/summary?range=custom&startDate=${new Date(startMs).toISOString()}&endDate=${new Date(endMs).toISOString()}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().series).toHaveLength(101);
    // Larger than the former 16 KiB basic-summary cap, which answered 413.
    expect(response.payload.length).toBeGreaterThan(16 * 1024);
  });

  it('rejects malformed, reversed, and future custom ranges', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'));

    const cases = [
      'range=custom',
      'range=custom&startDate=not-a-date&endDate=2026-07-07T00:00:00.000Z',
      'range=custom&startDate=2026-07-07T01:00:00.000Z&endDate=2026-07-07T00:00:00.000Z',
      'range=custom&startDate=2026-07-07T00:00:00.000Z&endDate=2026-07-07T13:00:00.000Z',
    ];

    for (const query of cases) {
      const response = await fastify.inject({
        method: 'GET',
        url: `/v0/management/usage/summary?${query}`,
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it('validates breakdown limits and dimensions before querying', async () => {
    const tooManyBreakdowns = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage/summary?breakdowns=provider,modelAlias,apiKey,status',
    });
    expect(tooManyBreakdowns.statusCode).toBe(400);
    expect(tooManyBreakdowns.json().error).toContain('At most 3');

    const invalidBreakdown = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage/summary?breakdowns=sourceIp',
    });
    expect(invalidBreakdown.statusCode).toBe(400);
    expect(invalidBreakdown.json().error).toContain('Unsupported breakdown');

    const invalidLimit = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage/summary?breakdowns=provider&breakdownLimit=51',
    });
    expect(invalidLimit.statusCode).toBe(400);
    expect(invalidLimit.json().error).toContain('between 1 and 50');
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
      },
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/usage/summary?range=month',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      stats: { totalRequests: number; totalDurationMs: number };
    };

    // All three rows fall inside the requested month range (now-30d..now), so
    // `stats` must reflect all of them. Under the pre-fix behavior, `stats`
    // additionally intersected with a hardcoded trailing 7-day bound, which
    // would have silently dropped the mid (10d) and old (20d) rows.
    expect(body.stats.totalRequests).toBe(3);
    expect(body.stats.totalDurationMs).toBe(300);
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

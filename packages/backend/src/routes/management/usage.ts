import { FastifyInstance } from 'fastify';
import { encode } from 'eventsource-encoder';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { getCurrentDialect, getSchema } from '../../db/client';
import {
  UsageStorageService,
  type UsageSortDirection,
  type UsageSortField,
} from '../../services/observability/usage-storage';
import { isLimited, scopedKeyName } from './_principal';

/**
 * Shared range-window resolution for the usage-summary and
 * errors-by-provider endpoints, which otherwise duplicated an identical
 * allow-list check plus a `rangeStart`/`rangeEnd` computation.
 *
 * `'all'` resolves to an epoch `rangeStart`, relying on the existing
 * `gte(startTime, rangeStartMs)` filter in each handler's query to act as a
 * no-op lower bound (mirrors the all-time precedent in metrics.ts, which
 * simply omits a lower-bound filter for its cumulative totals).
 */
function computeUsageRangeWindow(
  range: string,
  startDateStr: string | undefined,
  endDateStr: string | undefined,
  now: Date
): { rangeStart: Date; rangeEnd: Date } | { error: string } {
  if (range === 'custom') {
    if (!startDateStr || !endDateStr) {
      return { error: 'startDate and endDate are required for custom range' };
    }
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return { error: 'Invalid date format' };
    }
    if (endDate < startDate) {
      return { error: 'endDate must be after startDate' };
    }
    return { rangeStart: startDate, rangeEnd: endDate };
  }

  if (!['hour', 'day', 'week', 'month', 'all'].includes(range)) {
    return { error: 'Invalid range' };
  }

  const rangeStart = new Date(now);
  const rangeEnd = new Date(now);
  switch (range) {
    case 'hour':
      rangeStart.setHours(rangeStart.getHours() - 1);
      break;
    case 'day':
      rangeStart.setHours(rangeStart.getHours() - 24);
      break;
    case 'week':
      rangeStart.setDate(rangeStart.getDate() - 7);
      break;
    case 'month':
      rangeStart.setDate(rangeStart.getDate() - 30);
      break;
    case 'all':
      rangeStart.setTime(0);
      break;
  }
  return { rangeStart, rangeEnd };
}

const USAGE_FIELDS = new Set([
  'requestId',
  'clientRequestId',
  'date',
  'sourceIp',
  'apiKey',
  'attribution',
  'incomingApiType',
  'provider',
  'attemptCount',
  'retryHistory',
  'incomingModelAlias',
  'canonicalModelName',
  'selectedModelName',
  'outgoingApiType',
  'tokensInput',
  'tokensOutput',
  'tokensReasoning',
  'tokensCached',
  'tokensCacheWrite',
  'tokensEstimated',
  'costInput',
  'costOutput',
  'costCached',
  'costCacheWrite',
  'costTotal',
  'costSource',
  'costMetadata',
  'startTime',
  'durationMs',
  'ttftMs',
  'tokensPerSec',
  'kwhUsed',
  'isStreamed',
  'isPassthrough',
  'responseStatus',
  'toolsDefined',
  'messageCount',
  'parallelToolCallsEnabled',
  'toolCallsCount',
  'finishReason',
  'hasDebug',
  'hasError',
]);

type UsageStreamEventName = 'started' | 'updated' | 'completed' | 'created';

type UsageStreamClient = {
  scopeKey: string | null;
  send: (eventType: UsageStreamEventName, record: any) => void;
};

export class UsageEventsBroadcaster {
  private readonly clients = new Set<UsageStreamClient>();
  private listening = false;
  private readonly startedListener = (record: any) => this.broadcast('started', record);
  private readonly updatedListener = (record: any) => this.broadcast('updated', record);
  private readonly completedListener = (record: any) => this.broadcast('completed', record);
  private readonly createdListener = (record: any) => this.broadcast('completed', record);

  constructor(readonly usageStorage: UsageStorageService) {}

  subscribe(client: UsageStreamClient): () => void {
    // Attach storage listeners lazily so constructing the broadcaster has no
    // side effects until the first SSE client connects.
    if (!this.listening) {
      this.listening = true;
      this.usageStorage.on('started', this.startedListener);
      this.usageStorage.on('updated', this.updatedListener);
      this.usageStorage.on('completed', this.completedListener);
      // Also listen for 'created' for backward compatibility
      this.usageStorage.on('created', this.createdListener);
    }

    this.clients.add(client);

    return () => {
      this.clients.delete(client);
    };
  }

  dispose(): void {
    if (this.listening) {
      this.listening = false;
      this.usageStorage.off('started', this.startedListener);
      this.usageStorage.off('updated', this.updatedListener);
      this.usageStorage.off('completed', this.completedListener);
      this.usageStorage.off('created', this.createdListener);
    }
    this.clients.clear();
  }

  private broadcast(eventType: UsageStreamEventName, record: any): void {
    for (const client of this.clients) {
      if (client.scopeKey && record?.apiKey !== client.scopeKey) continue;
      client.send(eventType, record);
    }
  }
}

export async function registerUsageRoutes(
  fastify: FastifyInstance,
  usageStorage: UsageStorageService
) {
  const usageEventsBroadcaster = new UsageEventsBroadcaster(usageStorage);

  fastify.addHook('onClose', async () => {
    usageEventsBroadcaster.dispose();
  });

  const sortableFields = new Set<UsageSortField>([
    'date',
    'apiKey',
    'provider',
    'incomingModelAlias',
    'costTotal',
    'durationMs',
  ]);

  fastify.get('/v0/management/usage', async (request, reply) => {
    const query = request.query as any;
    const limit = parseInt(query.limit || '50');
    const offset = parseInt(query.offset || '0');
    const sortBy = sortableFields.has(query.sortBy as UsageSortField)
      ? (query.sortBy as UsageSortField)
      : 'date';
    const sortDir: UsageSortDirection = query.sortDir === 'asc' ? 'asc' : 'desc';
    const rawFields = typeof query.fields === 'string' ? query.fields : '';
    const requestedFields = rawFields
      .split(',')
      .map((field: string) => field.trim())
      .filter((field: string) => USAGE_FIELDS.has(field));

    const filters: any = {
      startDate: query.startDate,
      endDate: query.endDate,
      requestId: query.requestId,
      clientRequestId: query.clientRequestId,
      apiKey: query.apiKey,
      incomingApiType: query.incomingApiType,
      provider: query.provider,
      incomingModelAlias: query.incomingModelAlias,
      selectedModelName: query.selectedModelName,
      outgoingApiType: query.outgoingApiType,
      responseStatus: query.responseStatus,
    };

    if (query.minDurationMs) filters.minDurationMs = parseInt(query.minDurationMs);
    if (query.maxDurationMs) filters.maxDurationMs = parseInt(query.maxDurationMs);

    // Limited users are force-scoped to their own key (exact match), regardless
    // of any client-supplied apiKey filter.
    const scopeKey = scopedKeyName(request);
    if (scopeKey) {
      filters.apiKey = scopeKey;
      filters.apiKeyMatch = 'exact';
    }

    try {
      const result = await usageStorage.getUsage(filters, { limit, offset, sortBy, sortDir });
      if (requestedFields.length === 0) {
        return reply.send(result);
      }

      const filteredData = result.data.map((record: any) => {
        const filtered: Record<string, unknown> = {};
        for (const field of requestedFields) {
          filtered[field] = record[field];
        }
        return filtered;
      });

      return reply.send({
        data: filteredData,
        total: result.total,
      });
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  fastify.get('/v0/management/usage/summary', async (request, reply) => {
    const query = request.query as any;
    const range = query.range || 'day';
    const startDateStr = query.startDate;
    const endDateStr = query.endDate;

    const now = new Date();
    now.setSeconds(0, 0);

    const window = computeUsageRangeWindow(range, startDateStr, endDateStr, now);
    if ('error' in window) {
      return reply.code(400).send({ error: window.error });
    }
    const { rangeStart, rangeEnd } = window;

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    let stepSeconds = 60;
    if (range === 'custom' || range === 'all') {
      // Calculate appropriate step based on range duration (adaptive bucketing).
      // 'all' shares this branch since its true duration is unbounded (epoch
      // rangeStart), same as a long custom range.
      const durationMs = rangeEnd.getTime() - rangeStart.getTime();
      const durationMinutes = durationMs / (1000 * 60);
      const durationSeconds = durationMs / 1000;

      // Adaptive bucketing thresholds (matching frontend LiveTab)
      const useMinuteBuckets = durationMinutes <= 30;
      const use5MinuteBuckets = durationMinutes <= 24 * 60;
      const useHourlyBuckets = durationMinutes <= 7 * 24 * 60;

      if (useMinuteBuckets) {
        stepSeconds = 60; // 1-minute buckets
      } else if (use5MinuteBuckets) {
        stepSeconds = 300; // 5-minute buckets
      } else if (useHourlyBuckets) {
        stepSeconds = 3600; // 1-hour buckets
      } else {
        stepSeconds = 21600; // 6-hour buckets for very long ranges
      }

      // Ensure maximum 100 buckets to prevent performance issues
      const maxBuckets = 100;
      const calculatedBuckets = Math.ceil(durationSeconds / stepSeconds);
      if (calculatedBuckets > maxBuckets) {
        stepSeconds = Math.ceil(durationSeconds / maxBuckets);
      }
    } else {
      switch (range) {
        case 'hour':
          stepSeconds = 60;
          break;
        case 'day':
          stepSeconds = 60 * 60;
          break;
        case 'week':
        case 'month':
          stepSeconds = 60 * 60 * 24;
          break;
      }
    }

    const db = usageStorage.getDb();
    const schema = getSchema();
    const dialect = getCurrentDialect();
    const stepMs = stepSeconds * 1000;
    const nowMs = now.getTime();
    const rangeStartMs = rangeStart.getTime();
    const rangeEndMs = rangeEnd.getTime();
    const todayStartMs = todayStart.getTime();

    const stepMsLiteral = sql.raw(String(stepMs));
    const bucketStartMs =
      dialect === 'sqlite'
        ? sql<number>`CAST((CAST(${schema.requestUsage.startTime} AS INTEGER) / ${stepMsLiteral}) * ${stepMsLiteral} AS INTEGER)`
        : sql<number>`FLOOR(${schema.requestUsage.startTime}::double precision / ${stepMsLiteral}) * ${stepMsLiteral}`;

    const toNumber = (value: unknown) =>
      value === null || value === undefined ? 0 : Number(value);

    // Scope by the limited user's key if applicable.
    const summaryScopeKey = scopedKeyName(request);
    const keyFilter = summaryScopeKey ? eq(schema.requestUsage.apiKey, summaryScopeKey) : undefined;

    try {
      const seriesRows = await db
        .select({
          bucketStartMs,
          requests: sql<number>`COUNT(*)`,
          inputTokens: sql<number>`COALESCE(SUM(${schema.requestUsage.tokensInput}), 0)`,
          outputTokens: sql<number>`COALESCE(SUM(${schema.requestUsage.tokensOutput}), 0)`,
          cachedTokens: sql<number>`COALESCE(SUM(${schema.requestUsage.tokensCached}), 0)`,
          cacheWriteTokens: sql<number>`COALESCE(SUM(${schema.requestUsage.tokensCacheWrite}), 0)`,
          kwhUsed: sql<number>`COALESCE(SUM(${schema.requestUsage.kwhUsed}), 0)`,
          errors: sql<number>`COALESCE(SUM(CASE WHEN ${schema.requestUsage.responseStatus} != 'success' THEN 1 ELSE 0 END), 0)`,
        })
        .from(schema.requestUsage)
        .where(
          and(
            gte(schema.requestUsage.startTime, rangeStartMs),
            lte(schema.requestUsage.startTime, rangeEndMs),
            ...(keyFilter ? [keyFilter] : [])
          )
        )
        .groupBy(bucketStartMs)
        .orderBy(bucketStartMs);

      const emptyWindowStats = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        cacheWriteTokens: 0,
        kwhUsed: 0,
        totalCost: 0,
        avgDurationMs: 0,
        totalDurationMs: 0,
        errors: 0,
      };

      const fetchWindowStats = async (startMs: number, endMs: number) => {
        const rows = await db
          .select({
            requests: sql<number>`COUNT(*)`,
            inputTokens: sql<number>`COALESCE(SUM(${schema.requestUsage.tokensInput}), 0)`,
            outputTokens: sql<number>`COALESCE(SUM(${schema.requestUsage.tokensOutput}), 0)`,
            cachedTokens: sql<number>`COALESCE(SUM(${schema.requestUsage.tokensCached}), 0)`,
            cacheWriteTokens: sql<number>`COALESCE(SUM(${schema.requestUsage.tokensCacheWrite}), 0)`,
            kwhUsed: sql<number>`COALESCE(SUM(${schema.requestUsage.kwhUsed}), 0)`,
            totalCost: sql<number>`COALESCE(SUM(${schema.requestUsage.costTotal}), 0)`,
            avgDurationMs: sql<number>`COALESCE(AVG(${schema.requestUsage.durationMs}), 0)`,
            totalDurationMs: sql<number>`COALESCE(SUM(${schema.requestUsage.durationMs}), 0)`,
            errors: sql<number>`COALESCE(SUM(CASE WHEN ${schema.requestUsage.responseStatus} != 'success' THEN 1 ELSE 0 END), 0)`,
          })
          .from(schema.requestUsage)
          .where(
            and(
              gte(schema.requestUsage.startTime, startMs),
              lte(schema.requestUsage.startTime, endMs),
              ...(keyFilter ? [keyFilter] : [])
            )
          );
        return rows[0] || emptyWindowStats;
      };

      const statsRow = await fetchWindowStats(rangeStartMs, rangeEndMs);

      // Prior window of equal length ending 1ms before the selected range —
      // powers the dashboard's delta chips. 'all' starts at the epoch, so no
      // prior window exists for it.
      const windowLengthMs = rangeEndMs - rangeStartMs;
      const prevStatsRow =
        range === 'all'
          ? null
          : await fetchWindowStats(rangeStartMs - windowLengthMs, rangeStartMs - 1);

      const todayRows = await db
        .select({
          requests: sql<number>`COUNT(*)`,
          inputTokens: sql<number>`COALESCE(SUM(${schema.requestUsage.tokensInput}), 0)`,
          outputTokens: sql<number>`COALESCE(SUM(${schema.requestUsage.tokensOutput}), 0)`,
          reasoningTokens: sql<number>`COALESCE(SUM(${schema.requestUsage.tokensReasoning}), 0)`,
          cachedTokens: sql<number>`COALESCE(SUM(${schema.requestUsage.tokensCached}), 0)`,
          cacheWriteTokens: sql<number>`COALESCE(SUM(${schema.requestUsage.tokensCacheWrite}), 0)`,
          kwhUsed: sql<number>`COALESCE(SUM(${schema.requestUsage.kwhUsed}), 0)`,
          totalCost: sql<number>`COALESCE(SUM(${schema.requestUsage.costTotal}), 0)`,
        })
        .from(schema.requestUsage)
        .where(
          and(
            gte(schema.requestUsage.startTime, todayStartMs),
            lte(schema.requestUsage.startTime, nowMs),
            ...(keyFilter ? [keyFilter] : [])
          )
        );

      const todayRow = todayRows[0] || {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cachedTokens: 0,
        cacheWriteTokens: 0,
        kwhUsed: 0,
        totalCost: 0,
      };

      const toWindowStatsPayload = (row: typeof emptyWindowStats) => ({
        totalRequests: toNumber(row.requests),
        totalTokens:
          toNumber(row.inputTokens) +
          toNumber(row.outputTokens) +
          toNumber(row.cachedTokens) +
          toNumber(row.cacheWriteTokens),
        inputTokens: toNumber(row.inputTokens),
        outputTokens: toNumber(row.outputTokens),
        cachedTokens: toNumber(row.cachedTokens),
        cacheWriteTokens: toNumber(row.cacheWriteTokens),
        totalCost: toNumber(row.totalCost),
        totalKwhUsed: toNumber(row.kwhUsed),
        avgDurationMs: toNumber(row.avgDurationMs),
        totalDurationMs: toNumber(row.totalDurationMs),
        totalErrors: toNumber(row.errors),
      });

      return reply.send({
        range,
        series: seriesRows.map((row: any) => ({
          bucketStartMs: toNumber(row.bucketStartMs),
          requests: toNumber(row.requests),
          inputTokens: toNumber(row.inputTokens),
          outputTokens: toNumber(row.outputTokens),
          cachedTokens: toNumber(row.cachedTokens),
          cacheWriteTokens: toNumber(row.cacheWriteTokens),
          kwhUsed: toNumber(row.kwhUsed),
          errors: toNumber(row.errors),
          tokens:
            toNumber(row.inputTokens) +
            toNumber(row.outputTokens) +
            toNumber(row.cachedTokens) +
            toNumber(row.cacheWriteTokens),
        })),
        stats: toWindowStatsPayload(statsRow),
        prevStats: prevStatsRow ? toWindowStatsPayload(prevStatsRow) : null,
        today: {
          requests: toNumber(todayRow.requests),
          inputTokens: toNumber(todayRow.inputTokens),
          outputTokens: toNumber(todayRow.outputTokens),
          reasoningTokens: toNumber(todayRow.reasoningTokens),
          cachedTokens: toNumber(todayRow.cachedTokens),
          cacheWriteTokens: toNumber(todayRow.cacheWriteTokens),
          kwhUsed: toNumber(todayRow.kwhUsed),
          totalCost: toNumber(todayRow.totalCost),
        },
      });
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  fastify.get('/v0/management/usage/errors-by-provider', async (request, reply) => {
    const query = request.query as any;
    const range = query.range || 'day';
    const startDateStr = query.startDate;
    const endDateStr = query.endDate;

    const now = new Date();
    now.setSeconds(0, 0);

    const window = computeUsageRangeWindow(range, startDateStr, endDateStr, now);
    if ('error' in window) {
      return reply.code(400).send({ error: window.error });
    }
    const { rangeStart, rangeEnd } = window;

    const db = usageStorage.getDb();
    const schema = getSchema();
    const rangeStartMs = rangeStart.getTime();
    const rangeEndMs = rangeEnd.getTime();

    const toNumber = (value: unknown) =>
      value === null || value === undefined ? 0 : Number(value);

    // Scope by the limited user's key if applicable.
    const errorsByProviderScopeKey = scopedKeyName(request);
    const keyFilter = errorsByProviderScopeKey
      ? eq(schema.requestUsage.apiKey, errorsByProviderScopeKey)
      : undefined;

    try {
      const rows = await db
        .select({
          provider: schema.requestUsage.provider,
          requests: sql<number>`COUNT(*)`,
          errors: sql<number>`COALESCE(SUM(CASE WHEN ${schema.requestUsage.responseStatus} != 'success' THEN 1 ELSE 0 END), 0)`,
        })
        .from(schema.requestUsage)
        .where(
          and(
            gte(schema.requestUsage.startTime, rangeStartMs),
            lte(schema.requestUsage.startTime, rangeEndMs),
            ...(keyFilter ? [keyFilter] : [])
          )
        )
        .groupBy(schema.requestUsage.provider)
        .orderBy(schema.requestUsage.provider);

      const lastErrorRows = await db
        .select({
          provider: schema.requestUsage.provider,
          errorMessage: schema.inferenceErrors.errorMessage,
          createdAt: schema.inferenceErrors.createdAt,
        })
        .from(schema.requestUsage)
        .innerJoin(
          schema.inferenceErrors,
          eq(schema.inferenceErrors.requestId, schema.requestUsage.requestId)
        )
        .where(
          and(
            gte(schema.requestUsage.startTime, rangeStartMs),
            lte(schema.requestUsage.startTime, rangeEndMs),
            sql`${schema.requestUsage.responseStatus} != 'success'`,
            ...(keyFilter ? [keyFilter] : [])
          )
        )
        .orderBy(desc(schema.inferenceErrors.createdAt));

      const lastErrorByProvider = new Map<string, string>();
      for (const row of lastErrorRows as any[]) {
        if (!row.provider) continue;
        if (lastErrorByProvider.has(row.provider)) continue;
        lastErrorByProvider.set(row.provider, row.errorMessage);
      }

      return reply.send(
        rows.map((row: any) => {
          const requests = toNumber(row.requests);
          const errors = toNumber(row.errors);
          return {
            provider: row.provider,
            requests,
            errors,
            errorRate: requests > 0 ? errors / requests : 0,
            lastErrorMessage: lastErrorByProvider.get(row.provider) ?? null,
          };
        })
      );
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  fastify.delete('/v0/management/usage', async (request, reply) => {
    if (isLimited(request)) {
      return reply.code(403).send({
        error: { message: 'Admin privileges required', type: 'forbidden', code: 403 },
      });
    }
    const query = request.query as any;
    const olderThanDays = query.olderThanDays;
    let beforeDate: Date | undefined;

    if (olderThanDays) {
      const days = parseInt(olderThanDays);
      if (!isNaN(days)) {
        beforeDate = new Date();
        beforeDate.setDate(beforeDate.getDate() - days);
      }
    }

    const success = await usageStorage.deleteAllUsageLogs(beforeDate);
    if (!success) return reply.code(500).send({ error: 'Failed to delete usage logs' });
    return reply.send({ success: true });
  });

  fastify.delete('/v0/management/usage/:requestId', async (request, reply) => {
    if (isLimited(request)) {
      return reply.code(403).send({
        error: { message: 'Admin privileges required', type: 'forbidden', code: 403 },
      });
    }
    const params = request.params as any;
    const requestId = params.requestId;
    const success = await usageStorage.deleteUsageLog(requestId);
    if (!success)
      return reply.code(404).send({ error: 'Usage log not found or could not be deleted' });
    return reply.send({ success: true });
  });

  fastify.get('/v0/management/events', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Limited users must only observe activity for their own key. Admins
    // (scopeKey === null) continue to receive every event.
    const scopeKey = scopedKeyName(request);

    // Helper to send events to the client
    const sendEvent = (eventType: UsageStreamEventName, record: any) => {
      if (reply.raw.destroyed) return;
      if (scopeKey && record?.apiKey !== scopeKey) return;
      try {
        reply.raw.write(
          encode({
            data: JSON.stringify(record),
            event: eventType,
            id: String(Date.now()),
          })
        );
      } catch {
        // Fire-and-forget: ignore write errors
      }
    };

    // Periodic progress updates for in-flight requests (every 1s, fire-and-forget)
    const progressInterval = setInterval(() => {
      if (reply.raw.destroyed) return;
      const updates = usageStorage.getProgressUpdates();
      for (const update of updates) {
        if (scopeKey && update.apiKey !== scopeKey) continue;
        try {
          reply.raw.write(
            encode({
              data: JSON.stringify(update),
              event: 'progress',
              id: String(Date.now()),
            })
          );
        } catch {
          // Fire-and-forget: ignore write errors
        }
      }
    }, 1000);
    progressInterval.unref?.();

    // Cleanup on server shutdown (closeAllConnections destroys sockets → 'close' fires)
    // and as a fallback for other disconnect scenarios.
    let cleanedUp = false;
    const unsubscribe = usageEventsBroadcaster.subscribe({
      scopeKey,
      send: sendEvent,
    });
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearInterval(progressInterval);
      unsubscribe();
    };

    reply.raw.once('close', cleanup);
    reply.raw.once('error', cleanup);

    try {
      // Keep connection alive with periodic pings
      while (!reply.raw.destroyed) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        if (!reply.raw.destroyed) {
          reply.raw.write(
            encode({
              event: 'ping',
              data: 'pong',
              id: String(Date.now()),
            })
          );
        }
      }
    } finally {
      // Cleanup: socket destroyed (client disconnect or server shutdown)
      cleanup();
    }
  });
}

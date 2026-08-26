import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { setConfigForTesting } from '../../../config';
import { closeDatabase, getDatabase, getSchema, initializeDatabase } from '../../../db/client';
import { ConfigRepository } from '../../../db/config-repository';
import { runMigrations } from '../../../db/migrate';
import { ConfigService } from '../../../services/configuration/config-service';
import { logger } from '../../../utils/logger';
import { registerSpy } from '../../../../test/test-utils';
import { registerConfigRoutes } from '../config';
import { authenticate, ManagementAuthError, requireAdmin } from '../_principal';

const ADMIN_KEY = 'task-12-admin-key';
const LIMITED_KEY = 'sk-task-12-limited';
const TARGET_KEY = 'task-12-target-secret';
const TARGET_NAME = 'task-12-target';

type PauseResponse = {
  readonly result: 'paused' | 'already_paused' | 'resumed' | 'not_paused';
  readonly key: { readonly fingerprint: string; readonly pausedAt?: number };
};

type HistoryResponse = {
  readonly events: readonly {
    readonly id: number;
    readonly eventKind: string;
    readonly evidence: unknown;
  }[];
};

describe('API key security administration routes', () => {
  let fastify: FastifyInstance;
  let db: ReturnType<typeof getDatabase>;
  let schema: ReturnType<typeof getSchema>;

  beforeEach(async () => {
    await closeDatabase();
    const databaseUrl = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('Test database URL is required');
    initializeDatabase(databaseUrl);
    await runMigrations();
    db = getDatabase();
    schema = getSchema();
    await db.delete(schema.apiKeySecurityEvents);
    await db.delete(schema.apiKeyRequestBuckets);
    await db.delete(schema.apiKeys);

    ConfigService.resetInstance();
    const configService = new ConfigService(new ConfigRepository());
    await configService.getRepository().saveKey(TARGET_NAME, { secret: TARGET_KEY });
    await configService.getRepository().saveKey('task-12-limited', { secret: LIMITED_KEY });
    process.env.ADMIN_KEY = ADMIN_KEY;
    setConfigForTesting({
      providers: {},
      models: {},
      keys: {},
      failover: { enabled: false, retryableStatusCodes: [], retryableErrors: [] },
      quotas: [],
    });

    fastify = Fastify();
    fastify.setErrorHandler((error, _request, reply) => {
      if (error instanceof ManagementAuthError) {
        return reply.code(error.statusCode).send(error.authBody);
      }
      throw error;
    });
    fastify.register(async (admin) => {
      admin.addHook('preHandler', authenticate);
      admin.addHook('preHandler', requireAdmin);
      await registerConfigRoutes(admin);
    });
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    ConfigService.resetInstance();
    await closeDatabase();
  });

  it('requires nonblank reasons before a manual transition', async () => {
    // Given
    // A valid target key with no security history.

    // When
    const pause = await fastify.inject({
      method: 'POST',
      url: `/v0/management/keys/${TARGET_NAME}/pause`,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { reason: '   ' },
    });
    const resume = await fastify.inject({
      method: 'POST',
      url: `/v0/management/keys/${TARGET_NAME}/resume`,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: {},
    });

    // Then
    expect(pause.statusCode).toBe(400);
    expect(resume.statusCode).toBe(400);
    const history = await fastify.inject({
      method: 'GET',
      url: `/v0/management/keys/${TARGET_NAME}/security-events`,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(history.json<HistoryResponse>().events).toEqual([]);
  });

  it('returns public projections for idempotent pause and resume transitions', async () => {
    // Given
    const pauseUrl = `/v0/management/keys/${TARGET_NAME}/pause`;
    const resumeUrl = `/v0/management/keys/${TARGET_NAME}/resume`;

    // When
    const firstPause = await fastify.inject({
      method: 'POST',
      url: pauseUrl,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { reason: 'incident review' },
    });
    const repeatedPause = await fastify.inject({
      method: 'POST',
      url: pauseUrl,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { reason: 'incident review' },
    });
    const firstResume = await fastify.inject({
      method: 'POST',
      url: resumeUrl,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { reason: 'operator cleared' },
    });
    const repeatedResume = await fastify.inject({
      method: 'POST',
      url: resumeUrl,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { reason: 'operator cleared' },
    });

    // Then
    expect(firstPause.statusCode).toBe(200);
    expect(firstPause.json<PauseResponse>().result).toBe('paused');
    expect(repeatedPause.json<PauseResponse>().result).toBe('already_paused');
    expect(firstResume.json<PauseResponse>().result).toBe('resumed');
    expect(repeatedResume.json<PauseResponse>().result).toBe('not_paused');
    expect(firstPause.body).not.toContain(TARGET_KEY);
    expect(firstPause.json<PauseResponse>().key.fingerprint).toHaveLength(8);
  });

  it('logs persisted pause and resume event IDs without sensitive transition details', async () => {
    // Given
    const auditLog = registerSpy(logger, 'info');
    const pauseReason = 'private pause reason';
    const resumeReason = 'private resume reason';

    // When
    await fastify.inject({
      method: 'POST',
      url: `/v0/management/keys/${TARGET_NAME}/pause`,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { reason: pauseReason },
    });
    const [pauseEvent] = await db
      .select({ id: schema.apiKeySecurityEvents.id })
      .from(schema.apiKeySecurityEvents)
      .where(
        and(
          eq(schema.apiKeySecurityEvents.keyName, TARGET_NAME),
          eq(schema.apiKeySecurityEvents.eventKind, 'manual_pause')
        )
      );
    await fastify.inject({
      method: 'POST',
      url: `/v0/management/keys/${TARGET_NAME}/pause`,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { reason: pauseReason },
    });
    await fastify.inject({
      method: 'POST',
      url: `/v0/management/keys/${TARGET_NAME}/resume`,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { reason: resumeReason },
    });
    const [resumeEvent] = await db
      .select({ id: schema.apiKeySecurityEvents.id })
      .from(schema.apiKeySecurityEvents)
      .where(
        and(
          eq(schema.apiKeySecurityEvents.keyName, TARGET_NAME),
          eq(schema.apiKeySecurityEvents.eventKind, 'resume')
        )
      );
    await fastify.inject({
      method: 'POST',
      url: `/v0/management/keys/${TARGET_NAME}/resume`,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { reason: resumeReason },
    });

    // Then
    expect(pauseEvent?.id).toBeTypeOf('number');
    expect(resumeEvent?.id).toBeTypeOf('number');
    expect(auditLog).toHaveBeenCalledWith(
      `[AUDIT] API key pause transition key='${TARGET_NAME}' eventId='${pauseEvent?.id}'`
    );
    expect(auditLog).toHaveBeenCalledWith(
      `[AUDIT] API key resume transition key='${TARGET_NAME}' eventId='${resumeEvent?.id}'`
    );
    expect(auditLog).toHaveBeenCalledTimes(2);
    const messages = auditLog.mock.calls
      .map((call: readonly unknown[]) => String(call[0]))
      .join('\n');
    expect(messages).not.toContain(pauseReason);
    expect(messages).not.toContain(resumeReason);
    expect(messages).not.toContain(TARGET_KEY);
  });

  it('paginates structured event evidence and redacts the active pause reason from status', async () => {
    // Given
    await fastify.inject({
      method: 'POST',
      url: `/v0/management/keys/${TARGET_NAME}/pause`,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { reason: 'sensitive operational reason' },
    });
    await fastify.inject({
      method: 'POST',
      url: `/v0/management/keys/${TARGET_NAME}/resume`,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { reason: 'approved' },
    });

    // When
    const history = await fastify.inject({
      method: 'GET',
      url: `/v0/management/keys/${TARGET_NAME}/security-events?limit=1&offset=0`,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    const status = await fastify.inject({
      method: 'GET',
      url: `/v0/management/keys/${TARGET_NAME}/security-status`,
      headers: { 'x-admin-key': ADMIN_KEY },
    });

    // Then
    expect(history.statusCode).toBe(200);
    expect(history.json<HistoryResponse>().events).toHaveLength(1);
    expect(history.json<HistoryResponse>().events[0]?.evidence).toMatchObject({
      callerId: 'admin',
      source: 'admin',
    });
    expect(status.statusCode).toBe(200);
    expect(status.body).not.toContain('sensitive operational reason');
    expect(status.body).not.toContain(TARGET_KEY);
  });

  it('returns a generic forbidden response to a limited principal on every security route', async () => {
    // Given
    const routes = [
      { method: 'POST' as const, suffix: 'pause', payload: { reason: 'review' } },
      { method: 'POST' as const, suffix: 'resume', payload: { reason: 'review' } },
      { method: 'GET' as const, suffix: 'security-status' },
      { method: 'GET' as const, suffix: 'security-events' },
    ];

    // When
    const responses = await Promise.all(
      routes.map((route) =>
        fastify.inject({
          method: route.method,
          url: `/v0/management/keys/${TARGET_NAME}/${route.suffix}`,
          headers: { 'x-admin-key': LIMITED_KEY },
          payload: route.payload,
        })
      )
    );

    // Then
    expect(responses.every((response) => response.statusCode === 403)).toBe(true);
    expect(responses.every((response) => !response.body.includes(TARGET_NAME))).toBe(true);
  });
});

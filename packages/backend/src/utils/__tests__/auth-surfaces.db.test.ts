import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase, getSchema } from '../../db/client';
import { setConfigForTesting } from '../../config';
import { ApiKeyActivityRecorder } from '../../services/api-key-security/activity-recorder';
import { ApiKeyPauseService } from '../../services/api-key-security/api-key-pause-service';
import {
  ADMIN_SECRET,
  activeConfig,
  closeAuthDatabase,
  insertAuthKey,
  registerBearerSurface,
  registerManagementSurface,
  resetAuthDatabase,
  routeConfig,
} from '../../../test/auth-db-fixtures';

describe('database-backed authentication surfaces', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    await resetAuthDatabase();
    process.env.ADMIN_KEY = ADMIN_SECRET;
  });

  afterEach(async () => {
    await fastify?.close();
    await ApiKeyActivityRecorder.getInstance().stop();
    ApiKeyActivityRecorder.resetForTesting();
    await closeAuthDatabase();
  });

  it('rejects a paused credential generically on inference, MCP, raw, and limited management surfaces', async () => {
    // Given
    const secret = 'sk-paused-surface-secret';
    await insertAuthKey('paused-key', secret, {
      comment: 'database-paused',
      pausedAt: Date.now(),
      pauseSource: 'automatic-private-source',
      pauseReason: 'private-pause-reason',
    });
    setConfigForTesting(routeConfig(activeConfig('paused-key', secret)));
    fastify = Fastify();
    await registerBearerSurface(fastify, '/inference');
    await registerBearerSurface(fastify, '/mcp');
    await registerBearerSurface(fastify, '/raw', false);
    await registerManagementSurface(fastify);
    await fastify.ready();

    // When
    const bearerResponses = await Promise.all(
      ['/inference', '/mcp', '/raw'].map((url) =>
        fastify.inject({
          method: 'GET',
          url,
          headers: { authorization: `Bearer ${secret}` },
        })
      )
    );
    const limitedManagement = await fastify.inject({
      method: 'GET',
      url: '/management',
      headers: { 'x-admin-key': secret },
    });

    // Then
    for (const response of [...bearerResponses, limitedManagement]) {
      expect(response.statusCode).toBe(401);
      expect(response.body).not.toContain(secret);
      expect(response.body).not.toContain('private-pause-reason');
      expect(response.body).not.toContain('automatic-private-source');
    }
  });

  it('keeps the admin credential usable when a limited API key is paused', async () => {
    // Given
    const secret = 'sk-paused-limited-secret';
    await insertAuthKey('paused-limited-key', secret, { pausedAt: Date.now() });
    setConfigForTesting(routeConfig(activeConfig('paused-limited-key', secret)));
    fastify = Fastify();
    await registerManagementSurface(fastify);
    await fastify.ready();

    // When
    const response = await fastify.inject({
      method: 'GET',
      url: '/management',
      headers: { 'x-admin-key': ADMIN_SECRET },
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, principal: { role: 'admin' } });
  });

  it('does not record activity for successful limited management authentication', async () => {
    // Given
    const secret = 'sk-management-no-activity';
    await insertAuthKey('management-no-activity-key', secret);
    setConfigForTesting(routeConfig(activeConfig('management-no-activity-key', secret)));
    fastify = Fastify();
    await registerManagementSurface(fastify);
    await fastify.ready();

    // When
    const response = await fastify.inject({
      method: 'GET',
      url: '/management',
      headers: { 'x-admin-key': secret },
    });
    await ApiKeyActivityRecorder.getInstance().flush();

    // Then
    expect(response.statusCode).toBe(200);
    expect(await getDatabase().select().from(getSchema().apiKeyRequestBuckets)).toEqual([]);
  });

  it('rejects a valid key from a persisted disallowed IP before route handling', async () => {
    // Given
    const secret = 'sk-persisted-ip-secret';
    await insertAuthKey('persisted-ip-key', secret, { allowedIps: ['10.0.0.0/8'] });
    setConfigForTesting(routeConfig(activeConfig('persisted-ip-key', secret)));
    fastify = Fastify();
    await registerBearerSurface(fastify, '/inference');
    await fastify.ready();

    // When
    const response = await fastify.inject({
      method: 'GET',
      url: '/inference',
      headers: {
        authorization: `Bearer ${secret}`,
        'x-forwarded-for': '8.8.8.8',
      },
    });

    // Then
    expect(response.statusCode).toBe(401);
  });

  it('rejects persisted expiry and disable state before route handling', async () => {
    // Given
    const expiredSecret = 'sk-expired-surface-secret';
    const disabledSecret = 'sk-disabled-surface-secret';
    await insertAuthKey('expired-surface-key', expiredSecret, { expiresAt: Date.now() - 1 });
    await insertAuthKey('disabled-surface-key', disabledSecret, { disabledAt: Date.now() });
    setConfigForTesting(
      routeConfig({
        ...activeConfig('expired-surface-key', expiredSecret),
        'disabled-surface-key': { secret: disabledSecret },
      })
    );
    fastify = Fastify();
    await registerBearerSurface(fastify, '/inference');
    await fastify.ready();

    // When
    const expired = await fastify.inject({
      method: 'GET',
      url: '/inference',
      headers: { authorization: `Bearer ${expiredSecret}` },
    });
    const disabled = await fastify.inject({
      method: 'GET',
      url: '/inference',
      headers: { authorization: `Bearer ${disabledSecret}` },
    });

    // Then
    expect(expired.statusCode).toBe(401);
    expect(disabled.statusCode).toBe(401);
  });

  it('observes a pause created after registration without reloading in-memory config', async () => {
    // Given
    const secret = 'sk-cross-instance-pause-secret';
    await insertAuthKey('cross-instance-key', secret);
    setConfigForTesting(routeConfig(activeConfig('cross-instance-key', secret)));
    fastify = Fastify();
    await registerBearerSurface(fastify, '/inference');
    await fastify.ready();
    const first = await fastify.inject({
      method: 'GET',
      url: '/inference',
      headers: { authorization: `Bearer ${secret}` },
    });

    // When
    await new ApiKeyPauseService().pauseKey(
      'cross-instance-key',
      'automatic',
      'cross-instance pause'
    );
    const second = await fastify.inject({
      method: 'GET',
      url: '/inference',
      headers: { authorization: `Bearer ${secret}` },
    });

    // Then
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(401);
  });
});

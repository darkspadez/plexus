import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigRepository } from '../../db/config-repository';
import { getDatabase, getSchema } from '../../db/client';
import { setConfigForTesting } from '../../config';
import { ApiKeyActivityRecorder } from '../../services/api-key-security/activity-recorder';
import { ApiKeyPauseService } from '../../services/api-key-security/api-key-pause-service';
import { registerSpy } from '../../../test/test-utils';
import { createAuthHook } from '../auth';
import bearerAuth from '@fastify/bearer-auth';
import {
  activeConfig,
  closeAuthDatabase,
  insertAuthKey,
  registerBearerSurface,
  resetAuthDatabase,
  routeConfig,
} from '../../../test/auth-db-fixtures';
import { ADMIN_SECRET } from '../../../test/auth-db-fixtures';

describe('database-backed shared authentication', () => {
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

  it('resolves bare and attribution-suffixed credentials through one hashed key bucket', async () => {
    // Given
    const secret = 'sk-shared-hash-secret';
    const keyId = await insertAuthKey('shared-key', secret, { comment: 'database-config' });
    setConfigForTesting(routeConfig(activeConfig('shared-key', secret)));
    const lookupSpy = registerSpy(ConfigRepository.prototype, 'resolveKeyBySecret');
    fastify = Fastify();
    await registerBearerSurface(fastify, '/inference');
    await fastify.ready();

    // When
    const attributed = await fastify.inject({
      method: 'GET',
      url: '/inference',
      headers: { authorization: `Bearer ${secret}:TeamA` },
    });
    const bare = await fastify.inject({
      method: 'GET',
      url: '/inference',
      headers: { authorization: `Bearer ${secret}` },
    });
    await ApiKeyActivityRecorder.getInstance().flush();

    // Then
    expect(attributed.statusCode).toBe(200);
    expect(attributed.json()).toMatchObject({
      keyId,
      keyName: 'shared-key',
      attribution: 'teama',
      comment: 'database-config',
    });
    expect(bare.statusCode).toBe(200);
    expect(bare.json()).toMatchObject({ keyId, keyName: 'shared-key', attribution: null });
    expect(lookupSpy).toHaveBeenNthCalledWith(1, secret);
    expect(lookupSpy).toHaveBeenNthCalledWith(2, secret);
    const buckets = await getDatabase().select().from(getSchema().apiKeyRequestBuckets);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.apiKeyId).toBe(keyId);
    expect(buckets[0]?.count).toBe(2);
  });

  it('does not fall back to a plaintext-only persisted credential', async () => {
    // Given
    const secret = 'sk-plaintext-only-secret';
    await getDatabase()
      .insert(getSchema().apiKeys)
      .values({ name: 'plaintext-only-key', secret, createdAt: Date.now(), updatedAt: Date.now() });
    setConfigForTesting(routeConfig(activeConfig('plaintext-only-key', secret)));
    fastify = Fastify();
    await registerBearerSurface(fastify, '/inference');
    await fastify.ready();

    // When
    const response = await fastify.inject({
      method: 'GET',
      url: '/inference',
      headers: { authorization: `Bearer ${secret}` },
    });

    // Then
    expect(response.statusCode).toBe(401);
  });

  it('does not count an invalid credential as activity', async () => {
    // Given
    const secret = 'sk-valid-for-invalid-test';
    await insertAuthKey('invalid-count-key', secret);
    setConfigForTesting(routeConfig(activeConfig('invalid-count-key', secret)));
    const lookupSpy = registerSpy(ConfigRepository.prototype, 'resolveKeyBySecret');
    const recordSpy = registerSpy(ApiKeyActivityRecorder.prototype, 'recordSuccessfulAuth');
    fastify = Fastify();
    await registerBearerSurface(fastify, '/inference');
    await fastify.ready();

    // When
    const response = await fastify.inject({
      method: 'GET',
      url: '/inference',
      headers: { authorization: 'Bearer sk-invalid-not-in-db' },
    });
    await ApiKeyActivityRecorder.getInstance().flush();

    // Then
    expect(response.statusCode).toBe(401);
    expect(lookupSpy).toHaveBeenCalledWith('sk-invalid-not-in-db');
    expect(recordSpy).not.toHaveBeenCalled();
    expect(await getDatabase().select().from(getSchema().apiKeyRequestBuckets)).toEqual([]);
  });

  it('keeps valid bearer authentication successful when activity recording throws', async () => {
    // Given
    const secret = 'sk-recorder-throws-secret';
    await insertAuthKey('recorder-throws-key', secret);
    setConfigForTesting(routeConfig(activeConfig('recorder-throws-key', secret)));
    fastify = Fastify();
    await fastify.register(async (protectedRoutes) => {
      const auth = createAuthHook({
        activityRecorder: {
          recordSuccessfulAuth: () => {
            throw new Error('counter unavailable');
          },
        },
      });
      protectedRoutes.addHook('onRequest', auth.onRequest);
      await protectedRoutes.register(bearerAuth, auth.bearerAuthOptions);
      protectedRoutes.get('/inference', async () => ({ ok: true }));
    });
    await fastify.ready();

    // When
    const response = await fastify.inject({
      method: 'GET',
      url: '/inference',
      headers: { authorization: `Bearer ${secret}` },
    });

    // Then
    expect(response.statusCode).toBe(200);
  });

  it('fails closed with generic 401 when key persistence lookup errors', async () => {
    // Given
    const secret = 'sk-repository-error-secret';
    await insertAuthKey('repository-error-key', secret);
    setConfigForTesting(routeConfig(activeConfig('repository-error-key', secret)));
    registerSpy(ConfigRepository.prototype, 'resolveKeyBySecret').mockRejectedValue(
      new Error('database unavailable')
    );
    fastify = Fastify();
    await registerBearerSurface(fastify, '/inference');
    await fastify.ready();

    // When
    const response = await fastify.inject({
      method: 'GET',
      url: '/inference',
      headers: { authorization: `Bearer ${secret}` },
    });

    // Then
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain('database unavailable');
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

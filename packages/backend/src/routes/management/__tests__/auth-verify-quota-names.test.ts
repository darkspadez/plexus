import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { setConfigForTesting } from '../../../config';
import { registerManagementRoutes } from '../../management';
import { Dispatcher } from '../../../services/dispatch/dispatcher';
import { UsageStorageService } from '../../../services/observability/usage-storage';
import { ProbeService } from '../../../services/probes/probe-service';
import { ApiKeyPauseService } from '../../../services/api-key-security/api-key-pause-service';
import {
  closeAuthDatabase,
  resetAuthDatabase,
  seedAuthKeys,
} from '../../../../test/auth-db-fixtures';

const closeFastify = async (fastify: FastifyInstance | undefined) => {
  if (fastify) await fastify.close();
};

const originalAdminKey = process.env.ADMIN_KEY;

beforeEach(async () => {
  await resetAuthDatabase();
  process.env.ADMIN_KEY = 'correct-admin-key';
});

afterEach(() => {
  process.env.ADMIN_KEY = originalAdminKey;
});

afterEach(async () => {
  await closeAuthDatabase();
});

afterAll(() => {
  if (originalAdminKey === undefined) delete process.env.ADMIN_KEY;
  else process.env.ADMIN_KEY = originalAdminKey;
});

function makeMockDeps() {
  const mockUsageStorage = {} as unknown as UsageStorageService;
  const mockDispatcher = {} as unknown as Dispatcher;
  const mockProbeService = {} as unknown as ProbeService;
  return { mockUsageStorage, mockDispatcher, mockProbeService };
}

describe('GET /v0/management/auth/verify — quotaNames compat', () => {
  let fastify: FastifyInstance;

  afterEach(async () => {
    await closeFastify(fastify);
  });

  it('emits quotaNames (array) alongside quotaName (first entry) for a limited key', async () => {
    setConfigForTesting({
      providers: {},
      models: {},
      keys: {
        'multi-quota-key': { secret: 'sk-multi-quota', quotas: ['quota-a', 'quota-b'] },
      },
      failover: {
        enabled: false,
        retryableStatusCodes: [429, 500, 502, 503, 504],
        retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT'],
      },
      quotas: [],
    } as any);
    await seedAuthKeys({
      'multi-quota-key': { secret: 'sk-multi-quota', quotas: ['quota-a', 'quota-b'] },
    });

    fastify = Fastify();
    const { mockUsageStorage, mockDispatcher, mockProbeService } = makeMockDeps();
    await registerManagementRoutes(fastify, mockUsageStorage, mockDispatcher, mockProbeService);
    await fastify.ready();

    const res = await fastify.inject({
      method: 'GET',
      url: '/v0/management/auth/verify',
      headers: { 'x-admin-key': 'sk-multi-quota' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { quotaNames: string[]; quotaName: string | null };
    expect(body.quotaNames).toEqual(['quota-a', 'quota-b']);
    expect(body.quotaName).toBe('quota-a');
  });

  it('emits an empty quotaNames array and null quotaName for a key with no quotas', async () => {
    setConfigForTesting({
      providers: {},
      models: {},
      keys: {
        'no-quota-key': { secret: 'sk-no-quota' },
      },
      failover: {
        enabled: false,
        retryableStatusCodes: [429, 500, 502, 503, 504],
        retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT'],
      },
      quotas: [],
    } as any);
    await seedAuthKeys({ 'no-quota-key': { secret: 'sk-no-quota' } });

    fastify = Fastify();
    const { mockUsageStorage, mockDispatcher, mockProbeService } = makeMockDeps();
    await registerManagementRoutes(fastify, mockUsageStorage, mockDispatcher, mockProbeService);
    await fastify.ready();

    const res = await fastify.inject({
      method: 'GET',
      url: '/v0/management/auth/verify',
      headers: { 'x-admin-key': 'sk-no-quota' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { quotaNames: string[]; quotaName: string | null };
    expect(body.quotaNames).toEqual([]);
    expect(body.quotaName).toBeNull();
  });

  it('rejects a persisted pause written after limited management route registration generically', async () => {
    // Given
    const secret = 'sk-limited-paused';
    setConfigForTesting({
      providers: {},
      models: {},
      keys: { 'limited-paused': { secret } },
      failover: { enabled: false, retryableStatusCodes: [], retryableErrors: [] },
      quotas: [],
    } as any);
    await seedAuthKeys({ 'limited-paused': { secret } });
    fastify = Fastify();
    const { mockUsageStorage, mockDispatcher, mockProbeService } = makeMockDeps();
    await registerManagementRoutes(fastify, mockUsageStorage, mockDispatcher, mockProbeService);
    await fastify.ready();
    await new ApiKeyPauseService().pauseKey('limited-paused', 'automatic', 'private pause reason');

    // When
    const response = await fastify.inject({
      method: 'GET',
      url: '/v0/management/auth/verify',
      headers: { 'x-admin-key': secret },
    });

    // Then
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain(secret);
    expect(response.body).not.toContain('private pause reason');
  });
});

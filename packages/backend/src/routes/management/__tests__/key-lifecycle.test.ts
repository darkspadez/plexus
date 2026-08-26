import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { logger } from '../../../utils/logger';
import { registerSpy } from '../../../../test/test-utils';

type StoredKey = {
  readonly secret: string;
  readonly comment?: string;
  readonly quotas?: readonly string[];
  readonly allowedIps?: readonly string[];
  readonly allowRawPassthrough?: boolean;
  readonly expiresAt?: number;
  readonly disabledAt?: number;
  readonly pausedAt?: number;
  readonly pauseSource?: string;
  readonly pauseReason?: string;
  readonly anomalyPolicy?: unknown;
};

const serviceState = vi.hoisted(() => {
  const state = {
    keys: {} as Record<string, StoredKey>,
    saveKey: vi.fn(async (name: string, config: StoredKey) => {
      state.keys[name] = { ...state.keys[name], ...config };
    }),
  };
  return state;
});

vi.mock('../../../services/configuration/config-service', () => ({
  ConfigService: {
    getInstance: vi.fn(() => ({
      saveKey: serviceState.saveKey,
      getConfig: () => ({ keys: serviceState.keys }),
      getRepository: () => ({
        getAllKeys: async () =>
          Object.fromEntries(
            Object.entries(serviceState.keys).map(([name, key]) => [
              name,
              { ...key, secret: undefined, fingerprint: 'deadbeef' },
            ])
          ),
        getPublicKeyByName: async (name: string) => {
          const key = serviceState.keys[name];
          return key === undefined ? null : { ...key, secret: undefined, fingerprint: 'deadbeef' };
        },
        getAllKeysForAuthCache: async () => serviceState.keys,
      }),
    })),
  },
}));

import { registerConfigRoutes } from '../config';
import { registerSelfRoutes } from '../self';

describe('API key reveal-once lifecycle routes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    serviceState.keys = {};
    serviceState.saveKey.mockClear();
    fastify = Fastify();
    await registerConfigRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  it('creates a server-generated secret once with no-store and never exposes it from public reads', async () => {
    // Given
    const name = 'generated-key';

    // When
    const create = await fastify.inject({
      method: 'POST',
      url: '/v0/management/keys',
      payload: { name, comment: 'server generated' },
    });
    const list = await fastify.inject({ method: 'GET', url: '/v0/management/keys' });
    const get = await fastify.inject({ method: 'GET', url: `/v0/management/keys/${name}` });
    const config = await fastify.inject({ method: 'GET', url: '/v0/management/config' });

    // Then
    expect(create.statusCode).toBe(201);
    expect(create.headers['cache-control']).toBe('no-store');
    expect(create.json()).toMatchObject({
      name,
      secret: expect.stringMatching(/^sk-[a-f0-9]{48}$/),
    });
    const secret = create.json<{ secret: string }>().secret;
    expect(secret).toHaveLength(51);
    expect(JSON.stringify(list.json())).not.toContain(secret);
    expect(JSON.stringify(get.json())).not.toContain(secret);
    expect(JSON.stringify(config.json())).not.toContain(secret);
  });

  it('generates distinct 24-byte secrets for separate creates', async () => {
    // Given
    const create = (name: string) =>
      fastify.inject({ method: 'POST', url: '/v0/management/keys', payload: { name } });

    // When
    const [first, second] = await Promise.all([create('entropy-one'), create('entropy-two')]);

    // Then
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json<{ secret: string }>().secret).not.toBe(
      second.json<{ secret: string }>().secret
    );
  });

  it('rejects duplicate generated names without persisting a replacement secret', async () => {
    // Given
    serviceState.keys['duplicate-key'] = { secret: 'sk-original-secret' };

    // When
    const response = await fastify.inject({
      method: 'POST',
      url: '/v0/management/keys',
      payload: { name: 'duplicate-key' },
    });

    // Then
    expect(response.statusCode).toBe(409);
    expect(JSON.stringify(response.json())).not.toContain('sk-original-secret');
    expect(serviceState.keys['duplicate-key']?.secret).toBe('sk-original-secret');
  });

  it('keeps caller-supplied PUT import compatibility without echoing malformed or imported secrets', async () => {
    // Given
    const importedSecret = 'sk-imported-secret';
    const malformedSecret = 'sk-should-not-persist';

    // When
    const imported = await fastify.inject({
      method: 'PUT',
      url: '/v0/management/keys/imported-key',
      payload: { secret: importedSecret, quotas: ['quota-a'] },
    });
    const malformed = await fastify.inject({
      method: 'PUT',
      url: '/v0/management/keys/malformed-key',
      payload: { secret: malformedSecret, allowedIps: ['not-an-ip'] },
    });

    // Then
    expect(imported.statusCode).toBe(200);
    expect(JSON.stringify(imported.json())).not.toContain(importedSecret);
    expect(serviceState.keys['imported-key']?.secret).toBe(importedSecret);
    expect(malformed.statusCode).toBe(400);
    expect(JSON.stringify(malformed.json())).not.toContain(malformedSecret);
    expect(serviceState.keys['malformed-key']).toBeUndefined();
  });

  it('keeps generated secrets out of error responses and captured logs', async () => {
    // Given
    const secret = 'sk-never-log-this-secret';
    const errorSpy = registerSpy(logger, 'error');
    serviceState.saveKey.mockImplementationOnce(async () => {
      throw new Error(secret);
    });

    // When
    const response = await fastify.inject({
      method: 'POST',
      url: '/v0/management/keys',
      payload: { name: 'logging-key' },
    });

    // Then
    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(response.json())).not.toContain(secret);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(secret);
  });

  it('rotates an admin key once and preserves its policy and lifecycle state', async () => {
    // Given
    serviceState.keys['rotate-key'] = {
      secret: 'sk-old-secret',
      quotas: ['quota-a'],
      allowedIps: ['10.0.0.0/8'],
      allowRawPassthrough: true,
      expiresAt: 1_750_000_100_000,
      disabledAt: 1_750_000_050_000,
      pausedAt: 1_750_000_025_000,
      pauseSource: 'manual',
      pauseReason: 'operator review',
      anomalyPolicy: { mode: 'disabled' },
    };

    // When
    const response = await fastify.inject({
      method: 'POST',
      url: '/v0/management/keys/rotate-key/rotate',
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      name: 'rotate-key',
      secret: expect.stringMatching(/^sk-[a-f0-9]{48}$/),
    });
    expect(serviceState.keys['rotate-key']).toMatchObject({
      quotas: ['quota-a'],
      allowedIps: ['10.0.0.0/8'],
      allowRawPassthrough: true,
      expiresAt: 1_750_000_100_000,
      disabledAt: 1_750_000_050_000,
      pausedAt: 1_750_000_025_000,
      pauseSource: 'manual',
      pauseReason: 'operator review',
      anomalyPolicy: { mode: 'disabled' },
    });
  });
});

describe('self API key rotation', () => {
  it('uses the same no-store reveal-once contract', async () => {
    // Given
    serviceState.keys = { 'self-key': { secret: 'sk-self-old' } };
    const fastify = Fastify();
    fastify.addHook('preHandler', async (request) => {
      request.principal = {
        role: 'limited',
        keyName: 'self-key',
        allowedProviders: [],
        allowedModels: [],
        excludedProviders: [],
        excludedModels: [],
        quotaNames: [],
        quotaName: null,
      };
    });
    await registerSelfRoutes(fastify);

    // When
    const response = await fastify.inject({ method: 'POST', url: '/v0/management/self/rotate' });

    // Then
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json<{ secret: string }>().secret).toMatch(/^sk-[a-f0-9]{48}$/);
    await fastify.close();
  });
});

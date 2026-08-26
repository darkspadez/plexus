import bearerAuth from '@fastify/bearer-auth';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setConfigForTesting } from '../../config';
import { registerSpy } from '../../../test/test-utils';
import { authenticate } from '../../routes/management/_principal';
import { createAuthHook } from '../auth';
import { logger, SUPPORTED_LOG_LEVELS } from '../logger';
import { closeAuthDatabase, resetAuthDatabase, seedAuthKeys } from '../../../test/auth-db-fixtures';

const PRIMARY_KEY_NAME = 'alpha-identity';
const SECONDARY_KEY_NAME = 'beta-identity';
const PRIMARY_SECRET = 'sk-primary-A1B2C3D4E5F6G7H8';
const SECONDARY_SECRET = 'sk-secondary-Q9R8S7T6U5V4W3X2';
const UNKNOWN_SECRET = 'sk-unknown-Z0Y9X8W7V6U5T4S3';

function captureLogOutput(): () => string {
  const spies = SUPPORTED_LOG_LEVELS.map((level) => registerSpy(logger, level));

  return () =>
    spies
      .flatMap((spy) => spy.mock.calls)
      .flatMap((args: unknown[]) => args)
      .map((value: unknown) =>
        typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value))
      )
      .join('\n');
}

function expectCredentialsAbsent(logOutput: string, credentials: readonly string[]): void {
  for (const credential of credentials) {
    expect(logOutput).not.toContain(credential);
    for (let index = 0; index <= credential.length - 8; index += 1) {
      expect(logOutput).not.toContain(credential.slice(index, index + 8));
    }
  }
}

describe('authentication logging', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    await resetAuthDatabase();
    await seedAuthKeys({
      [PRIMARY_KEY_NAME]: { secret: PRIMARY_SECRET },
      [SECONDARY_KEY_NAME]: { secret: SECONDARY_SECRET },
    });
    setConfigForTesting({
      providers: {},
      models: {},
      keys: {
        [PRIMARY_KEY_NAME]: { secret: PRIMARY_SECRET },
        [SECONDARY_KEY_NAME]: { secret: SECONDARY_SECRET },
      },
      failover: {
        enabled: false,
        retryableStatusCodes: [429, 500, 502, 503, 504],
        retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT'],
      },
      quotas: [],
    });

    fastify = Fastify();
    await fastify.register(async (protectedRoutes) => {
      const auth = createAuthHook({ recordActivity: false });
      protectedRoutes.addHook('onRequest', auth.onRequest);
      await protectedRoutes.register(bearerAuth, auth.bearerAuthOptions);
      protectedRoutes.get('/secured', async () => ({ ok: true }));
    });
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    await closeAuthDatabase();
  });

  it('does not disclose presented or configured credentials when authentication fails', async () => {
    // Given
    const readLogOutput = captureLogOutput();

    // When
    const response = await fastify.inject({
      method: 'GET',
      url: `/secured?key=${UNKNOWN_SECRET}`,
    });

    // Then
    expect(response.statusCode).toBe(401);
    const logOutput = readLogOutput();
    expectCredentialsAbsent(logOutput, [UNKNOWN_SECRET, PRIMARY_SECRET, SECONDARY_SECRET]);
    expect(logOutput).not.toContain(PRIMARY_KEY_NAME);
    expect(logOutput).not.toContain(SECONDARY_KEY_NAME);
  });

  it('logs only the resolved key name when authentication succeeds', async () => {
    // Given
    const readLogOutput = captureLogOutput();

    // When
    const response = await fastify.inject({
      method: 'GET',
      url: '/secured',
      headers: { authorization: `Bearer ${PRIMARY_SECRET}` },
    });

    // Then
    expect(response.statusCode).toBe(200);
    const logOutput = readLogOutput();
    expectCredentialsAbsent(logOutput, [PRIMARY_SECRET, SECONDARY_SECRET]);
    expect(logOutput).toContain(PRIMARY_KEY_NAME);
    expect(logOutput).not.toContain(SECONDARY_KEY_NAME);
  });
});

describe('management authentication logging', () => {
  let fastify: FastifyInstance;
  let previousAdminKey: string | undefined;

  beforeEach(async () => {
    await resetAuthDatabase();
    previousAdminKey = process.env.ADMIN_KEY;
    process.env.ADMIN_KEY = PRIMARY_SECRET;
    fastify = Fastify();
    fastify.get('/management-secured', { preHandler: authenticate }, async () => ({ ok: true }));
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    await closeAuthDatabase();
    if (previousAdminKey === undefined) {
      delete process.env.ADMIN_KEY;
    } else {
      process.env.ADMIN_KEY = previousAdminKey;
    }
  });

  it('preserves the route path without logging sensitive query parameters', async () => {
    // Given
    const readLogOutput = captureLogOutput();

    // When
    const response = await fastify.inject({
      method: 'GET',
      url: `/management-secured?token=${PRIMARY_SECRET}`,
      headers: { 'x-admin-key': PRIMARY_SECRET },
    });

    // Then
    expect(response.statusCode).toBe(200);
    const logOutput = readLogOutput();
    expectCredentialsAbsent(logOutput, [PRIMARY_SECRET]);
    expect(logOutput).toContain('/management-secured');
  });
});

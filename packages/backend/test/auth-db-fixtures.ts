import bearerAuth from '@fastify/bearer-auth';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { closeDatabase, getDatabase, getSchema, initializeDatabase } from '../src/db/client';
import { ConfigRepository } from '../src/db/config-repository';
import { runMigrations } from '../src/db/migrate';
import type { KeyConfig, PlexusConfig } from '../src/config';
import { ManagementAuthError, authenticate } from '../src/routes/management/_principal';
import { createAuthHook } from '../src/utils/auth';
import { hashSecret } from '../src/utils/encryption';

export const ADMIN_SECRET = 'sk-admin-secret';

const BASE_FAILOVER = {
  enabled: false,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT'],
};

type StoredKeyOptions = {
  readonly comment?: string;
  readonly allowedIps?: readonly string[];
  readonly expiresAt?: number;
  readonly disabledAt?: number;
  readonly pausedAt?: number;
  readonly pauseSource?: string;
  readonly pauseReason?: string;
};

type AuthenticatedRequest = FastifyRequest & {
  keyId?: number;
  keyName?: string;
  attribution?: string | null;
  keyConfig?: KeyConfig;
};

export function routeConfig(keys: PlexusConfig['keys']): PlexusConfig {
  return {
    providers: {},
    models: {},
    keys,
    failover: BASE_FAILOVER,
    quotas: [],
    trustedProxies: ['0.0.0.0/0'],
  };
}

export function activeConfig(name: string, secret: string): PlexusConfig['keys'] {
  return { [name]: { secret, comment: 'stale-config-copy' } };
}

export async function insertAuthKey(
  name: string,
  secret: string,
  options: StoredKeyOptions = {}
): Promise<number> {
  const db = getDatabase();
  const schema = getSchema();
  const rows = await db
    .insert(schema.apiKeys)
    .values({
      name,
      secret,
      secretHash: hashSecret(secret),
      comment: options.comment,
      allowedIps: options.allowedIps ? JSON.stringify(options.allowedIps) : undefined,
      expiresAt: options.expiresAt,
      disabledAt: options.disabledAt,
      pausedAt: options.pausedAt,
      pauseSource: options.pauseSource,
      pauseReason: options.pauseReason,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .returning({ id: schema.apiKeys.id });
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('auth test key was not inserted');
  return id;
}

export async function registerBearerSurface(
  fastify: FastifyInstance,
  path: string,
  allowQueryKey = true
): Promise<void> {
  await fastify.register(async (protectedRoutes) => {
    const auth = createAuthHook({ allowQueryKey });
    protectedRoutes.addHook('onRequest', auth.onRequest);
    await protectedRoutes.register(bearerAuth, auth.bearerAuthOptions);
    protectedRoutes.all(path, async (request) => {
      const authRequest = request as AuthenticatedRequest;
      return {
        ok: true,
        keyId: authRequest.keyId,
        keyName: authRequest.keyName,
        attribution: authRequest.attribution,
        comment: authRequest.keyConfig?.comment ?? null,
      };
    });
  });
}

export async function registerManagementSurface(fastify: FastifyInstance): Promise<void> {
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof ManagementAuthError) {
      return reply.code(error.statusCode).send(error.authBody);
    }
    return reply.send(error);
  });
  fastify.get('/management', { preHandler: authenticate }, async (request) => ({
    ok: true,
    principal: request.principal,
  }));
}

export async function resetAuthDatabase(): Promise<void> {
  await closeDatabase();
  const databaseUrl = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('auth test database URL is required');
  initializeDatabase(databaseUrl);
  await runMigrations();

  const db = getDatabase();
  const schema = getSchema();
  await db.delete(schema.apiKeySecurityEvents);
  await db.delete(schema.apiKeyRequestBuckets);
  await db.delete(schema.apiKeys);
}

export async function seedAuthKeys(keys: Record<string, KeyConfig>): Promise<void> {
  const repository = new ConfigRepository();
  for (const [name, config] of Object.entries(keys)) {
    await repository.saveKey(name, config);
  }
}

export async function closeAuthDatabase(): Promise<void> {
  await closeDatabase();
}

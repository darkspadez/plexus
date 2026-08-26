import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  closeDatabase,
  getCurrentDialect,
  getDatabase,
  getSchema,
  initializeDatabase,
} from '../../../db/client';
import { runMigrations } from '../../../db/migrate';
import { ConfigService } from '../../../services/configuration/config-service';
import { logger } from '../../../utils/logger';
import { registerSpy } from '../../../../test/test-utils';
import { registerConfigRoutes } from '../config';

describe('API key create route database concurrency', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    await closeDatabase();
    const databaseUrl = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('Test database URL is required');
    initializeDatabase(databaseUrl);
    await runMigrations();
    await getDatabase().delete(getSchema().apiKeys);
    ConfigService.resetInstance();

    fastify = Fastify();
    await registerConfigRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    ConfigService.resetInstance();
    await closeDatabase();
  });

  it('returns one created and one redacted conflict when concurrent creates use the same name', async () => {
    // Given
    const errorSpy = registerSpy(logger, 'error');
    const repository = ConfigService.getInstance().getRepository();
    let reads = 0;
    let releaseReads: (() => void) | undefined;
    const readsComplete = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const getPublicKeyByName = vi
      .spyOn(repository, 'getPublicKeyByName')
      .mockImplementation(async () => {
        reads += 1;
        if (reads === 2) releaseReads?.();
        await readsComplete;
        return null;
      });
    const create = () =>
      fastify.inject({
        method: 'POST',
        url: '/v0/management/keys',
        payload: { name: 'concurrent-key' },
      });

    // When
    const responses = await Promise.all([create(), create()]);

    // Then
    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    const created = responses.find((response) => response.statusCode === 201);
    const conflict = responses.find((response) => response.statusCode === 409);
    expect(created).toBeDefined();
    expect(conflict).toBeDefined();
    const secret = created?.json<{ secret: string }>().secret;
    expect(secret).toMatch(/^sk-[a-f0-9]{48}$/);
    expect(conflict?.headers['cache-control']).toBeUndefined();
    expect(JSON.stringify(conflict?.json())).not.toContain(secret ?? '');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(secret ?? '');
    const rows = await getDatabase().select().from(getSchema().apiKeys);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('concurrent-key');
    getPublicKeyByName.mockRestore();
  });

  it('maps a database unique-name conflict to a redacted 409 response', async () => {
    // Given
    const configService = ConfigService.getInstance();
    const repository = configService.getRepository();
    let databaseError: unknown;
    const saveKey = vi.spyOn(configService, 'saveKey').mockImplementation(async (name, config) => {
      await repository.saveKey(name, config);
      try {
        await getDatabase().insert(getSchema().apiKeys).values({
          name,
          secret: 'conflicting-database-secret',
          secretHash: 'duplicate-conflict-hash',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      } catch (error) {
        databaseError = error;
        throw error;
      }
    });

    // When
    const response = await fastify.inject({
      method: 'POST',
      url: '/v0/management/keys',
      payload: { name: 'database-conflict-key' },
    });

    // Then
    expect(databaseError).toMatchObject(
      getCurrentDialect() === 'postgres'
        ? { code: '23505', constraint: 'api_keys_name_unique' }
        : { code: 'SQLITE_CONSTRAINT_UNIQUE' }
    );
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "API key 'database-conflict-key' already exists" });
    expect(JSON.stringify(response.json())).not.toContain('sk-');
    saveKey.mockRestore();
  });
});

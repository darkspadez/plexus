import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { setConfigForTesting } from '../../../config';
import { ConfigRepository } from '../../../db/config-repository';
import { closeDatabase, getDatabase, getSchema, initializeDatabase } from '../../../db/client';
import { runMigrations } from '../../../db/migrate';
import { ConfigService } from '../../../services/configuration/config-service';
import {
  DEFAULT_ANOMALY_THRESHOLD_POLICY,
  type GlobalAnomalyPolicy,
  type PerKeyAnomalyPolicy,
} from '../../../services/api-key-security/policy-schema';
import { AnomalyPolicyService } from '../../../services/api-key-security/anomaly-policy-service';
import { registerAnomalyPolicyRoutes } from '../anomaly-policy';
import { authenticate, ManagementAuthError, requireAdmin } from '../_principal';

const ADMIN_KEY = 'task-8-admin-key';
const LIMITED_KEY = 'sk-task-8-limited';
const GLOBAL_URL = '/v0/management/security/anomaly-policy';
const KEY_URL = '/v0/management/keys/demo-key/anomaly-policy';

type SnapshotBody = {
  global: GlobalAnomalyPolicy;
  keys: Record<string, KeyPolicyBody>;
};

type KeyPolicyBody = {
  configured: PerKeyAnomalyPolicy;
  effective: GlobalAnomalyPolicy;
};

type PolicyErrorBody = {
  details: Array<{ path: Array<string | number> }>;
};

describe('anomaly policy management routes', () => {
  let fastify: FastifyInstance;
  let configService: ConfigService;

  beforeEach(async () => {
    await closeDatabase();
    const databaseUrl = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('Test database URL is required');
    initializeDatabase(databaseUrl);
    await runMigrations();
    const db = getDatabase();
    const schema = getSchema();
    await db.delete(schema.apiKeys);
    await db.delete(schema.systemSettings);

    ConfigService.resetInstance();
    configService = new ConfigService(new ConfigRepository());
    await configService.getRepository().saveKey('demo-key', { secret: LIMITED_KEY });
    process.env.ADMIN_KEY = ADMIN_KEY;
    setConfigForTesting({
      providers: {},
      models: {},
      keys: { 'demo-key': { secret: LIMITED_KEY } },
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
    const policyService = new AnomalyPolicyService(configService);
    fastify.register(async (admin) => {
      admin.addHook('preHandler', authenticate);
      admin.addHook('preHandler', requireAdmin);
      await registerAnomalyPolicyRoutes(admin, policyService);
    });
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    ConfigService.resetInstance();
    await closeDatabase();
  });

  it('returns a disabled global policy and inherited effective key policy by default', async () => {
    // Given
    // The database has no global or per-key anomaly policy.

    // When
    const response = await fastify.inject({
      method: 'GET',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
    });

    // Then
    expect(response.statusCode).toBe(200);
    const body = response.json<SnapshotBody>();
    expect(body.global).toEqual({ mode: 'disabled', ...DEFAULT_ANOMALY_THRESHOLD_POLICY });
    expect(body.keys['demo-key']).toEqual({
      configured: { mode: 'inherit' },
      effective: body.global,
    });
  });

  it('replaces the global policy through observe and enforce modes', async () => {
    // Given
    const observe = { mode: 'observe', ...DEFAULT_ANOMALY_THRESHOLD_POLICY };
    const enforce = { mode: 'enforce', ...DEFAULT_ANOMALY_THRESHOLD_POLICY };

    // When
    const observeResponse = await fastify.inject({
      method: 'PUT',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: observe,
    });
    const enforceResponse = await fastify.inject({
      method: 'PUT',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: enforce,
    });

    // Then
    expect(observeResponse.statusCode).toBe(200);
    expect(observeResponse.json<GlobalAnomalyPolicy>()).toEqual(observe);
    expect(enforceResponse.statusCode).toBe(200);
    expect(enforceResponse.json<GlobalAnomalyPolicy>()).toEqual(enforce);
  });

  it('rejects cross-field global policies with machine-readable Zod issues and no mutation', async () => {
    // Given
    const valid = { mode: 'observe', ...DEFAULT_ANOMALY_THRESHOLD_POLICY };
    await fastify.inject({
      method: 'PUT',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: valid,
    });
    const invalid = { ...valid, lookbackMinutes: 40 };

    // When
    const response = await fastify.inject({
      method: 'PUT',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: invalid,
    });

    // Then
    expect(response.statusCode).toBe(400);
    const body = response.json<PolicyErrorBody>();
    expect(body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['lookbackMinutes'] })])
    );
    const current = await fastify.inject({
      method: 'GET',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(current.json<SnapshotBody>().global).toEqual(valid);
  });

  it('rejects partial per-key overrides and unknown per-key fields in a global replacement', async () => {
    // Given
    const partialOverride = {
      mode: 'override',
      reason: 'incomplete',
      policy: { minimumRequestsPerMinute: 75 },
    };

    // When
    const response = await fastify.inject({
      method: 'PUT',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { mode: 'observe', perKeyPolicies: { 'demo-key': partialOverride } },
    });

    // Then
    expect(response.statusCode).toBe(400);
    expect(response.json<PolicyErrorBody>().details.length).toBeGreaterThan(0);
  });

  it('replaces the complete global policy through PATCH without a shallow merge', async () => {
    // Given
    const replacement = {
      mode: 'observe',
      ...DEFAULT_ANOMALY_THRESHOLD_POLICY,
      lookbackMinutes: 720,
      minimumActiveMinutes: 120,
    };

    // When
    const response = await fastify.inject({
      method: 'PATCH',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: replacement,
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(response.json<GlobalAnomalyPolicy>()).toEqual(replacement);
  });

  it('rejects an invalid PATCH with machine-readable Zod issues and no mutation', async () => {
    // Given
    const valid = { mode: 'observe', ...DEFAULT_ANOMALY_THRESHOLD_POLICY };
    await fastify.inject({
      method: 'PATCH',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: valid,
    });

    // When
    const response = await fastify.inject({
      method: 'PATCH',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { ...valid, lookbackMinutes: 40 },
    });

    // Then
    expect(response.statusCode).toBe(400);
    expect(response.json<PolicyErrorBody>().details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['lookbackMinutes'] })])
    );
    const current = await fastify.inject({
      method: 'GET',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(current.json<SnapshotBody>().global).toEqual(valid);
  });

  it('rejects a limited principal on every anomaly-policy route', async () => {
    // Given
    const routes = [
      { method: 'GET' as const, url: GLOBAL_URL },
      { method: 'PUT' as const, url: GLOBAL_URL },
      { method: 'PATCH' as const, url: GLOBAL_URL },
      { method: 'GET' as const, url: KEY_URL },
      { method: 'PUT' as const, url: KEY_URL },
      { method: 'PATCH' as const, url: KEY_URL },
    ];

    // When
    const responses = await Promise.all(
      routes.map((route) => fastify.inject({ ...route, headers: { 'x-admin-key': LIMITED_KEY } }))
    );

    // Then
    expect(responses.every((response) => response.statusCode === 403)).toBe(true);
  });

  it('returns configured inheritance separately from the effective global policy', async () => {
    // Given
    const global = { mode: 'observe', ...DEFAULT_ANOMALY_THRESHOLD_POLICY };
    await fastify.inject({
      method: 'PUT',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: global,
    });

    // When
    const response = await fastify.inject({
      method: 'GET',
      url: KEY_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(response.json<KeyPolicyBody>()).toEqual({
      configured: { mode: 'inherit' },
      effective: global,
    });
  });

  it('returns configured override separately from its effective policy after PATCH replacement', async () => {
    // Given
    const global = { mode: 'observe', ...DEFAULT_ANOMALY_THRESHOLD_POLICY };
    const override: PerKeyAnomalyPolicy = {
      mode: 'override',
      reason: 'trusted integration',
      policy: {
        ...DEFAULT_ANOMALY_THRESHOLD_POLICY,
        lookbackMinutes: 720,
        minimumActiveMinutes: 120,
      },
    };
    await fastify.inject({
      method: 'PUT',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: global,
    });
    // When
    const response = await fastify.inject({
      method: 'PATCH',
      url: KEY_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: override,
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(response.json<KeyPolicyBody>()).toEqual({
      configured: override,
      effective: { ...override.policy, mode: global.mode },
    });
    const snapshot = await fastify.inject({
      method: 'GET',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(snapshot.json<SnapshotBody>().keys['demo-key']).toEqual({
      configured: override,
      effective: { ...override.policy, mode: global.mode },
    });
  });

  it('returns configured disabled separately from its effective policy after replacement', async () => {
    // Given
    const global = { mode: 'enforce', ...DEFAULT_ANOMALY_THRESHOLD_POLICY };
    const disabled: PerKeyAnomalyPolicy = { mode: 'disabled', reason: 'maintenance' };
    await fastify.inject({
      method: 'PATCH',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: global,
    });

    // When
    const response = await fastify.inject({
      method: 'PATCH',
      url: KEY_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: disabled,
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(response.json<KeyPolicyBody>()).toEqual({
      configured: disabled,
      effective: { ...global, mode: 'disabled' },
    });
  });

  it('refreshes the ConfigService cache and exposes the policy in backup export', async () => {
    // Given
    const observe = { mode: 'observe', ...DEFAULT_ANOMALY_THRESHOLD_POLICY };

    // When
    const saveResponse = await fastify.inject({
      method: 'PUT',
      url: GLOBAL_URL,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: observe,
    });
    const backup = await configService.exportConfig();

    // Then
    expect(saveResponse.statusCode).toBe(200);
    expect(configService.getConfig().anomalyPolicy).toEqual(observe);
    expect(backup).toMatchObject({
      settings: { 'apiKeySecurity.globalAnomalyPolicy': observe },
    });
  });
});

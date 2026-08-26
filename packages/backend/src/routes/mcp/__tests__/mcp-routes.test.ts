import { describe, expect, test, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { registerSpy } from '../../../../test/test-utils';
import Fastify, { FastifyInstance } from 'fastify';
import { setConfigForTesting } from '../../../config';
import { registerMcpRoutes } from '../index';
import { McpUsageStorageService } from '../../../services/mcp-proxy/mcp-usage-storage';
import * as mcpProxyService from '../../../services/mcp-proxy/mcp-proxy-service';
import { ApiKeyActivityRecorder } from '../../../services/api-key-security/activity-recorder';
import {
  closeAuthDatabase,
  resetAuthDatabase,
  seedAuthKeys,
} from '../../../../test/auth-db-fixtures';
import { getDatabase, getSchema } from '../../../db/client';
import { eq } from 'drizzle-orm';
import { ApiKeyPauseService } from '../../../services/api-key-security/api-key-pause-service';
import { logger } from '../../../utils/logger';

describe('MCP Routes', () => {
  let fastify: FastifyInstance;
  let mockMcpUsageStorage: McpUsageStorageService;
  let mockProxyMcpRequest: any;

  beforeAll(async () => {
    await resetAuthDatabase();
    await seedAuthKeys({ 'test-key-1': { secret: 'sk-valid-key', comment: 'Test Key' } });
    fastify = Fastify();

    // Mock MCP usage storage
    mockMcpUsageStorage = {
      saveRequest: vi.fn(),
      saveDebugLog: vi.fn(),
    } as unknown as McpUsageStorageService;

    // Mock the proxyMcpRequest function to avoid network calls
    mockProxyMcpRequest = vi.fn(async () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { jsonrpc: '2.0', id: 1, result: {} },
    }));

    // Set config with keys and MCP servers
    setConfigForTesting({
      providers: {},
      models: {},
      keys: {
        'test-key-1': { secret: 'sk-valid-key', comment: 'Test Key' },
      },
      failover: {
        enabled: false,
        retryableStatusCodes: [429, 500, 502, 503, 504],
        retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT'],
      },
      quotas: [],
      mcpServers: {
        'test-server': {
          upstream_url: 'http://localhost:3000/mcp',
          enabled: true,
          headers: {
            'x-upstream-header': 'value',
          },
        },
        'server-with-auth': {
          upstream_url: 'http://localhost:3001/mcp?auth=token123',
          enabled: true,
          headers: {
            Authorization: 'Bearer upstream-secret',
          },
        },
        'disabled-server': {
          upstream_url: 'http://localhost:3002/mcp',
          enabled: false,
        },
      },
    });
    await registerMcpRoutes(fastify, mockMcpUsageStorage);
    await fastify.ready();
  });

  beforeEach(async () => {
    await ApiKeyActivityRecorder.getInstance().stop();
    ApiKeyActivityRecorder.resetForTesting();
    await getDatabase().delete(getSchema().apiKeyRequestBuckets);
    registerSpy(mcpProxyService, 'proxyMcpRequest').mockImplementation(mockProxyMcpRequest);
  });

  afterAll(async () => {
    await fastify.close();
    await ApiKeyActivityRecorder.getInstance().stop();
    ApiKeyActivityRecorder.resetForTesting();
    await closeAuthDatabase();
  });

  describe('OAuth Discovery Endpoints', () => {
    test('GET /.well-known/oauth-authorization-server should return OAuth metadata', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/.well-known/oauth-authorization-server',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.issuer).toBe('/');
      expect(body.authorization_endpoint).toBe('/oauth/authorize');
      expect(body.token_endpoint).toBe('/oauth/token');
      expect(body.grant_types_supported).toContain('bearer');
    });

    test('GET /.well-known/oauth-protected-resource should return protected resource metadata', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.resource).toBe('/');
      expect(body.scopes_supported).toContain('read');
    });

    test('GET /.well-known/openid-configuration should return OIDC config', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/.well-known/openid-configuration',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.issuer).toBe('/');
      expect(body.jwks_uri).toBe('/.well-known/jwks.json');
    });

    test('POST /register should return static client registration', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/register',
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.client_id).toBe('plexus-mcp-static');
      expect(body.grant_types).toContain('bearer');
    });
  });

  describe('Authentication', () => {
    test('should reject request without authorization', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mcp/test-server',
        headers: {
          'content-type': 'application/json',
        },
        payload: {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    test('should reject request with invalid key', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mcp/test-server',
        headers: {
          authorization: 'Bearer invalid-key',
          'content-type': 'application/json',
        },
        payload: {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    test('should allow request with valid Bearer token', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mcp/test-server',
        headers: {
          authorization: 'Bearer sk-valid-key',
          'content-type': 'application/json',
        },
        payload: {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        },
      });

      // Should either proxy successfully or fail with upstream error
      // The test server doesn't exist, so we'll get a connection error
      expect([200, 400, 404, 500, 502, 504]).toContain(response.statusCode);
    });

    test('should allow request with x-api-key header', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mcp/test-server',
        headers: {
          'x-api-key': 'sk-valid-key',
          'content-type': 'application/json',
        },
        payload: {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        },
      });

      // Should either proxy successfully or fail with upstream error
      expect([200, 400, 404, 500, 502, 504]).toContain(response.statusCode);
    });

    test('should allow request with key attribution', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mcp/test-server',
        headers: {
          authorization: 'Bearer sk-valid-key:copilot',
          'content-type': 'application/json',
        },
        payload: {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        },
      });

      expect([200, 400, 404, 500, 502, 504]).toContain(response.statusCode);
    });
  });

  describe('Server Validation', () => {
    test('should reject invalid server name', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mcp/InvalidServer',
        headers: {
          authorization: 'Bearer sk-valid-key',
          'content-type': 'application/json',
        },
        payload: {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.message).toContain('Invalid server name');
    });

    test('should reject request to disabled server', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mcp/disabled-server',
        headers: {
          authorization: 'Bearer sk-valid-key',
          'content-type': 'application/json',
        },
        payload: {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.message).toContain('not found or disabled');
    });

    test('should reject request to non-existent server', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/mcp/non-existent',
        headers: {
          authorization: 'Bearer sk-valid-key',
          'content-type': 'application/json',
        },
        payload: {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.message).toContain('not found or disabled');
    });
  });

  describe('HTTP Methods', () => {
    test('POST /mcp/:name should proxy POST requests', async () => {
      await fastify.inject({
        method: 'POST',
        url: '/mcp/test-server',
        headers: {
          authorization: 'Bearer sk-valid-key',
          'content-type': 'application/json',
        },
        payload: {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        },
      });

      // Check that usage was recorded
      expect(mockMcpUsageStorage.saveRequest).toHaveBeenCalled();
    });

    test('GET /mcp/:name should proxy GET requests', async () => {
      // Clear previous mock calls
      (mockProxyMcpRequest as any).mockClear();

      const response = await fastify.inject({
        method: 'GET',
        url: '/mcp/test-server',
        headers: {
          authorization: 'Bearer sk-valid-key',
        },
      });

      expect([200, 400, 404, 500, 502, 504]).toContain(response.statusCode);
      expect(mockProxyMcpRequest).toHaveBeenCalled();
    });

    test('GET /mcp/:name should forward upstream status for streamed responses', async () => {
      // Regression: a 405 standalone-SSE response from the upstream must not
      // be rewritten to 200, otherwise strict MCP clients try to parse the
      // error body as an SSE stream and the session fails.
      (mockProxyMcpRequest as any).mockClear();
      (mockProxyMcpRequest as any).mockResolvedValueOnce({
        status: 405,
        headers: {},
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('Method Not Allowed'));
            controller.close();
          },
        }),
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/mcp/test-server',
        headers: {
          authorization: 'Bearer sk-valid-key',
        },
      });

      expect(response.statusCode).toBe(405);
    });

    test('DELETE /mcp/:name should proxy DELETE requests', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/mcp/test-server',
        headers: {
          authorization: 'Bearer sk-valid-key',
        },
      });

      expect([200, 400, 404, 500, 502, 504]).toContain(response.statusCode);
    });
  });

  describe('Usage Recording', () => {
    test('should record usage on POST requests', async () => {
      // Reset mock
      (mockMcpUsageStorage.saveRequest as any).mockClear();

      await fastify.inject({
        method: 'POST',
        url: '/mcp/test-server',
        headers: {
          authorization: 'Bearer sk-valid-key:myapp',
          'content-type': 'application/json',
        },
        payload: {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        },
      });

      expect(mockMcpUsageStorage.saveRequest).toHaveBeenCalled();
      const callArgs = (mockMcpUsageStorage.saveRequest as any).mock.calls[0][0];
      expect(callArgs.server_name).toBe('test-server');
      expect(callArgs.method).toBe('POST');
      expect(callArgs.jsonrpc_method).toBe('tools/list');
      expect(callArgs.api_key).toBe('test-key-1');
      expect(callArgs.attribution).toBe('myapp');
    });

    test('should record usage on GET requests', async () => {
      (mockMcpUsageStorage.saveRequest as any).mockClear();
      (mockProxyMcpRequest as any).mockClear();

      const response = await fastify.inject({
        method: 'GET',
        url: '/mcp/test-server',
        headers: {
          authorization: 'Bearer sk-valid-key',
        },
      });

      expect([200, 400, 404, 500, 502, 504]).toContain(response.statusCode);
      expect(mockMcpUsageStorage.saveRequest).toHaveBeenCalled();
      const callArgs = (mockMcpUsageStorage.saveRequest as any).mock.calls[0][0];
      expect(callArgs.method).toBe('GET');
    });

    test('should record usage on DELETE requests', async () => {
      (mockMcpUsageStorage.saveRequest as any).mockClear();

      await fastify.inject({
        method: 'DELETE',
        url: '/mcp/test-server',
        headers: {
          authorization: 'Bearer sk-valid-key',
        },
      });

      expect(mockMcpUsageStorage.saveRequest).toHaveBeenCalled();
      const callArgs = (mockMcpUsageStorage.saveRequest as any).mock.calls[0][0];
      expect(callArgs.method).toBe('DELETE');
    });
  });

  test('records activity only after successful protected MCP bearer authentication', async () => {
    // Given
    const schema = getSchema();
    const storedKey = await getDatabase()
      .select({ id: schema.apiKeys.id })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.name, 'test-key-1'));
    const keyId = storedKey[0]?.id;
    if (keyId === undefined) throw new Error('Expected seeded MCP key');

    // When
    const accepted = await fastify.inject({
      method: 'POST',
      url: '/mcp/test-server',
      headers: { authorization: 'Bearer sk-valid-key', 'content-type': 'application/json' },
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    });
    await ApiKeyActivityRecorder.getInstance().flush();

    // Then
    expect(accepted.statusCode).toBe(200);
    expect(await getDatabase().select().from(schema.apiKeyRequestBuckets)).toMatchObject([
      { apiKeyId: keyId, count: 1 },
    ]);
  });

  test('does not record activity for rejected protected MCP bearer authentication', async () => {
    // Given
    const schema = getSchema();

    // When
    const rejected = await fastify.inject({
      method: 'POST',
      url: '/mcp/test-server',
      headers: { authorization: 'Bearer sk-invalid-key', 'content-type': 'application/json' },
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    });
    await ApiKeyActivityRecorder.getInstance().flush();

    // Then
    expect(rejected.statusCode).toBe(401);
    expect(await getDatabase().select().from(schema.apiKeyRequestBuckets)).toEqual([]);
  });

  test('rejects a pause written after protected MCP registration without revealing pause state', async () => {
    // Given
    const secret = 'sk-valid-key';
    await new ApiKeyPauseService().pauseKey('test-key-1', 'automatic', 'private pause reason');

    // When
    const response = await fastify.inject({
      method: 'POST',
      url: '/mcp/test-server',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    });

    // Then
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain(secret);
    expect(response.body).not.toContain('private pause reason');
    expect(await getDatabase().select().from(getSchema().apiKeyRequestBuckets)).toEqual([]);
  });

  test('redacts protected MCP request diagnostics and persisted upstream URL while forwarding response bodies', async () => {
    // Given
    const plexusSecret = 'sk-route-log-canary';
    const upstreamSecret = 'upstream-route-log-canary';
    const bodyCanary = 'body-log-canary';
    const headerCanary = 'header-log-canary';
    setConfigForTesting({
      providers: {},
      models: {},
      keys: { 'test-key-1': { secret: plexusSecret, comment: 'Test Key' } },
      failover: { enabled: false, retryableStatusCodes: [], retryableErrors: [] },
      quotas: [],
      mcpServers: {
        'test-server': {
          upstream_url: `http://localhost:3000/mcp?token=${upstreamSecret}`,
          enabled: true,
          headers: { 'x-custom-secret': headerCanary },
        },
      },
    });
    await seedAuthKeys({ 'route-canary-key': { secret: plexusSecret } });
    mockProxyMcpRequest.mockResolvedValueOnce({
      status: 200,
      headers: { 'x-upstream-secret': headerCanary },
      body: { result: bodyCanary },
    });
    const infoSpy = registerSpy(logger, 'info');
    const sillySpy = registerSpy(logger, 'silly');
    const errorSpy = registerSpy(logger, 'error');
    (mockMcpUsageStorage.saveRequest as ReturnType<typeof vi.fn>).mockClear();

    // When
    const response = await fastify.inject({
      method: 'POST',
      url: '/mcp/test-server',
      headers: { authorization: `Bearer ${plexusSecret}`, 'content-type': 'application/json' },
      payload: { jsonrpc: '2.0', method: 'tools/call', params: { name: bodyCanary }, id: 1 },
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ result: bodyCanary });
    const serializedLogs = JSON.stringify([
      ...infoSpy.mock.calls,
      ...sillySpy.mock.calls,
      ...errorSpy.mock.calls,
    ]);
    for (const canary of [plexusSecret, upstreamSecret, bodyCanary, headerCanary]) {
      expect(serializedLogs).not.toContain(canary);
    }
    const usage = (mockMcpUsageStorage.saveRequest as ReturnType<typeof vi.fn>).mock.calls.at(
      -1
    )?.[0];
    expect(JSON.stringify(usage)).not.toContain(upstreamSecret);
    expect(usage?.upstream_url).toBe('http://localhost:3000/mcp');
  });
});

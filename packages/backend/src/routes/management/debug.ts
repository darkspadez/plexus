import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DebugManager } from '../../services/debug-manager';
import { UsageStorageService } from '../../services/usage-storage';

const patchDebugSchema = z.object({
  enabled: z.boolean().optional(),
  providers: z.array(z.string()).nullable().optional(),
  keyName: z.string().optional(),
});

/**
 * Resolve the effective apiKey filter for the current request.
 * API-key users are always forced to their own key (server-side enforcement).
 */
function resolveApiKeyFilter(request: any): string | undefined {
  if (request.authType === 'api-key') {
    return request.keyName;
  }
  return undefined;
}

export async function registerDebugRoutes(
  fastify: FastifyInstance,
  usageStorage: UsageStorageService
) {
  fastify.get('/v0/management/debug', (request, reply) => {
    const debugManager = DebugManager.getInstance();
    const apiKeyFilter = resolveApiKeyFilter(request);

    if (apiKeyFilter) {
      // API-key users see per-key debug state
      return reply.send({
        enabled: debugManager.isEnabledForKey(apiKeyFilter),
        providers: debugManager.getProviderFilter(),
      });
    }

    return reply.send({
      enabled: debugManager.isEnabled(),
      providers: debugManager.getProviderFilter(),
    });
  });

  fastify.patch('/v0/management/debug', async (request, reply) => {
    const parsed = patchDebugSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body', details: parsed.error.errors });
    }
    const debugManager = DebugManager.getInstance();
    const apiKeyFilter = resolveApiKeyFilter(request);

    if (apiKeyFilter) {
      // API-key users can only toggle debug for their own key
      if (parsed.data.enabled !== undefined) {
        debugManager.setKeyEnabled(apiKeyFilter, parsed.data.enabled);
      }
      return reply.send({
        enabled: debugManager.isEnabledForKey(apiKeyFilter),
        providers: debugManager.getProviderFilter(),
      });
    }

    // Admin can toggle global debug and optionally per-key
    if (parsed.data.keyName && parsed.data.enabled !== undefined) {
      debugManager.setKeyEnabled(parsed.data.keyName, parsed.data.enabled);
    } else if (parsed.data.enabled !== undefined) {
      debugManager.setEnabled(parsed.data.enabled);
    }
    if (parsed.data.providers !== undefined) {
      debugManager.setProviderFilter(parsed.data.providers);
    }

    return reply.send({
      enabled: debugManager.isEnabled(),
      providers: debugManager.getProviderFilter(),
    });
  });

  fastify.get('/v0/management/debug/logs', async (request, reply) => {
    const query = request.query as any;
    const limit = parseInt(query.limit || '50');
    const offset = parseInt(query.offset || '0');
    const apiKeyFilter = resolveApiKeyFilter(request);
    const logs = await usageStorage.getDebugLogs(limit, offset, apiKeyFilter);
    return reply.send(logs);
  });

  fastify.delete('/v0/management/debug/logs', async (request, reply) => {
    if ((request as any).authType !== 'admin') {
      return reply
        .code(403)
        .send({ error: { message: 'Forbidden', type: 'auth_error', code: 403 } });
    }
    const success = await usageStorage.deleteAllDebugLogs();
    if (!success) return reply.code(500).send({ error: 'Failed to delete logs' });
    return reply.send({ success: true });
  });

  fastify.get('/v0/management/debug/logs/:requestId', async (request, reply) => {
    const params = request.params as any;
    const requestId = params.requestId;
    const log = await usageStorage.getDebugLog(requestId);
    if (!log) return reply.code(404).send({ error: 'Log not found' });
    return reply.send(log);
  });

  fastify.delete('/v0/management/debug/logs/:requestId', async (request, reply) => {
    if ((request as any).authType !== 'admin') {
      return reply
        .code(403)
        .send({ error: { message: 'Forbidden', type: 'auth_error', code: 403 } });
    }
    const params = request.params as any;
    const requestId = params.requestId;
    const success = await usageStorage.deleteDebugLog(requestId);
    if (!success) return reply.code(404).send({ error: 'Log not found or could not be deleted' });
    return reply.send({ success: true });
  });
}

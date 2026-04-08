import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../utils/logger';
import { getConfig } from '../config';
import { UsageStorageService } from '../services/usage-storage';
import { registerConfigRoutes } from './management/config';
import { registerUsageRoutes } from './management/usage';
import { registerCooldownRoutes } from './management/cooldowns';
import { registerPerformanceRoutes } from './management/performance';
import { registerDebugRoutes } from './management/debug';
import { registerErrorRoutes } from './management/errors';
import { registerSystemLogRoutes } from './management/system-logs';
import { registerTestRoutes } from './management/test';
import { registerQuotaRoutes } from './management/quotas';
import { registerQuotaEnforcementRoutes } from './management/quota-enforcement';
import { registerUserQuotaRoutes } from './management/user-quotas';
import { registerOAuthRoutes } from './management/oauth';
import { registerMcpLogRoutes } from './management/mcp-logs';
import { registerLoggingRoutes } from './management/logging';
import { registerRestartRoutes } from './management/restart';
import { registerProviderRoutes } from './management/providers';
import { registerMetricsRoutes } from './management/metrics';
import { Dispatcher } from '../services/dispatcher';
import { QuotaScheduler } from '../services/quota/quota-scheduler';
import { QuotaEnforcer } from '../services/quota/quota-enforcer';
import { McpUsageStorageService } from '../services/mcp-proxy/mcp-usage-storage';

/**
 * Two-tier authentication for the management API.
 *
 * 1. Admin key (`x-admin-key` header) — full access to every route.
 * 2. API key (`Authorization: Bearer <secret>`) — restricted access to
 *    dashboard, logs and trace routes.  The resolved key name is stored on
 *    the request so downstream handlers can filter data.
 *
 * After this hook runs, every request carries:
 *   - request.authType: 'admin' | 'api-key'
 *   - request.keyName:  string | undefined   (set only for api-key users)
 */
function managementAuth(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  // --- Try admin key first ---
  const providedAdminKey = request.headers['x-admin-key'];
  const adminKey = process.env.ADMIN_KEY;

  if (providedAdminKey && providedAdminKey === adminKey) {
    (request as any).authType = 'admin';
    logger.silly(`[MGMT AUTH] Admin accepted for ${request.url}`);
    done();
    return;
  }

  // --- Try API key (Bearer token) ---
  const authHeader = request.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    const scheme = parts[0];
    const token = parts.length === 2 && scheme?.toLowerCase() === 'bearer' ? parts[1] : null;

    if (token) {
      const config = getConfig();
      if (config.keys) {
        const entry = Object.entries(config.keys).find(([_, k]) => (k as any)?.secret === token);
        if (entry) {
          (request as any).authType = 'api-key';
          (request as any).keyName = entry[0];
          logger.silly(`[MGMT AUTH] API-key user '${entry[0]}' accepted for ${request.url}`);
          done();
          return;
        }
      }
    }
  }

  logger.silly(`[MGMT AUTH] Rejected request to ${request.url} - invalid credentials`);
  reply.code(401).send({ error: { message: 'Unauthorized', type: 'auth_error', code: 401 } });
}

/**
 * Pre-handler that blocks non-admin users.
 * Apply to routes that only admins should access (config, providers, keys, etc.).
 */
function requireAdmin(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if ((request as any).authType !== 'admin') {
    reply.code(403).send({ error: { message: 'Forbidden', type: 'auth_error', code: 403 } });
    return;
  }
  done();
}

export async function registerManagementRoutes(
  fastify: FastifyInstance,
  usageStorage: UsageStorageService,
  dispatcher: Dispatcher,
  quotaScheduler?: QuotaScheduler,
  mcpUsageStorage?: McpUsageStorageService,
  quotaEnforcer?: QuotaEnforcer
) {
  // Verify endpoint — accepts both admin key and API key, returns auth info.
  fastify.get(
    '/v0/management/auth/verify',
    { preHandler: managementAuth },
    async (request, reply) => {
      const authType = (request as any).authType as string;
      const keyName = (request as any).keyName as string | undefined;
      return reply.send({ ok: true, authType, keyName });
    }
  );

  // All other management routes are protected by managementAuth,
  // scoped inside this plugin so the v1 bearer-auth routes are unaffected.
  fastify.register(async (protected_) => {
    protected_.addHook('preHandler', managementAuth);

    // --- Routes accessible to both admin and API-key users ---
    // (data is filtered server-side by apiKey for non-admin users)
    await registerUsageRoutes(protected_, usageStorage);
    await registerDebugRoutes(protected_, usageStorage);
    await registerPerformanceRoutes(protected_, usageStorage);

    // --- Admin-only routes ---
    protected_.register(async (adminOnly) => {
      adminOnly.addHook('preHandler', requireAdmin);

      await registerConfigRoutes(adminOnly);
      await registerCooldownRoutes(adminOnly);
      await registerErrorRoutes(adminOnly, usageStorage);
      await registerSystemLogRoutes(adminOnly);
      await registerTestRoutes(adminOnly, dispatcher);
      await registerOAuthRoutes(adminOnly);
      await registerLoggingRoutes(adminOnly);
      await registerRestartRoutes(adminOnly);
      await registerProviderRoutes(adminOnly);
      await registerMetricsRoutes(adminOnly, usageStorage);
      if (quotaScheduler) {
        await registerQuotaRoutes(adminOnly, quotaScheduler);
      }
      if (mcpUsageStorage) {
        await registerMcpLogRoutes(adminOnly, mcpUsageStorage);
      }
      if (quotaEnforcer) {
        await registerQuotaEnforcementRoutes(adminOnly, quotaEnforcer);
      }
      await registerUserQuotaRoutes(adminOnly);
    });
  });
}

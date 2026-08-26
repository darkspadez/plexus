import { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';
import { logger } from '../../utils/logger';
import { resolveApiKey } from '../../utils/auth';

/**
 * Sentinel error thrown by authenticate/requireAdmin so that Fastify's error
 * handler can send the correctly-shaped management auth response. In Fastify v5
 * async hooks must throw (not call reply.send) to abort the hook chain.
 */
export class ManagementAuthError extends Error {
  statusCode: number;
  authBody: object;
  constructor(statusCode: number, message: string, type: string) {
    super(message);
    this.statusCode = statusCode;
    this.authBody = { error: { message, type, code: statusCode } };
  }
}

/**
 * Authenticated identity for a management-API request.
 *
 * - admin   → full access (the ADMIN_KEY was presented)
 * - limited → a specific api_keys row; access is scoped to that key's name
 */
export type Principal =
  | { role: 'admin' }
  | {
      role: 'limited';
      keyId?: number;
      keyName: string;
      allowedProviders: string[];
      allowedModels: string[];
      excludedProviders: string[];
      excludedModels: string[];
      quotaNames: string[];
      // Deprecated: first entry of quotaNames, kept for transition compat.
      quotaName?: string | null;
      comment?: string | null;
    };

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Resolve the principal for an incoming management request.
 * Returns null if no valid credential was presented.
 */
export async function resolvePrincipal(request: FastifyRequest): Promise<Principal | null> {
  const providedKey = request.headers['x-admin-key'];
  if (typeof providedKey !== 'string' || providedKey.length === 0) return null;

  const adminKey = process.env.ADMIN_KEY;
  if (adminKey && constantTimeEquals(providedKey, adminKey)) {
    return { role: 'admin' };
  }

  try {
    const resolved = await resolveApiKey(providedKey, request, { recordActivity: false });
    if (!resolved) return null;
    const cfg = resolved.config;
    return {
      role: 'limited',
      keyId: resolved.id,
      keyName: resolved.name,
      allowedProviders: cfg.allowedProviders ?? [],
      allowedModels: cfg.allowedModels ?? [],
      excludedProviders: cfg.excludedProviders ?? [],
      excludedModels: cfg.excludedModels ?? [],
      quotaNames: cfg.quotas ?? [],
      quotaName: cfg.quotas?.[0] ?? null,
      comment: cfg.comment ?? null,
    };
  } catch (err) {
    logger.silly('api_keys lookup failed', {
      errorType: err instanceof Error ? err.name : typeof err,
    });
    return null;
  }
}

/**
 * Fastify preHandler that authenticates a request and attaches the principal.
 * 401 if the credential is missing/invalid.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const queryIndex = request.url.indexOf('?');
  const requestPath = queryIndex === -1 ? request.url : request.url.slice(0, queryIndex);
  const principal = await resolvePrincipal(request);
  if (!principal) {
    logger.silly(`Rejected request to ${requestPath} - invalid or missing credential`);
    throw new ManagementAuthError(401, 'Unauthorized', 'auth_error');
  }
  request.principal = principal;
  logger.silly(
    `[ADMIN AUTH] Accepted request to ${requestPath} as ${
      principal.role === 'admin' ? 'admin' : `limited(${principal.keyName})`
    }`
  );
}

/**
 * Fastify preHandler that requires the authenticated principal to be admin.
 * Must run AFTER `authenticate`. Returns 403 for limited users.
 */
export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.principal) {
    throw new ManagementAuthError(401, 'Unauthorized', 'auth_error');
  }
  if (request.principal.role !== 'admin') {
    throw new ManagementAuthError(403, 'Admin privileges required', 'forbidden');
  }
}

/**
 * For a handler that serves both admin and limited users, returns the key
 * name the principal is scoped to (or null if admin and unscoped).
 */
export function scopedKeyName(request: FastifyRequest): string | null {
  const p = request.principal;
  if (!p) return null;
  if (p.role === 'limited') return p.keyName;
  return null;
}

/**
 * True when the request is authenticated as a limited (api-key) user.
 */
export function isLimited(request: FastifyRequest): boolean {
  return request.principal?.role === 'limited';
}

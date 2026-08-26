import type { FastifyRequest } from 'fastify';
import { getConfig, isKeyDisabled, type KeyConfig } from '../config';
import { ConfigRepository, type InternalApiKeyRecord } from '../db/config-repository';
import { logger } from './logger';
import { getTrustedClientIp } from './ip';
import { isIpAllowed } from './ip-match';
import { enterRequestContext } from '../services/observability/request-context';
import { ApiKeyActivityRecorder } from '../services/api-key-security/activity-recorder';

export type ResolvedApiKey = {
  readonly id: number;
  readonly name: string;
  readonly config: KeyConfig;
  readonly attribution: string | null;
};

type AuthRepository = Pick<ConfigRepository, 'resolveKeyBySecret'>;
type ActivityRecorder = Pick<ApiKeyActivityRecorder, 'recordSuccessfulAuth'>;

export type AuthHookOptions = {
  readonly allowQueryKey?: boolean;
  readonly repository?: AuthRepository;
  readonly activityRecorder?: ActivityRecorder;
  readonly recordActivity?: boolean;
};

declare module 'fastify' {
  interface FastifyRequest {
    keyId?: number;
    keyName?: string;
    keyConfig?: KeyConfig;
    attribution?: string | null;
  }
}

export function attachKeyAccessPolicy<T extends { metadata?: Record<string, any> }>(
  request: FastifyRequest,
  unifiedRequest: T
): T {
  const keyConfig = (request as any).keyConfig as
    | {
        allowedModels?: string[];
        allowedProviders?: string[];
        excludedModels?: string[];
        excludedProviders?: string[];
      }
    | undefined;

  // Canonical normalization: trim/strip empty entries.
  // Dispatcher's getKeyAccessPolicy() trusts this is already clean.
  const allowedModels = keyConfig?.allowedModels?.map((entry) => entry.trim()).filter(Boolean);
  const allowedProviders = keyConfig?.allowedProviders
    ?.map((entry) => entry.trim())
    .filter(Boolean);
  const excludedModels = keyConfig?.excludedModels?.map((entry) => entry.trim()).filter(Boolean);
  const excludedProviders = keyConfig?.excludedProviders
    ?.map((entry) => entry.trim())
    .filter(Boolean);

  if (
    (!allowedModels || allowedModels.length === 0) &&
    (!allowedProviders || allowedProviders.length === 0) &&
    (!excludedModels || excludedModels.length === 0) &&
    (!excludedProviders || excludedProviders.length === 0)
  ) {
    return unifiedRequest;
  }

  return {
    ...unifiedRequest,
    metadata: {
      ...(unifiedRequest.metadata || {}),
      plexus_metadata: {
        ...(unifiedRequest.metadata?.plexus_metadata || {}),
        plexus_key_policy: {
          ...(allowedModels && allowedModels.length > 0 ? { allowedModels } : {}),
          ...(allowedProviders && allowedProviders.length > 0 ? { allowedProviders } : {}),
          ...(excludedModels && excludedModels.length > 0 ? { excludedModels } : {}),
          ...(excludedProviders && excludedProviders.length > 0 ? { excludedProviders } : {}),
        },
      },
    },
  };
}

export function isRequestIpAllowed(
  request: FastifyRequest,
  allowedIps: string[] | undefined,
  trustedProxies: string[] | undefined
): boolean {
  const clientIp = getTrustedClientIp(request, trustedProxies);
  return isIpAllowed(clientIp, allowedIps);
}

function parseCredential(credential: string): {
  readonly secretPart: string;
  readonly attribution: string | null;
} {
  const firstColonIndex = credential.indexOf(':');
  if (firstColonIndex === -1) {
    return { secretPart: credential, attribution: null };
  }

  const rawAttribution = credential.substring(firstColonIndex + 1);
  return {
    secretPart: credential.substring(0, firstColonIndex),
    attribution: rawAttribution.toLowerCase() || null,
  };
}

function getTrustedProxies(): string[] | undefined {
  return getConfig().trustedProxies;
}

function attachResolvedApiKey(request: FastifyRequest, resolved: ResolvedApiKey): void {
  request.keyId = resolved.id;
  request.keyName = resolved.name;
  request.keyConfig = resolved.config;
  request.attribution = resolved.attribution;
  enterRequestContext({ keyName: resolved.name });
}

export async function resolveApiKey(
  credential: string,
  request: FastifyRequest,
  options: {
    readonly repository?: AuthRepository;
    readonly activityRecorder?: ActivityRecorder;
    readonly recordActivity?: boolean;
  } = {}
): Promise<ResolvedApiKey | null> {
  const { secretPart, attribution } = parseCredential(credential);
  const repository = options.repository ?? new ConfigRepository();

  try {
    const record: InternalApiKeyRecord | null = await repository.resolveKeyBySecret(secretPart);
    if (!record || isKeyDisabled(record.config) || record.config.pausedAt !== undefined) {
      return null;
    }

    if (!isRequestIpAllowed(request, record.config.allowedIps, getTrustedProxies())) {
      return null;
    }

    const resolved: ResolvedApiKey = {
      id: record.id,
      name: record.name,
      config: record.config,
      attribution,
    };
    attachResolvedApiKey(request, resolved);

    if (options.recordActivity === true) {
      try {
        (options.activityRecorder ?? ApiKeyActivityRecorder.getInstance()).recordSuccessfulAuth(
          resolved.id,
          Date.now()
        );
      } catch (error) {
        logger.warn('API key activity recording failed', {
          errorType: error instanceof Error ? error.name : typeof error,
        });
      }
    }

    return resolved;
  } catch (error) {
    logger.error('API key resolution failed', {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

export function createAuthHook(options: AuthHookOptions = {}) {
  const allowQueryKey = options.allowQueryKey !== false;
  const repository = options.repository ?? new ConfigRepository();
  const recordActivity = options.recordActivity !== false;
  return {
    onRequest: async (request: FastifyRequest) => {
      const queryIndex = request.url.indexOf('?');
      const requestPath = queryIndex === -1 ? request.url : request.url.slice(0, queryIndex);
      logger.silly(`onRequest called: ${request.method} ${requestPath}`);

      // Normalize Authorization header - ensure it has "Bearer " prefix
      const authHeader = request.headers.authorization;
      if (authHeader) {
        if (!authHeader.toLowerCase().startsWith('bearer ')) {
          logger.silly(`Adding Bearer prefix to existing Authorization header`);
          request.headers.authorization = `Bearer ${authHeader}`;
        }
      } else {
        // No Authorization header, try x-api-key or x-goog-api-key
        let apiKey = request.headers['x-api-key'] || request.headers['x-goog-api-key'];

        if (allowQueryKey && !apiKey && request.query && typeof request.query === 'object') {
          apiKey = (request.query as any).key;
        }

        if (typeof apiKey === 'string') {
          request.headers.authorization = `Bearer ${apiKey}`;
          logger.silly(`Set authorization from x-api-key/x-goog-api-key`);
        }
      }
    },

    bearerAuthOptions: {
      keys: new Set([]),
      auth: async (key: string, req: FastifyRequest): Promise<boolean> => {
        const resolved = await resolveApiKey(key, req, {
          repository,
          activityRecorder: options.activityRecorder,
          recordActivity,
        });
        if (!resolved) {
          logger.silly('Auth FAILED - credential rejected');
          return false;
        }
        logger.silly(`Auth SUCCESS for key: ${resolved.name}`);
        return true;
      },
      errorResponse: () => ({ error: 'Unauthorized' }),
    },
  };
}

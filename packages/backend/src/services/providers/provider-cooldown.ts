import { getProviderTypes } from '../../config';
import { logger } from '../../utils/logger';
import { CooldownParserRegistry } from '../runtime/cooldown-parsers';
import type { RouteResult } from '../routing/router';

export function resolveCooldownProviderType(route: RouteResult): string | undefined {
  if (typeof route.config.oauth_provider === 'string' && route.config.oauth_provider.trim()) {
    return route.config.oauth_provider.trim();
  }

  return getProviderTypes(route.config)[0];
}

export function parseCooldownDurationForProvider(
  providerType: string | undefined,
  errorText: string,
  source: 'HTTP' | 'OAuth'
): number | undefined {
  if (!providerType) {
    return undefined;
  }

  const parsedDuration = CooldownParserRegistry.parseCooldown(providerType, errorText);

  if (parsedDuration !== null) {
    logger.info(
      `${source}: Parsed cooldown duration for ${providerType}: ${parsedDuration}ms (${parsedDuration / 1000}s)`
    );
    return parsedDuration;
  }

  logger.debug(`${source}: No cooldown duration parsed for ${providerType}, using default`);
  return undefined;
}

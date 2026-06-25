import { registerOAuthProvider } from '@earendil-works/pi-ai/oauth';
import type { Model } from '@earendil-works/pi-ai';
import { logger } from '../../utils/logger';
import { xaiOAuthProvider, getXaiModel } from './xai';
import { cursorOAuthProvider, getCursorModel, streamCursor, completeCursor } from './cursor';

/**
 * OAuth provider ids implemented locally in plexus (not built into pi-ai).
 * These are registered into pi-ai's OAuth registry at startup via
 * registerOAuthProviders() so the existing login/auth/dispatch machinery
 * (OAuthLoginSessionManager, OAuthAuthManager, OAuthTransformer) picks them up.
 */
const CUSTOM_OAUTH_PROVIDER_IDS = new Set<string>(['xai', 'cursor']);

export function isCustomOAuthProvider(provider: string): boolean {
  return CUSTOM_OAUTH_PROVIDER_IDS.has(provider);
}

let registered = false;

/**
 * Register plexus's local OAuth providers (xAI/Grok, Cursor) into pi-ai's
 * provider registry. After this runs, getOAuthProvider()/getOAuthProviders()
 * (login) and getOAuthApiKey() (token refresh) resolve them like built-ins.
 * Idempotent; call once at startup before any OAuth login or dispatch.
 */
export function registerOAuthProviders(): void {
  if (registered) return;
  registerOAuthProvider(xaiOAuthProvider);
  registerOAuthProvider(cursorOAuthProvider);
  registered = true;
  logger.debug('Registered local OAuth providers: xai, cursor');
}

/**
 * Resolve a pi-ai Model for a locally-registered OAuth provider's model id.
 * Used by OAuthTransformer.getPiAiModel as a fallback when pi-ai's builtin
 * registry doesn't know the model (xai/cursor models are not built in).
 */
export function getOAuthProviderModel(provider: string, modelId: string): Model<any> | undefined {
  if (provider === 'xai') return getXaiModel(modelId);
  if (provider === 'cursor') return getCursorModel(modelId);
  return undefined;
}

export { streamCursor, completeCursor };

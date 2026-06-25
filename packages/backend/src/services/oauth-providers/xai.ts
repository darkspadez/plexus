/**
 * xAI / Grok OAuth provider for plexus-compose.
 *
 * Implements the OAuth 2.0 Device Authorization Grant (RFC 8628) against
 * xAI's public OIDC endpoints. The device flow is used as the primary login
 * because it requires no redirect URI, which suits plexus's client/server
 * model (the backend cannot host a localhost callback the user's browser can
 * reach).
 *
 * Endpoints are discovered at runtime via the OIDC discovery document and
 * validated to live under `*.x.ai` over HTTPS. Hardcoded values are used as a
 * fallback if discovery fails.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Model } from '@earendil-works/pi-ai';
import type {
  OAuthCredentials,
  OAuthLoginCallbacks,
  OAuthProviderId,
  OAuthProviderInterface,
} from '@earendil-works/pi-ai/oauth';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** OIDC discovery document for xAI's auth server. */
const DISCOVERY_URL = 'https://auth.x.ai/.well-known/openid-configuration';

/** Hardcoded endpoint fallbacks (used when discovery fails or is invalid). */
const FALLBACK_AUTHORIZATION_ENDPOINT = 'https://auth.x.ai/oauth2/authorize';
const FALLBACK_TOKEN_ENDPOINT = 'https://auth.x.ai/oauth2/token';
const FALLBACK_DEVICE_ENDPOINT = 'https://auth.x.ai/oauth2/device/code';

/** Public Grok CLI client id (no secret; relies on PKCE). */
const CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';

/** Requested OAuth scopes. */
const SCOPE = 'openid profile email offline_access grok-cli:access api:access';

/** Base URL for xAI's inference + model-listing API. */
const API_BASE_URL = 'https://api.x.ai/v1';

/** Endpoint that lists available language models. */
const LANGUAGE_MODELS_URL = `${API_BASE_URL}/language-models`;

/** Provider id as used in pi-ai. The provider-id union is closed, so cast. */
const PROVIDER_ID = 'xai' as OAuthProviderId;

/** API surface for xAI models. */
const API_KIND = 'openai-responses';

/** pi-ai provider tag for the static model catalog. */
const PROVIDER_TAG = 'xai';

/** Subtract this from token lifetimes so we refresh before the real expiry. */
const EXPIRY_SKEW_MS = 120_000;

/** Default token lifetime when the server omits `expires_in` and JWT `exp`. */
const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600;

/** RFC 8628 default poll interval when the server omits `interval`. */
const DEFAULT_POLL_INTERVAL_SECONDS = 5;

/** Minimum poll interval, to avoid hammering the token endpoint. */
const MIN_POLL_INTERVAL_SECONDS = 1;

/** Each `slow_down` response bumps the interval by this much (RFC 8628 §3.5). */
const SLOW_DOWN_INCREMENT_SECONDS = 5;

/** Fallback device-code lifetime if the server omits `expires_in`. */
const DEFAULT_DEVICE_EXPIRY_SECONDS = 15 * 60;

const CANCELLED_MESSAGE = 'Login cancelled';

const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' } as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** PKCE verifier/challenge pair (S256). */
export type PkcePair = {
  verifier: string;
  challenge: string;
};

/** Resolved OAuth endpoints (from discovery or fallback). */
type OAuthEndpoints = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  deviceAuthorizationEndpoint: string;
  /**
   * PKCE code-challenge methods the device endpoint advertises. Empty when
   * discovery does not list any, in which case we omit PKCE for the device
   * flow (it is optional in RFC 8628 and not required by xAI's public client).
   */
  codeChallengeMethodsSupported: string[];
};

/** Raw token-endpoint response (snake_case as returned by the server). */
type RawTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
  id_token?: unknown;
};

/** Raw device-authorization response (RFC 8628). */
type RawDeviceCodeResponse = {
  device_code?: unknown;
  user_code?: unknown;
  verification_uri?: unknown;
  verification_uri_complete?: unknown;
  expires_in?: unknown;
  interval?: unknown;
};

/** Normalized device-authorization response. */
type DeviceAuthorization = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresInSeconds: number;
  intervalSeconds: number;
};

// ---------------------------------------------------------------------------
// PKCE (pure)
// ---------------------------------------------------------------------------

/**
 * Generate a PKCE verifier/challenge pair using S256.
 * verifier = base64url(32 random bytes); challenge = base64url(sha256(verifier)).
 */
export function generatePkcePair(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// ---------------------------------------------------------------------------
// URL / form builders (pure)
// ---------------------------------------------------------------------------

/**
 * Build the authorization URL for the (secondary) browser/redirect flow.
 * Exposed primarily for completeness and unit testing; the device flow is the
 * primary login path.
 */
export function buildAuthorizeUrl(params: {
  authorizationEndpoint: string;
  clientId?: string;
  scope?: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const url = new URL(params.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId ?? CLIENT_ID);
  url.searchParams.set('scope', params.scope ?? SCOPE);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('code_challenge', params.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', params.state);
  return url.toString();
}

/**
 * Build the form body for the device-authorization request.
 * Includes PKCE only when the caller indicates the device endpoint supports it.
 */
export function buildDeviceAuthorizationBody(params: {
  clientId?: string;
  scope?: string;
  challenge?: string;
  includePkce?: boolean;
}): URLSearchParams {
  const body = new URLSearchParams();
  body.set('client_id', params.clientId ?? CLIENT_ID);
  body.set('scope', params.scope ?? SCOPE);
  if (params.includePkce && params.challenge) {
    body.set('code_challenge', params.challenge);
    body.set('code_challenge_method', 'S256');
  }
  return body;
}

/** Build the form body for polling the token endpoint with a device code. */
export function buildDeviceTokenBody(params: {
  deviceCode: string;
  clientId?: string;
  verifier?: string;
}): URLSearchParams {
  const body = new URLSearchParams();
  body.set('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
  body.set('device_code', params.deviceCode);
  body.set('client_id', params.clientId ?? CLIENT_ID);
  // PKCE is optional for the device grant; include the verifier when present so
  // servers that bound the challenge can validate it.
  if (params.verifier) {
    body.set('code_verifier', params.verifier);
  }
  return body;
}

/** Build the form body for a refresh-token request. */
export function buildRefreshTokenBody(params: {
  refreshToken: string;
  clientId?: string;
}): URLSearchParams {
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', params.refreshToken);
  body.set('client_id', params.clientId ?? CLIENT_ID);
  return body;
}

// ---------------------------------------------------------------------------
// JWT / token parsing (pure)
// ---------------------------------------------------------------------------

/** Decode a JWT payload without verifying the signature. Returns null on error. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const payload = parts[1];
    if (!payload) {
      return null;
    }
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Extract the `exp` claim (seconds since epoch) from a JWT, or null. */
export function getJwtExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp === 'number' && Number.isFinite(exp) && exp > 0) {
    return exp * 1000;
  }
  return null;
}

/**
 * Compute the absolute expiry (ms epoch) for a token, applying skew.
 *
 * Preference order:
 *   1. `expires_in` (seconds) from the token response.
 *   2. JWT `exp` claim on the access token.
 *   3. A default lifetime.
 *
 * @param now - injectable clock for deterministic testing.
 */
export function computeExpiry(
  expiresInSeconds: number | undefined,
  accessToken: string | undefined,
  now: number = Date.now()
): number {
  if (
    typeof expiresInSeconds === 'number' &&
    Number.isFinite(expiresInSeconds) &&
    expiresInSeconds > 0
  ) {
    return now + expiresInSeconds * 1000 - EXPIRY_SKEW_MS;
  }
  if (accessToken) {
    const jwtExpiry = getJwtExpiryMs(accessToken);
    if (jwtExpiry !== null) {
      return jwtExpiry - EXPIRY_SKEW_MS;
    }
  }
  return now + DEFAULT_TOKEN_LIFETIME_SECONDS * 1000 - EXPIRY_SKEW_MS;
}

/**
 * Map a raw token-endpoint response to OAuthCredentials.
 *
 * @param previousRefresh - existing refresh token, kept when the response omits one.
 * @param now - injectable clock for deterministic testing.
 * @throws if the response has no access token.
 */
export function tokenResponseToCredentials(
  raw: RawTokenResponse,
  previousRefresh: string | undefined,
  now: number = Date.now()
): OAuthCredentials {
  const access = typeof raw.access_token === 'string' ? raw.access_token : '';
  if (!access) {
    throw new Error('xAI token response missing access_token');
  }
  const refresh =
    typeof raw.refresh_token === 'string' && raw.refresh_token.length > 0
      ? raw.refresh_token
      : (previousRefresh ?? '');
  const expiresIn = typeof raw.expires_in === 'number' ? raw.expires_in : undefined;
  return {
    type: 'oauth',
    access,
    refresh,
    expires: computeExpiry(expiresIn, access, now),
  } as OAuthCredentials;
}

/** Normalize a raw device-authorization response (RFC 8628). */
export function parseDeviceAuthorization(raw: RawDeviceCodeResponse): DeviceAuthorization {
  const deviceCode = typeof raw.device_code === 'string' ? raw.device_code : '';
  const userCode = typeof raw.user_code === 'string' ? raw.user_code : '';
  const verificationUri = typeof raw.verification_uri === 'string' ? raw.verification_uri : '';
  if (!deviceCode || !userCode || !verificationUri) {
    throw new Error(`xAI device authorization response missing fields: ${JSON.stringify(raw)}`);
  }
  const verificationUriComplete =
    typeof raw.verification_uri_complete === 'string' ? raw.verification_uri_complete : undefined;
  const expiresInSeconds =
    typeof raw.expires_in === 'number' && Number.isFinite(raw.expires_in) && raw.expires_in > 0
      ? raw.expires_in
      : DEFAULT_DEVICE_EXPIRY_SECONDS;
  const intervalSeconds =
    typeof raw.interval === 'number' && Number.isFinite(raw.interval) && raw.interval > 0
      ? raw.interval
      : DEFAULT_POLL_INTERVAL_SECONDS;
  return {
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete,
    expiresInSeconds,
    intervalSeconds: Math.max(MIN_POLL_INTERVAL_SECONDS, intervalSeconds),
  };
}

// ---------------------------------------------------------------------------
// Static model catalog
// ---------------------------------------------------------------------------

type ModelSeed = {
  id: string;
  name: string;
  reasoning: boolean;
  input: ('text' | 'image')[];
  contextWindow: number;
  maxTokens: number;
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

const DEFAULT_COST = { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0 } as const;

/**
 * Static fallback catalog. `grok-4.3` is the default flagship model. Values are
 * based on xAI's published catalog; treat costs/context as best-effort defaults
 * (discoverXaiModels overrides ids from the live API when available).
 */
const STATIC_MODEL_SEEDS: ModelSeed[] = [
  {
    id: 'grok-4.3',
    name: 'Grok 4.3',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 1_000_000,
    maxTokens: 30_000,
  },
  {
    id: 'grok-4.20-0309-reasoning',
    name: 'Grok 4.20 (Reasoning)',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 2_000_000,
    maxTokens: 30_000,
  },
  {
    id: 'grok-4.20-0309-non-reasoning',
    name: 'Grok 4.20 (Non-Reasoning)',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 2_000_000,
    maxTokens: 30_000,
  },
  {
    id: 'grok-4-fast',
    name: 'Grok 4 Fast',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 1_000_000,
    maxTokens: 30_000,
    cost: { input: 0.2, output: 0.5, cacheRead: 0.05, cacheWrite: 0 },
  },
  {
    id: 'grok-code-fast-1',
    name: 'Grok Code Fast 1',
    reasoning: false,
    input: ['text'],
    contextWindow: 256_000,
    maxTokens: 30_000,
    cost: { input: 0.2, output: 1.5, cacheRead: 0.02, cacheWrite: 0 },
  },
];

/** Build a pi-ai Model definition from a seed. */
function seedToModel(seed: ModelSeed): Model<typeof API_KIND> {
  return {
    id: seed.id,
    name: seed.name,
    api: API_KIND,
    provider: PROVIDER_TAG,
    baseUrl: API_BASE_URL,
    reasoning: seed.reasoning,
    input: seed.input,
    cost: seed.cost ?? { ...DEFAULT_COST },
    contextWindow: seed.contextWindow,
    maxTokens: seed.maxTokens,
  };
}

const STATIC_MODELS: Model<typeof API_KIND>[] = STATIC_MODEL_SEEDS.map(seedToModel);

const STATIC_MODELS_BY_ID = new Map<string, Model<typeof API_KIND>>(
  STATIC_MODELS.map((model) => [model.id, model])
);

/** Look up a known xAI model by id from the static catalog. */
export function getXaiModel(modelId: string): Model<typeof API_KIND> | undefined {
  return STATIC_MODELS_BY_ID.get(modelId);
}

/** List the static xAI model catalog (fresh copies). */
export function listXaiModels(): Model<typeof API_KIND>[] {
  return STATIC_MODELS.map((model) => ({
    ...model,
    input: [...model.input],
    cost: { ...model.cost },
  }));
}

/**
 * Derive a human-friendly display name from a model id when the API does not
 * provide one (e.g. "grok-4.20-0309-reasoning" -> "Grok 4.20 0309 Reasoning").
 */
function humanizeModelId(id: string): string {
  const cleaned = id.replace(/[-_]+/g, ' ').trim();
  return cleaned
    .split(' ')
    .map((word) => (word.toLowerCase() === 'grok' ? 'Grok' : word))
    .join(' ');
}

/** Map a model id discovered from the API to a pi-ai Model definition. */
function discoveredIdToModel(id: string): Model<typeof API_KIND> {
  const known = STATIC_MODELS_BY_ID.get(id);
  if (known) {
    return { ...known, input: [...known.input], cost: { ...known.cost } };
  }
  const lower = id.toLowerCase();
  // Heuristic: anything not explicitly "non-reasoning" is treated as a
  // reasoning-capable model, matching xAI's current lineup defaults.
  const reasoning = !lower.includes('non-reasoning');
  const input: ('text' | 'image')[] = lower.includes('code') ? ['text'] : ['text', 'image'];
  return seedToModel({
    id,
    name: humanizeModelId(id),
    reasoning,
    input,
    contextWindow: 1_000_000,
    maxTokens: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

/** Validate that a URL is HTTPS and lives under *.x.ai (or is exactly x.ai). */
function isTrustedXaiEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      return false;
    }
    const host = url.hostname.toLowerCase();
    return host === 'x.ai' || host.endsWith('.x.ai');
  } catch {
    return false;
  }
}

/**
 * Fetch and validate the OIDC discovery document. Falls back to hardcoded
 * endpoints on any failure or when a discovered endpoint is not a trusted host.
 */
async function resolveEndpoints(signal?: AbortSignal): Promise<OAuthEndpoints> {
  const fallback: OAuthEndpoints = {
    authorizationEndpoint: FALLBACK_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: FALLBACK_TOKEN_ENDPOINT,
    deviceAuthorizationEndpoint: FALLBACK_DEVICE_ENDPOINT,
    codeChallengeMethodsSupported: [],
  };

  try {
    const response = await fetch(DISCOVERY_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!response.ok) {
      logger.warn(`xAI OAuth: discovery returned ${response.status}; using fallback endpoints`);
      return fallback;
    }
    const doc = (await response.json()) as Record<string, unknown>;

    const authorizationEndpoint = isTrustedXaiEndpoint(doc.authorization_endpoint)
      ? doc.authorization_endpoint
      : fallback.authorizationEndpoint;
    const tokenEndpoint = isTrustedXaiEndpoint(doc.token_endpoint)
      ? doc.token_endpoint
      : fallback.tokenEndpoint;
    const deviceAuthorizationEndpoint = isTrustedXaiEndpoint(doc.device_authorization_endpoint)
      ? doc.device_authorization_endpoint
      : fallback.deviceAuthorizationEndpoint;

    const methods = doc.code_challenge_methods_supported;
    const codeChallengeMethodsSupported = Array.isArray(methods)
      ? methods.filter((m): m is string => typeof m === 'string')
      : [];

    return {
      authorizationEndpoint,
      tokenEndpoint,
      deviceAuthorizationEndpoint,
      codeChallengeMethodsSupported,
    };
  } catch (error) {
    if (signal?.aborted) {
      throw new Error(CANCELLED_MESSAGE);
    }
    logger.warn(
      `xAI OAuth: discovery failed (${error instanceof Error ? error.message : String(error)}); using fallback endpoints`
    );
    return fallback;
  }
}

/** POST a form body, throwing a descriptive error on non-2xx responses. */
async function postForm(
  url: string,
  body: URLSearchParams,
  operation: string,
  signal?: AbortSignal
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { ...FORM_HEADERS, Accept: 'application/json' },
      body,
      signal,
    });
  } catch (error) {
    if (signal?.aborted) {
      throw new Error(CANCELLED_MESSAGE);
    }
    throw new Error(
      `xAI OAuth ${operation} request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return response;
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(CANCELLED_MESSAGE));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error(CANCELLED_MESSAGE));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

// ---------------------------------------------------------------------------
// Device authorization flow
// ---------------------------------------------------------------------------

/** Request a device code from the device-authorization endpoint. */
async function requestDeviceAuthorization(
  endpoints: OAuthEndpoints,
  pkce: PkcePair,
  signal?: AbortSignal
): Promise<DeviceAuthorization> {
  const includePkce = endpoints.codeChallengeMethodsSupported.includes('S256');
  const body = buildDeviceAuthorizationBody({
    challenge: pkce.challenge,
    includePkce,
  });

  const response = await postForm(
    endpoints.deviceAuthorizationEndpoint,
    body,
    'device authorization',
    signal
  );
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `xAI device authorization failed (${response.status}): ${text || response.statusText}`
    );
  }
  const raw = (await response.json()) as RawDeviceCodeResponse;
  return parseDeviceAuthorization(raw);
}

/**
 * Poll the token endpoint until the device authorization completes, the user
 * denies it, the code expires, or the abort signal fires.
 */
async function pollForDeviceToken(
  endpoints: OAuthEndpoints,
  device: DeviceAuthorization,
  pkce: PkcePair,
  includeVerifier: boolean,
  callbacks: OAuthLoginCallbacks
): Promise<OAuthCredentials> {
  const { signal } = callbacks;
  const deadline = Date.now() + device.expiresInSeconds * 1000;
  let intervalSeconds = device.intervalSeconds;

  const body = buildDeviceTokenBody({
    deviceCode: device.deviceCode,
    verifier: includeVerifier ? pkce.verifier : undefined,
  });

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error(CANCELLED_MESSAGE);
    }

    await sleep(intervalSeconds * 1000, signal);

    const response = await postForm(endpoints.tokenEndpoint, body, 'device token', signal);

    if (response.ok) {
      const raw = (await response.json()) as RawTokenResponse;
      const credentials = tokenResponseToCredentials(raw, undefined);
      callbacks.onProgress?.('xAI authorization complete.');
      return credentials;
    }

    const text = await response.text().catch(() => '');
    const errorCode = extractOAuthErrorCode(text);

    if (errorCode === 'authorization_pending') {
      callbacks.onProgress?.('Waiting for xAI authorization...');
      continue;
    }
    if (errorCode === 'slow_down') {
      intervalSeconds += SLOW_DOWN_INCREMENT_SECONDS;
      callbacks.onProgress?.(`xAI asked us to slow down; polling every ${intervalSeconds}s.`);
      continue;
    }
    if (errorCode === 'access_denied') {
      throw new Error('xAI authorization was denied.');
    }
    if (errorCode === 'expired_token') {
      throw new Error('xAI device code expired before authorization completed.');
    }
    throw new Error(
      `xAI device token request failed (${response.status}): ${errorCode || text || response.statusText}`
    );
  }

  throw new Error('xAI device code expired before authorization completed.');
}

/** Parse the OAuth `error` code from a token-endpoint error body. */
function extractOAuthErrorCode(body: string): string | undefined {
  if (!body) {
    return undefined;
  }
  try {
    const json = JSON.parse(body);
    const error = json?.error;
    return typeof error === 'string' ? error : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/** Run the xAI device-authorization login flow. */
async function login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  const { signal } = callbacks;
  if (signal?.aborted) {
    throw new Error(CANCELLED_MESSAGE);
  }

  callbacks.onProgress?.('Contacting xAI authorization server...');
  const endpoints = await resolveEndpoints(signal);
  const pkce = generatePkcePair();
  const includeVerifier = endpoints.codeChallengeMethodsSupported.includes('S256');

  const device = await requestDeviceAuthorization(endpoints, pkce, signal);

  callbacks.onDeviceCode({
    userCode: device.userCode,
    verificationUri: device.verificationUriComplete || device.verificationUri,
    intervalSeconds: device.intervalSeconds,
    expiresInSeconds: device.expiresInSeconds,
  });
  callbacks.onProgress?.(
    `Visit ${device.verificationUriComplete || device.verificationUri} and enter code ${device.userCode}.`
  );

  return pollForDeviceToken(endpoints, device, pkce, includeVerifier, callbacks);
}

/** Refresh an expired access token using the stored refresh token. */
async function refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  if (!credentials.refresh) {
    throw new Error('xAI OAuth: no refresh token available; please log in again.');
  }

  const endpoints = await resolveEndpoints();
  const body = buildRefreshTokenBody({ refreshToken: credentials.refresh });

  const response = await postForm(endpoints.tokenEndpoint, body, 'token refresh');
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `xAI token refresh failed (${response.status}): ${text || response.statusText}`
    );
  }
  const raw = (await response.json()) as RawTokenResponse;
  // Preserve the previous refresh token when the server omits a new one.
  return tokenResponseToCredentials(raw, credentials.refresh);
}

/** Convert credentials into the API key/bearer token used for requests. */
function getApiKey(credentials: OAuthCredentials): string {
  return credentials.access;
}

/**
 * Best-effort discovery of available models from the live xAI API. Falls back
 * to the static catalog on any error.
 */
export async function discoverXaiModels(accessToken: string): Promise<Model<typeof API_KIND>[]> {
  try {
    const response = await fetch(LANGUAGE_MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      logger.warn(`xAI OAuth: model discovery returned ${response.status}; using static catalog`);
      return listXaiModels();
    }
    const data = (await response.json()) as { models?: unknown };
    const rawModels = Array.isArray(data?.models) ? data.models : [];
    const ids = rawModels
      .map((entry) =>
        entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string'
          ? (entry as { id: string }).id
          : null
      )
      .filter((id): id is string => !!id);

    if (ids.length === 0) {
      logger.warn('xAI OAuth: model discovery returned no models; using static catalog');
      return listXaiModels();
    }
    return ids.map(discoveredIdToModel);
  } catch (error) {
    logger.warn(
      `xAI OAuth: model discovery failed (${error instanceof Error ? error.message : String(error)}); using static catalog`
    );
    return listXaiModels();
  }
}

/**
 * xAI / Grok OAuth provider.
 *
 * Integration notes:
 *  - `getApiKey(creds)` returns the raw access token. The integration layer
 *    must send it as `Authorization: Bearer <token>` to `https://api.x.ai/v1`.
 *  - All models point at `baseUrl: https://api.x.ai/v1` with
 *    `api: 'openai-responses'`. Use `listXaiModels()`/`getXaiModel()` for the
 *    static catalog, or `discoverXaiModels(accessToken)` for the live list.
 *  - `usesCallbackServer: false` — login uses the device grant (no redirect).
 */
export const xaiOAuthProvider: OAuthProviderInterface = {
  id: PROVIDER_ID,
  name: 'xAI / Grok',
  usesCallbackServer: false,
  login,
  refreshToken,
  getApiKey,
};

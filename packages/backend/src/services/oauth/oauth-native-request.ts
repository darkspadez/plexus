/**
 * Native OAuth request preparation — the piece that lets the OAuth path run
 * through the *normal* dispatch execution (real fetch + raw-bytes pass-through)
 * instead of pi-ai's `Context` IR + `piAiModels.stream` executor.
 *
 * See docs/NOMOV3.md. The design principle (per the project owner): reuse the
 * pieces that already exist and are tested —
 *
 *   - Outbound wire body: the native `AnthropicTransformer` /
 *     `ResponsesTransformer` already build the correct provider body (proven by
 *     the golden traces). We take that body as input.
 *   - Fingerprint/masking: `applyClaudeOAuthTransform` + `applyClaudeCodeMasking`
 *     (the exact two-step sequence `oauth-transformer.executeRequest` runs today
 *     in its `onPayload` hook) — these are input-agnostic and mask the native
 *     body just as well as they masked pi-ai's `buildParams()` output.
 *   - Inbound tool-name reversal: `reverseToolRenames` (v2 pairs) +
 *     `reverseRemapOAuthToolNamesFromStreamLine` (v1) operate on raw SSE frame
 *     text — no IR needed.
 *   - Token: pi-ai OAuth (`OAuthAuthManager.getApiKey`) — kept.
 *   - Registry: pi-ai builtin models give the real upstream baseUrl — kept.
 *
 * This module owns ONLY the wiring: native body + token → {url, headers, body,
 * reverseResponseFrame}. No pi-ai `Context`, no `piAiModels.stream`, no event
 * translation.
 */

import { getBuiltinModel } from '@earendil-works/pi-ai/providers/all';
import type { OAuthProvider } from '@earendil-works/pi-ai/oauth';
import { logger } from '../../utils/logger';
import { OAuthAuthManager } from './oauth-auth-manager';
import {
  applyClaudeOAuthTransform,
  canonicalizeOAuthToolName,
} from '../../transformers/oauth/oauth-claude';
import {
  applyClaudeCodeMasking,
  getStainlessHeaders,
  REQUIRED_BETAS,
  reverseToolRenames,
} from '../../transformers/oauth/masking';
import type { RenamePair } from '../../transformers/oauth/masking/types';

/**
 * Auth for a native Anthropic request. Two modes, mirroring the old executor:
 *   - `oauth`  → genuine Claude OAuth token, sent as `Authorization: Bearer`.
 *   - `apiKey` → the `useClaudeMasking` route: a real Anthropic API key sent as
 *     `x-api-key`, with the CC masking still applied (the old path forced this
 *     via a `sk-ant-oat-mask-` shim token so the masking's OAuth codepath ran).
 */
export type NativeAnthropicAuth =
  | { mode: 'oauth'; token: string }
  | { mode: 'apiKey'; apiKey: string };

export interface PreparedOAuthRequest {
  /** Fully-resolved upstream URL (real provider endpoint, not `oauth://`). */
  url: string;
  /** Final wire headers, including the resolved auth (Bearer or x-api-key). */
  headers: Record<string, string>;
  /** Masked/fingerprinted wire body, ready to POST. */
  body: any;
  /**
   * Reverses request-side tool-name renames on a single raw SSE frame (or a
   * full JSON body string). Identity when no renames were applied (e.g. an
   * already-Claude-Code client). Applied to raw upstream bytes on the way back
   * to the client — no IR.
   */
  reverseResponseFrame: (frame: string) => string;
}

/** Provider-level fallback base URLs for models not present in the registry. */
const OAUTH_PROVIDER_BASE_URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com',
};

/**
 * Resolve the real upstream base URL for an OAuth provider/model. Prefers the
 * pi-ai builtin registry (the same source `oauth-transformer` used via the
 * model's `baseUrl`), then falls back to the provider-level default so custom
 * or not-yet-registered model ids still resolve. Trailing slash stripped.
 */
function resolveOAuthBaseUrl(provider: OAuthProvider, modelId: string): string {
  const model = getBuiltinModel(provider as any, modelId);
  const baseUrl = (model as any)?.baseUrl || OAUTH_PROVIDER_BASE_URLS[provider];
  if (!baseUrl) {
    throw new Error(
      `OAuth: no baseUrl for provider '${provider}' model '${modelId}'. ` +
        `Cannot resolve upstream endpoint.`
    );
  }
  return String(baseUrl).replace(/\/$/, '');
}

/**
 * Prepare an Anthropic OAuth request from a native Anthropic `/v1/messages`
 * body. Applies the exact masking sequence `executeRequest` runs today, then
 * returns everything the standard fetch path needs.
 */
function prepareAnthropicOAuthRequest(
  modelId: string,
  auth: NativeAnthropicAuth,
  nativeBody: any,
  streaming: boolean
): PreparedOAuthRequest {
  // The token used to GATE masking (not necessarily the auth credential). For
  // the API-key masking route we force the masking's OAuth codepath with the
  // same `sk-ant-oat-mask-` shim the old executor used; the real key still goes
  // out as `x-api-key`.
  const maskingToken = auth.mode === 'oauth' ? auth.token : `sk-ant-oat-mask-${auth.apiKey}`;

  // Build the outbound Claude Code wire body. Two proven, shipped transforms
  // produce the exact fingerprinted body Anthropic expects:
  //   1. name canonicalization + system relocation (applyClaudeOAuthTransform)
  //   2. the full CC masking pipeline: shape-renames, synthetic tools, identity
  //      rebuild, metadata, CCH signing (applyClaudeCodeMasking)
  // We keep these verbatim for the body (verified byte-for-byte against a
  // canon-only variant, which drops the system relocation). We do NOT reuse
  // their internal rename bookkeeping for the response — see reversal below.
  const { payload: transformed } = applyClaudeOAuthTransform(nativeBody, maskingToken, {
    version: '2.1.63',
    entrypoint: 'cli',
    workload: '',
    oauthMode: true,
  });
  const payloadStr = typeof transformed === 'string' ? transformed : JSON.stringify(transformed);
  const { payload: maskedBody, toolRenamePairs } = applyClaudeCodeMasking(payloadStr);

  // The complete forward rename map for the CALLER's tools: original wire name
  // (what the client sent) -> final name on the outbound body (after both the
  // TitleCase canonicalization and the masking shape-renames). Built by
  // replaying the same name rules onto each caller tool name, so it captures
  // EVERY rename in one place regardless of which internal step produced it.
  // The response reversal is simply this map inverted — no per-mechanism
  // bookkeeping, no dependency on masking-internal flags.
  const callerToolNames: string[] = (Array.isArray(nativeBody?.tools) ? nativeBody.tools : [])
    .map((t: any) => t?.name)
    .filter((n: any): n is string => typeof n === 'string');

  const baseUrl = resolveOAuthBaseUrl('anthropic', modelId);
  const url = `${baseUrl}/v1/messages`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: streaming ? 'text/event-stream' : 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': REQUIRED_BETAS.join(','),
    ...getStainlessHeaders(),
    // Auth: OAuth → Bearer; masking-API-key → x-api-key (real Anthropic key).
    ...(auth.mode === 'oauth'
      ? { Authorization: `Bearer ${auth.token}` }
      : { 'x-api-key': auth.apiKey }),
  };

  return {
    url,
    headers,
    body: maskedBody,
    reverseResponseFrame: buildFrameReverser(callerToolNames, toolRenamePairs),
  };
}

/**
 * Build the response tool-name reversal from the caller's original tool names
 * and the masking rename pairs.
 *
 * Principle: whatever renames were applied to a caller tool on the way OUT, undo
 * exactly those on the way IN. We compute each caller tool's full forward chain
 * (original -> TitleCase-canonicalized -> masking-shape-renamed = the name that
 * actually went on the wire) and emit one reverse pair `[original, wireName]`.
 * `reverseToolRenames` then rewrites `"name":"<wireName>"` -> `"name":"<original>"`
 * in each raw SSE frame.
 *
 * This is a single map inverted — it never touches names the caller didn't send
 * (e.g. injected synthetic Claude Code tools), and it restores the caller's
 * EXACT original name (not a blind lowercase guess). Identity when no caller
 * tool was renamed.
 */
function buildFrameReverser(
  callerToolNames: readonly string[],
  maskingPairs: readonly RenamePair[]
): (frame: string) => string {
  // masking pairs map `preMaskName -> wireName`; index by the pre-mask name.
  const maskRename = new Map<string, string>(maskingPairs.map(([from, to]) => [from, to]));

  const reversePairs: RenamePair[] = [];
  for (const original of callerToolNames) {
    const canonical = canonicalizeOAuthToolName(original); // TitleCase step
    const wireName = maskRename.get(canonical) ?? canonical; // shape-rename step
    if (wireName !== original) {
      reversePairs.push([original, wireName]);
    }
  }

  if (reversePairs.length === 0) {
    return (frame) => frame;
  }
  return (frame) => reverseToolRenames(frame, reversePairs);
}

/**
 * Prepare a native OAuth request for the standard dispatch path.
 *
 * @param provider  OAuth provider id (currently `anthropic`).
 * @param modelId   Upstream model id.
 * @param apiKey    Resolved OAuth access token (from `OAuthAuthManager`).
 * @param nativeBody The provider-native wire body from the entry transformer.
 * @param streaming Whether the client asked for a stream.
 */
export function prepareOAuthNativeRequest(
  provider: OAuthProvider,
  modelId: string,
  auth: NativeAnthropicAuth,
  nativeBody: any,
  streaming: boolean
): PreparedOAuthRequest {
  if (provider === 'anthropic') {
    return prepareAnthropicOAuthRequest(modelId, auth, nativeBody, streaming);
  }
  // Other providers (Codex, Copilot) are not yet ported to the native path.
  // The caller gates on this; reaching here is a programming error.
  logger.error(`OAuth native path not implemented for provider '${provider}'`);
  throw new Error(`OAuth native request preparation not implemented for provider '${provider}'`);
}

/**
 * Whether an OAuth provider is served by the native (non-pi-ai-executor) path.
 * Currently only Anthropic; Codex/Copilot/etc. still use the pi-ai executor
 * until ported (per-provider rollout, see docs/NOMOV3.md).
 */
export function isNativeOAuthProvider(provider: string | undefined): boolean {
  return provider === 'anthropic';
}

/**
 * The provider-native wire API type for a native OAuth provider. An `oauth://`
 * URL makes `getProviderTypes()` report the synthetic `oauth` type, which would
 * (a) select pi-ai's `oauth` IR transformer and (b) defeat same-format
 * pass-through. Native OAuth instead flows through the STANDARD path using the
 * real upstream API type: Anthropic OAuth speaks the Messages API. Returns
 * undefined for providers not served by the native path (they keep `oauth`).
 */
const NATIVE_OAUTH_API_TYPES: Record<string, string> = {
  anthropic: 'messages',
};

export function nativeOAuthApiType(provider: string | undefined): string | undefined {
  return provider ? NATIVE_OAUTH_API_TYPES[provider] : undefined;
}

/**
 * Full async preparation for the native Anthropic dispatch. For OAuth routes,
 * resolves the token (with auto-refresh + DB write-back via OAuthAuthManager);
 * for the masking-API-key route, uses the configured key directly. Masks the
 * native body and builds the wire request for the standard dispatch seams.
 */
export async function prepareNativeOAuthDispatch(params: {
  provider: OAuthProvider;
  modelId: string;
  nativeBody: any;
  streaming: boolean;
  oauthAccountId?: string | null;
  /** When set, use the Claude-masking API-key mode instead of OAuth. */
  maskingApiKey?: string | null;
}): Promise<PreparedOAuthRequest> {
  const { provider, modelId, nativeBody, streaming, oauthAccountId, maskingApiKey } = params;

  let auth: NativeAnthropicAuth;
  if (maskingApiKey != null) {
    const key = maskingApiKey.trim();
    if (!key) {
      throw new Error(
        `OAuth: API key is not configured for Claude masking provider. ` +
          `Set the provider's api_key.`
      );
    }
    auth = { mode: 'apiKey', apiKey: key };
  } else {
    const token = await OAuthAuthManager.getInstance().getApiKey(provider, oauthAccountId);
    auth = { mode: 'oauth', token };
  }

  return prepareOAuthNativeRequest(provider, modelId, auth, nativeBody, streaming);
}

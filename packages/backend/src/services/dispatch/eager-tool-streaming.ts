import type { UnifiedChatRequest } from '../../types/unified';
import { getApiBaseType } from '../../utils/api-format';
import { isClaudeMaskingApiKeyRoute, isOAuthRoute } from '../oauth/oauth-dispatcher';
import type { RouteResult } from '../routing/router';
import { selectDispatchUrls } from './adapter-resolver';

/**
 * Whether this route's Messages request goes to Anthropic's own API: the one
 * upstream known to accept `eager_input_streaming` on tools.
 *
 * Native Anthropic routes (an `oauth://` provider for anthropic, or the
 * Claude-masking API-key route) always dispatch to Anthropic's base URL. Any
 * other provider qualifies only when the URL it dispatches to is on the host
 * anthropic.com or a subdomain of it, so proxies, resellers and other
 * Messages-compatible upstreams never do, even when they serve Claude.
 */
export function sendsToAnthropicApi(route: RouteResult, targetApiType: string): boolean {
  if (getApiBaseType(targetApiType) !== 'messages') return false;
  if (isClaudeMaskingApiKeyRoute(route, targetApiType)) return true;
  if (isOAuthRoute(route, targetApiType)) {
    return (route.config.oauth_provider || route.provider) === 'anthropic';
  }
  return selectDispatchUrls(route.config.api_base_url, targetApiType).some(isAnthropicApiUrl);
}

function isAnthropicApiUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host === 'anthropic.com' || host.endsWith('.anthropic.com');
  } catch {
    return false;
  }
}

/**
 * Opts a chat or responses client's tools into eager input streaming, on a
 * streaming request to Anthropic's own API only.
 *
 * Claude buffers a client tool's whole input server-side unless the tool sets
 * `eager_input_streaming`, then sends it in one burst, so a large tool call is
 * a minute or more of silence on the stream - long enough for clients' stall
 * watchdogs to give up. Messages clients choose this per tool themselves (and
 * keep it through `_anthropicExtras`); chat and responses clients cannot
 * express it. The payload is returned unchanged for non-streaming requests,
 * Messages clients, pass-through bodies and every other upstream; server tools
 * and tools that already set the option are left as they are.
 */
export function applyEagerToolInputStreaming(
  payload: any,
  request: UnifiedChatRequest,
  route: RouteResult,
  targetApiType: string,
  bypassTransformation: boolean
): any {
  if (
    bypassTransformation ||
    payload?.stream !== true ||
    !Array.isArray(payload?.tools) ||
    request.incomingApiType?.toLowerCase() === 'messages' ||
    !sendsToAnthropicApi(route, targetApiType)
  ) {
    return payload;
  }
  return {
    ...payload,
    tools: payload.tools.map((tool: any) =>
      (tool.type && tool.type !== 'custom') || tool.eager_input_streaming !== undefined
        ? tool
        : { ...tool, eager_input_streaming: true }
    ),
  };
}

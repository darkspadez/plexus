import type { ResolvedAdapter } from '../../types/provider-adapter';
import type { RouteResult } from '../routing/router';
import type { AdapterEntry } from '../../config';
import { ADAPTER_REGISTRY } from '../../transformers/adapters/index';
import { normalizeAnthropicToolIdsAdapter } from '../../transformers/adapters/normalize-anthropic-tool-ids.adapter';
import { stripUnsupportedToolSearchAdapter } from '../../transformers/adapters/strip-unsupported-tool-search.adapter';
import { suppressUnsupportedGpt5OptionsAdapter } from '../../transformers/adapters/suppress-unsupported-gpt5-options.adapter';
import { getApiBaseType } from '../../utils/api-format';
import { logger } from '../../utils/logger';

/**
 * Resolves the ordered list of ProviderAdapters for a given route.
 *
 * Resolution order:
 *   1. Implicit adapters automatically injected for the route's target
 *      provider (currently: tool-search stripping for `pi_ai_provider ===
 *      'openrouter'`), its model (GPT-5 option suppression) and its outbound
 *      wire format (Anthropic tool-id normalization for every route whose
 *      final wire type is Anthropic Messages). These run first so
 *      user-configured adapters see the cleaned-up payload if they inspect it.
 *   2. Provider-level `adapter` (applies to all models under the provider)
 *   3. Model-level `adapter`   (appended after provider-level adapters)
 *
 * An `{ name, enabled: false }` entry removes earlier instances of that adapter,
 * including implicit defaults. A later enabled entry restores it.
 *
 * Each entry is an { name, options } object. Unknown adapter names are logged
 * as warnings and skipped (rather than throwing) so that a misconfigured
 * adapter doesn't take down the whole route.
 *
 * Returns an empty array when no adapters are configured — zero-cost path.
 *
 * @param effectiveApiType Pass the FINAL outbound wire type — request-manager's
 *   `effectiveApiType`, NOT `targetApiType` (which can be 'oauth' or
 *   subtype-carrying). When omitted (e.g. legacy callers/tests), no
 *   format-scoped implicit adapters are injected.
 */
export function resolveAdapters(route: RouteResult, effectiveApiType?: string): ResolvedAdapter[] {
  const entries: AdapterEntry[] = [
    ...resolveImplicitAdapters(route, effectiveApiType),
    ...(route.config.adapter ?? []),
    ...(route.modelConfig?.adapter ?? []),
  ];

  if (entries.length === 0) return [];

  let resolved: ResolvedAdapter[] = [];
  for (const entry of entries) {
    if (entry.enabled === false) {
      resolved = resolved.filter((resolvedEntry) => resolvedEntry.adapter.name !== entry.name);
      continue;
    }
    const adapter = ADAPTER_REGISTRY[entry.name];
    if (!adapter) {
      logger.warn(
        `Unknown adapter '${entry.name}' configured for provider '${route.provider}' ` +
          `model '${route.model}' — skipping`
      );
      continue;
    }
    resolved.push({ adapter, options: entry.options });
  }

  return resolved;
}

/**
 * Adapters automatically injected for a route based on its target pi-ai
 * provider, its model id and its outbound wire format, independent of
 * user-configured adapters.
 *
 * The `pi_ai_provider === 'openrouter'` entry fires because OpenRouter's
 * Anthropic-compat /v1/messages endpoint only accepts a small subset of
 * Anthropic server-tool shorthands and rejects the rest with HTTP 400
 * "Unknown server-tool shorthand". We strip the unsupported ones (currently
 * `tool_search_tool_*`) so that messages<>messages pass-through and the
 * transformer-driven dispatch both end up with a body OpenRouter will accept.
 *
 * The format-scoped entry fires for every route whose FINAL outbound wire type
 * is Anthropic Messages (base type of `effectiveApiType`, so subtypes such as
 * `messages:<subtype>` are covered too). Anthropic — and every
 * Anthropic-compatible upstream — hard-400s on tool ids outside
 * `^[a-zA-Z0-9_-]+$`, and foreign ids reach an Anthropic-shaped body both
 * through the messages->messages pass-through and through cross-format
 * transforms, so the repair has to be wire-format-scoped rather than
 * provider-scoped. `effectiveApiType` (not `targetApiType`) is the only value
 * that reflects the real protocol for native-OAuth routes.
 *
 * Implicit adapters go through the same registry path as user-configured
 * adapters, so an unresolved name here would fail loudly rather than
 * silently no-op.
 */
function resolveImplicitAdapters(route: RouteResult, effectiveApiType?: string): AdapterEntry[] {
  const adapters: AdapterEntry[] = [];
  if (isGpt5Model(route.model)) {
    adapters.push({ name: suppressUnsupportedGpt5OptionsAdapter.name, options: {}, enabled: true });
  }
  if (route.config.pi_ai_provider === 'openrouter') {
    adapters.push({ name: stripUnsupportedToolSearchAdapter.name, options: {}, enabled: true });
  }
  if (effectiveApiType && getApiBaseType(effectiveApiType) === 'messages') {
    adapters.push({ name: normalizeAnthropicToolIdsAdapter.name, options: {}, enabled: true });
  }
  return adapters;
}

function isGpt5Model(model: string): boolean {
  // Matches bare ids ("gpt-5", "gpt-5.2", "gpt-5-mini") AND provider-prefixed
  // target ids ("openai/gpt-5.5") used by pi-ai-registry-backed targets (e.g.
  // an OpenLimits aggregator route). Must not match lookalikes like "gpt-55",
  // "chatgpt-5", or "my-gpt-5x".
  return /(?:^|\/)gpt-5(?:[.-]|$)/i.test(model);
}

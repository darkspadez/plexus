import type { UsageRecord } from '../../lib/api';
import { resolveApiFormat } from '../chips/ApiFormatChip';

/**
 * Outgoing API types produced exclusively by the inference-v2 (pi-ai native)
 * path — mirrors `@earendil-works/pi-ai`'s `KnownApi` union. A request whose
 * `outgoingApiType` is one of these was served natively through pi-ai, never
 * through the legacy dispatcher's translate/passthrough pipeline.
 */
export const INFERENCE_V2_OUTGOING_TYPES = new Set([
  'google-generative-ai',
  'openai-completions',
  'anthropic-messages',
  'openai-responses',
  // Added since the pre-redesign baseline (see pi-ai's `KnownApi` union in
  // @earendil-works/pi-ai/dist/types.d.ts) — all are outgoing-only, pi-ai
  // native wire formats.
  'azure-openai-responses',
  'openai-codex-responses',
  'bedrock-converse-stream',
  'google-vertex',
  'mistral-conversations',
  // Plexus's own custom-provider vocabulary (`PiAiApiEnum` in
  // packages/backend/src/config.ts) — applyCustomProvider stamps it into
  // piModel.api, which the executor records verbatim as outgoingApiType.
  // Its other members already appear above via the KnownApi union.
  'google-generative-ai-vertex',
]);

export type RoutePath = 'native' | 'passthrough' | 'translated';

/**
 * Classifies how a request reached its provider. Priority matches the
 * pre-redesign baseline: native beats passthrough beats translated.
 *  - 'native': outgoing api type is exclusive to the inference-v2/pi-ai path.
 *  - 'passthrough': the legacy dispatcher forwarded the client body unchanged.
 *  - 'translated': the legacy dispatcher transformed the request/response.
 */
export function getRoutePath(
  log: Pick<UsageRecord, 'incomingApiType' | 'outgoingApiType' | 'isPassthrough'>
): RoutePath {
  if (log.outgoingApiType && INFERENCE_V2_OUTGOING_TYPES.has(log.outgoingApiType)) {
    return 'native';
  }
  if (log.isPassthrough) {
    return 'passthrough';
  }
  return 'translated';
}

/**
 * True only when both sides are known AND resolve to different branded
 * `ApiFormat`s. E.g. incoming `messages` vs outgoing `anthropic-messages`
 * both resolve to `Anthropic` and are NOT a "differ", whereas incoming `chat`
 * vs outgoing `anthropic-messages` resolve to `OpenAI`/`Anthropic` and are —
 * this is what distinguishes a same-format pi-ai-native row (no chip pair)
 * from a genuine cross-format translation (chip pair shown).
 */
export function apiFormatsDiffer(
  incoming: string | undefined,
  outgoing: string | undefined
): boolean {
  if (!incoming || !outgoing) return false;
  return resolveApiFormat(incoming) !== resolveApiFormat(outgoing);
}

import { getConfig } from '../../config';
import { getApiBaseType } from '../../utils/api-format';

/**
 * Synthetic Claude Code auto-mode `safeguard_results` for translated
 * (non-native Messages) model aliases.
 *
 * When an inbound `/v1/messages` request carries `safeguards` but the alias
 * routes to a Responses/Chat/Gemini target, there is no upstream classifier
 * verdict to relay. With the alias-level `synthetic_safeguard_approval`
 * toggle enabled (opt-in, default off), Plexus answers with a synthetic
 * `evaluated`/`not_flagged` verdict per observed tool use plus an
 * `explanation` stating no real classifier ran — no evaluation is performed.
 */

export const SYNTHETIC_SAFEGUARD_EXPLANATION =
  'Synthetic Plexus approval; no classifier evaluation was performed.';

export const SYNTHETIC_SAFEGUARD_TYPE = 'dangerous_tool_use';

export function getRequestedSafeguardTypes(originalBody: unknown): string[] {
  if (!originalBody || typeof originalBody !== 'object') return [];
  const safeguards = (originalBody as { safeguards?: unknown }).safeguards;
  if (!Array.isArray(safeguards)) return [];
  return safeguards
    .filter(
      (entry): entry is { type: string } =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as { type?: unknown }).type === 'string'
    )
    .map((entry) => entry.type)
    .filter((type) => type.length > 0);
}

export function buildSyntheticSafeguardResults(
  toolIds: string[],
  requestedTypes: string[]
): Array<Record<string, unknown>> {
  const uniqueToolIds = [
    ...new Set(toolIds.filter((id) => typeof id === 'string' && id.length > 0)),
  ];
  const toolUses: Record<string, unknown> = {};
  for (const id of uniqueToolIds) {
    toolUses[id] = {
      type: 'evaluated',
      outcome: 'not_flagged',
      explanation: SYNTHETIC_SAFEGUARD_EXPLANATION,
    };
  }
  return requestedTypes.map((type) => ({
    type,
    status: {
      type: 'available',
      tool_uses: toolUses,
    },
  }));
}

export interface SafeguardSynthesisGate {
  incomingApiType?: string | null;
  originalBody?: unknown;
  aliasToggle?: boolean;
  outgoingApiType?: string | null;
  bypassTransformation?: boolean;
  hasClientError?: boolean;
  hasExistingResults?: boolean;
}

export function shouldSynthesizeSafeguards(gate: SafeguardSynthesisGate): boolean {
  if ((gate.incomingApiType ?? '').toLowerCase() !== 'messages') return false;
  if (!gate.aliasToggle) return false;
  if (gate.bypassTransformation) return false;
  if (gate.hasClientError) return false;
  if (gate.hasExistingResults) return false;
  // The outgoing target must be known and translated: a missing/empty type
  // means routing metadata was lost, so refuse to synthesize rather than
  // risk approving on an unverified path. Native Messages targets relay the
  // upstream verdict verbatim; never synthesize.
  if (typeof gate.outgoingApiType !== 'string' || gate.outgoingApiType.trim().length === 0)
    return false;
  if (getApiBaseType(gate.outgoingApiType) === 'messages') return false;
  return getRequestedSafeguardTypes(gate.originalBody).length > 0;
}

/** Resolve the alias-level toggle for a canonical alias name. Default off. */
export function resolveSyntheticSafeguardToggle(canonicalModel?: string | null): boolean {
  if (!canonicalModel) return false;
  try {
    return getConfig().models?.[canonicalModel]?.synthetic_safeguard_approval === true;
  } catch {
    return false;
  }
}

export function collectUnifiedToolIds(toolCalls: unknown): string[] {
  if (!Array.isArray(toolCalls)) return [];
  const ids: string[] = [];
  for (const call of toolCalls) {
    if (call && typeof call === 'object') {
      const id = (call as { id?: unknown }).id;
      if (typeof id === 'string' && id.length > 0 && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/**
 * Wrap a unified chunk stream so the terminal `finish_reason` chunk carries
 * synthetic `safeguard_results`. Tool IDs are collected from
 * `delta.tool_calls` as they pass through; error chunks never synthesize.
 */
export function wrapUnifiedStreamWithSyntheticSafeguards(
  stream: ReadableStream,
  requestedTypes: string[]
): ReadableStream {
  const toolIds: string[] = [];
  // Set once ANY chunk carries a real upstream `safeguard_results`: a later
  // terminal chunk without results must not overwrite it with synthesis.
  let seenRealResults = false;
  return stream.pipeThrough(
    new TransformStream({
      transform(chunk: unknown, controller) {
        if (chunk && typeof chunk === 'object') {
          const record = chunk as {
            event?: unknown;
            finish_reason?: unknown;
            delta?: { tool_calls?: Array<{ id?: unknown }> };
            safeguard_results?: unknown;
          };
          if (record.safeguard_results !== undefined) seenRealResults = true;
          for (const tc of record.delta?.tool_calls ?? []) {
            if (typeof tc?.id === 'string' && tc.id.length > 0 && !toolIds.includes(tc.id)) {
              toolIds.push(tc.id);
            }
          }
          if (
            !seenRealResults &&
            typeof record.finish_reason === 'string' &&
            record.finish_reason.length > 0 &&
            record.event !== 'error' &&
            record.safeguard_results === undefined
          ) {
            record.safeguard_results = buildSyntheticSafeguardResults(toolIds, requestedTypes);
          }
        }
        controller.enqueue(chunk);
      },
    })
  );
}

export function collectStreamToolIds(
  chunks: Array<{ delta?: { tool_calls?: Array<{ id?: unknown }> } }>
): string[] {
  const ids: string[] = [];
  for (const chunk of chunks) {
    for (const tc of chunk.delta?.tool_calls ?? []) {
      if (typeof tc?.id === 'string' && tc.id.length > 0 && !ids.includes(tc.id)) ids.push(tc.id);
    }
  }
  return ids;
}

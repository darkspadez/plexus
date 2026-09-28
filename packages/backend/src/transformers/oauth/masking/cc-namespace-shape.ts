/**
 * Non-Claude-Code tool namespace shape.
 *
 * Real Claude Code only ever sends two kinds of client tool name: a built-in
 * from `cc-reference-tools.ts`, or an MCP tool under
 * `mcp__<server>__<tool>`. Anything else bare identifies the caller as a
 * non-CC client, and Anthropic fingerprints those names — e.g. the bare Exa
 * MCP tool `web_search_exa`, which makes Anthropic classify an otherwise
 * perfectly masked request as third-party traffic and bill it to "extra
 * usage" (verified on staging: a masked body with `web_search_exa` returns
 * `400 You're out of extra usage`, while the same body with the tool renamed
 * returns 200).
 *
 * The previous `mcp-shape.ts` tried the opposite direction: cluster flat
 * `<server>_<tool>` names by their first underscore and rename clusters of
 * >= 4. That heuristic both false-negatives (`web_search_exa` is
 * `<tool>_<server>`, and `web` has only two members) and false-positives
 * (a large `get_*` cluster of non-MCP tools was rewritten to `mcp__get__…`).
 *
 * This shape inverts the rule to an allow-list: after `cc-collision-shape`
 * has claimed genuine CC names with a mismatched shape, every remaining tool
 * that is not a current real CC tool name and does not already begin with
 * `mcp__` is moved under the `mcp__client__` namespace. The failure mode is
 * deliberately asymmetric — a false rename (a current CC tool missing from
 * the reference table) is harmless because it just looks like an MCP tool,
 * while a false pass (a third-party name reaching Anthropic bare) is the
 * costly, fingerprintable case.
 *
 * Server-side tools (`type` other than `custom`/`function`/absent) are
 * skipped: their schemas are closed and renaming the declaration would break
 * them. See `cc-tools-server-tools.test.ts`.
 *
 * Purity matters: `buildToolRenamePairs` is a pure function of the tool list
 * so the same pairs can be recomputed for reverse-mapping the response.
 */

import { CC_TOOL_REFERENCE } from './cc-reference-tools';
import type { RenamePair, ToolDescriptor, ToolShape } from './types';

/** Synthetic MCP server every namespaced caller tool is filed under. */
export const NON_CC_TOOL_NAMESPACE = 'mcp__client__';

/** Anthropic accepts tool names up to 64 chars of `[A-Za-z0-9_-]`. */
const MAX_TOOL_NAME_LENGTH = 64;

const INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g;

/** A tool whose declaration is owned by Anthropic, not the caller. */
function isServerSideTool(tool: ToolDescriptor): boolean {
  const type = tool.type;
  if (typeof type !== 'string' || type.length === 0) return false;
  return type !== 'custom' && type !== 'function';
}

/**
 * Builds the namespaced form of `name` (single name, no collision context).
 * Used by `cc-collision-shape.ts` too, so every non-CC name in the pipeline
 * lands in one namespace.
 */
export function namespaceNonCcToolName(name: string): string {
  const maxBodyLength = MAX_TOOL_NAME_LENGTH - NON_CC_TOOL_NAMESPACE.length;
  const sanitized = name.replace(INVALID_NAME_CHARS, '_').slice(0, Math.max(1, maxBodyLength));
  return NON_CC_TOOL_NAMESPACE + (sanitized.length > 0 ? sanitized : 'tool');
}

export const ccNamespaceShape: ToolShape = {
  id: 'cc-namespace',
  detect(tools: readonly ToolDescriptor[]): RenamePair[] {
    const taken = new Set(tools.map((tool) => tool.name));
    const pairs: RenamePair[] = [];

    for (const tool of tools) {
      if (isServerSideTool(tool)) continue;
      if (Object.hasOwn(CC_TOOL_REFERENCE, tool.name)) continue;
      // Already in the `mcp__…` namespace (or malformed but prefixed) — leave
      // it alone rather than double-prefixing, which would desynchronize
      // `tools[].name` from `tool_reference` blocks in the history.
      if (tool.name.startsWith('mcp__')) continue;

      let renamed = namespaceNonCcToolName(tool.name);
      if (taken.has(renamed)) {
        let suffix = 2;
        while (taken.has(`${renamed}_${suffix}`)) suffix += 1;
        renamed = `${renamed}_${suffix}`;
      }
      taken.add(renamed);
      pairs.push([tool.name, renamed]);
    }

    return pairs;
  },
};

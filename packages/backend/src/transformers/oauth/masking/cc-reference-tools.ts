/**
 * Canonical reference of the CURRENT real Claude Code tool surface.
 *
 * Two consumers:
 *   1. `cc-collision-shape.ts` — renames a caller tool ONLY when its name
 *      collides with an entry below AND its required top-level parameters
 *      differ from that entry's (a lookalike that would otherwise mislead the
 *      model or collide as a duplicate name).
 *   2. `cc-namespace-shape.ts` — treats this table as the allow-list of names
 *      that may reach Anthropic bare. Every other caller tool name is moved
 *      into the `mcp__<server>__<tool>` namespace real Claude Code uses for
 *      non-built-in tools.
 *
 * Scope policy: this table tracks the CURRENT generation of Claude Code only.
 * The CLI's tool surface moves fast (it gained `DesignSync`, `Monitor`, the
 * task/agent-team family, etc.), and carrying entries from older captures
 * forward would let stale names reach Anthropic bare. A name that is missing
 * here is not a correctness problem: `cc-namespace-shape.ts` namespaces it,
 * which is the harmless direction (a genuinely-current CC tool we haven't
 * recorded yet just looks like an MCP tool; a third-party name never reaches
 * Anthropic un-namespaced). Erring toward "not listed" is the safe failure.
 *
 * The previous collision-only version approved a stale 2.1.207-style surface
 * and explicitly kept tools that a newer capture no longer showed. That is no
 * longer how this table is maintained.
 *
 * SOURCE: a genuine on-the-wire `claude-cli/2.1.283 (external, sdk-cli,
 * agent-sdk/0.3.246)` request capture (staging debug trace
 * 73a2ef7a-b3b1-4f3a-94ca-7fefa8157c41) — the session's full `tools[]` array
 * and each tool's `input_schema.required`. MCP tools in that capture
 * (`mcp__exa__…`) are intentionally omitted: they already carry the namespace
 * this table gates on. `WebSearch`/`WebFetch` are included even though the
 * capture does not contain them: both are current built-ins that a session
 * can disable (the capturing environment had them off) and that must pass
 * bare when enabled. A tool absent from a capture because it was disabled is
 * not evidence it was retired.
 * TO UPDATE: capture a current Claude Code session's request body and diff
 * its `tools[].name` / `tools[].input_schema.required` against this table,
 * replacing rather than extending entries — except for tools that are
 * feature-gated or disabled, which a single capture cannot rule out.
 */

/** Real CC tool name -> its required top-level input parameters (order-independent). */
export const CC_TOOL_REFERENCE: Readonly<Record<string, readonly string[]>> = {
  Agent: ['description', 'prompt'],
  Bash: ['command'],
  CronCreate: ['cron', 'prompt'],
  CronDelete: ['id'],
  CronList: [],
  DesignSync: ['method'],
  Edit: ['file_path', 'old_string', 'new_string'],
  EnterWorktree: [],
  ExitWorktree: ['action'],
  ListAgents: [],
  ListMcpResourcesTool: [],
  Monitor: ['description', 'timeout_ms'],
  NotebookEdit: ['notebook_path', 'new_source'],
  PushNotification: ['message', 'status'],
  Read: ['file_path'],
  ReadMcpResourceDirTool: ['server', 'uri'],
  ReadMcpResourceTool: ['server', 'uri'],
  ReportFindings: ['findings'],
  ScheduleWakeup: [],
  SendMessage: ['to', 'message'],
  Skill: ['skill'],
  TaskStop: [],
  WaitForMcpServers: [],
  WebFetch: ['url', 'prompt'],
  WebSearch: ['query'],
  Workflow: [],
  Write: ['file_path', 'content'],
};

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * True when `requiredParams` is exactly the same set as the reference tool's
 * required params (order-independent). Used to decide whether a name
 * collision is actually the same tool (no rename needed) or a lookalike
 * (needs disambiguation) — see `cc-collision-shape.ts`.
 *
 * JSON Schema omits `required` when every parameter is optional, which is
 * semantically equivalent to an empty required list (current Claude Code does
 * this for several of its tools).
 */
export function matchesReferenceShape(
  ccName: string,
  requiredParams: readonly string[] | undefined
): boolean {
  const reference = CC_TOOL_REFERENCE[ccName];
  if (!reference) return false;
  const a = sortedUnique(reference);
  const b = sortedUnique(requiredParams ?? []);
  return a.length === b.length && a.every((name, i) => name === b[i]);
}

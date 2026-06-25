/**
 * Cursor `agent.v1.AgentService` message encoders and decoders.
 *
 * Field numbers come from the reverse-engineered protocol spec (see the team
 * research plan). Cursor ships no public `.proto` for AgentService, so each
 * message is built directly from wire fields. This module is pure (no I/O) so
 * the encode/decode round-trips are unit-testable without a network.
 *
 * MVP scope: one streamed text turn. We encode UserMessage / RequestContext
 * (env only) / ModelDetails / RequestedModel, optional MCP tools, and decode
 * the InteractionUpdate text/usage/turn-ended events plus GetUsableModels.
 */

import {
  concatBytes,
  decodeString,
  encodeBoolField,
  encodeBytesField,
  encodeProtoValue,
  encodeStringField,
  encodeVarintField,
  findBytesField,
  findVarintField,
  parseProtoFields,
} from './proto';

/** Cursor agent interaction mode (UserMessage.mode enum). */
export enum CursorAgentMode {
  UNSPECIFIED = 0,
  AGENT = 1,
  ASK = 2,
  PLAN = 3,
  DEBUG = 4,
  TRIAGE = 5,
}

/** Cursor's MCP provider identifier used to namespace tool definitions. */
export const CURSOR_MCP_PROVIDER = 'cursor-tools';

/** An OpenAI-style tool definition, as carried by pi-ai contexts. */
export interface CursorToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

/** Environment block for RequestContext (field 4). */
export interface CursorEnv {
  os: string;
  cwd: string;
  shell: string;
  timezone: string;
}

/** Parameters for a single Run request. */
export interface CursorRunParams {
  text: string;
  messageId: string;
  conversationId: string;
  modelId: string;
  mode?: CursorAgentMode;
  env: CursorEnv;
  systemPrompt?: string;
  tools?: CursorToolDefinition[];
  maxMode?: boolean;
  modelParameters?: Array<{ id: string; value: string }>;
  /** Prior server checkpoint bytes for a resumed turn (empty on first turn). */
  checkpoint?: Uint8Array;
}

// ── RequestContext ────────────────────────────────────────────────────────────

/** Encode RequestContext.env (field 4): os, cwd, shell, tz. */
export function encodeRequestContextEnv(env: CursorEnv): Uint8Array {
  return concatBytes(
    encodeStringField(1, env.os),
    encodeStringField(2, env.cwd),
    encodeStringField(3, env.shell),
    encodeStringField(10, env.timezone),
    encodeStringField(11, env.cwd)
  );
}

/** Encode CursorRule.type = global (RuleType oneof field 1 = empty Global message). */
function encodeCursorRuleTypeGlobal(): Uint8Array {
  return encodeBytesField(1, new Uint8Array(0));
}

/**
 * Map a pi system prompt onto a Cursor "Rule" (Cursor has no hidden
 * --system-prompt for normal accounts; rules are the supported mechanism).
 * CursorRule = { 1=path, 2=content, 3=type{global}, 4=source USER(2) }.
 */
export function encodeCursorRule(content: string, cwd: string): Uint8Array {
  return concatBytes(
    encodeStringField(1, `${cwd}/.plexus/system-prompt.cursor-rule.md`),
    encodeStringField(2, content),
    encodeBytesField(3, encodeCursorRuleTypeGlobal()),
    encodeVarintField(4, 2)
  );
}

/** Encode an McpToolDefinition (field 7 of RequestContext / field 1 of mcp_tools). */
export function encodeMcpToolDefinition(
  tool: CursorToolDefinition,
  provider = CURSOR_MCP_PROVIDER
): Uint8Array {
  const schema = tool.parameters ?? { type: 'object', properties: {} };
  return concatBytes(
    encodeStringField(1, `${provider}-${tool.name}`),
    encodeStringField(2, tool.description ?? ''),
    encodeBytesField(3, encodeProtoValue(schema)),
    encodeStringField(4, provider),
    encodeStringField(5, tool.name)
  );
}

/** Encode mcp_instructions (field 14): { 1=providerId, 2=instructions }. */
function encodeMcpInstructions(provider: string, instructions: string): Uint8Array {
  return concatBytes(encodeStringField(1, provider), encodeStringField(2, instructions));
}

/**
 * Encode RequestContext. For an MVP text turn only `env` is required; the
 * system-prompt rule (fields 2/37/39) and tools (fields 7/14) are added when
 * present.
 */
export function encodeRequestContext(params: {
  env: CursorEnv;
  systemPrompt?: string;
  tools?: CursorToolDefinition[];
}): Uint8Array {
  const parts: Uint8Array[] = [encodeBytesField(4, encodeRequestContextEnv(params.env))];

  const systemPrompt = params.systemPrompt?.trim();
  if (systemPrompt) {
    const rule = encodeCursorRule(systemPrompt, params.env.cwd);
    parts.push(encodeBytesField(2, rule));
    parts.push(encodeBytesField(37, rule));
    parts.push(encodeBoolField(39, true));
  }

  const tools = params.tools ?? [];
  if (tools.length > 0) {
    for (const tool of tools) {
      parts.push(encodeBytesField(7, encodeMcpToolDefinition(tool)));
    }
    const descriptions = tools
      .map((t) => `- ${t.name}: ${t.description || 'No description'}`)
      .join('\n');
    const instructions = `You have access to the following tools:\n${descriptions}\n\nUse these tools when appropriate to help the user.`;
    parts.push(encodeBytesField(14, encodeMcpInstructions(CURSOR_MCP_PROVIDER, instructions)));
  }

  return concatBytes(...parts);
}

// ── ConversationAction / UserMessage ──────────────────────────────────────────

/** Encode UserMessage: { 1=text, 2=messageId, 4=mode }. */
export function encodeUserMessage(
  text: string,
  messageId: string,
  mode: CursorAgentMode
): Uint8Array {
  return concatBytes(
    encodeStringField(1, text),
    encodeStringField(2, messageId),
    encodeVarintField(4, mode)
  );
}

/** Encode UserMessageAction: { 1=UserMessage, 2=RequestContext }. */
export function encodeUserMessageAction(
  userMessage: Uint8Array,
  requestContext: Uint8Array
): Uint8Array {
  return concatBytes(encodeBytesField(1, userMessage), encodeBytesField(2, requestContext));
}

/** Encode ConversationAction for a normal user turn: field 1 = user_message_action. */
export function encodeConversationAction(userMessageAction: Uint8Array): Uint8Array {
  return encodeBytesField(1, userMessageAction);
}

/** Encode ConversationAction for a resumed turn: field 2 = resume_action{ 2=RequestContext }. */
export function encodeConversationActionResume(requestContext: Uint8Array): Uint8Array {
  return encodeBytesField(2, encodeBytesField(2, requestContext));
}

// ── ModelDetails / RequestedModel ─────────────────────────────────────────────

/** Encode ModelDetails: field 1 = modelId. */
export function encodeModelDetails(modelId: string): Uint8Array {
  return encodeStringField(1, modelId);
}

/** Encode RequestedModel: { 1=modelId, 2=maxMode?, 3=repeated parameter{1=id,2=value} }. */
export function encodeRequestedModel(
  modelId: string,
  maxMode = false,
  parameters: Array<{ id: string; value: string }> = []
): Uint8Array {
  const parts: Uint8Array[] = [encodeStringField(1, modelId)];
  if (maxMode) parts.push(encodeBoolField(2, true));
  for (const p of parameters) {
    parts.push(
      encodeBytesField(3, concatBytes(encodeStringField(1, p.id), encodeStringField(2, p.value)))
    );
  }
  return concatBytes(...parts);
}

/** Encode mcp_tools wrapper (AgentRunRequest field 4): repeated McpToolDefinition at field 1. */
function encodeMcpTools(tools: CursorToolDefinition[]): Uint8Array {
  return concatBytes(...tools.map((t) => encodeBytesField(1, encodeMcpToolDefinition(t))));
}

// ── AgentRunRequest / AgentClientMessage ──────────────────────────────────────

/**
 * Encode AgentRunRequest:
 *   1 = conversation_state / checkpoint (empty on first turn)
 *   2 = conversation_action
 *   3 = model_details
 *   4 = repeated mcp_tools (only when tools present)
 *   5 = conversation_id
 *   9 = requested_model
 * The mcp_file_system_options (field 6) is intentionally omitted for the MVP.
 */
export function encodeAgentRunRequest(input: {
  conversationAction: Uint8Array;
  modelDetails: Uint8Array;
  conversationId: string;
  requestedModel: Uint8Array;
  tools?: CursorToolDefinition[];
  checkpoint?: Uint8Array;
}): Uint8Array {
  const conversationState = input.checkpoint ?? new Uint8Array(0);
  const parts: Uint8Array[] = [
    encodeBytesField(1, conversationState),
    encodeBytesField(2, input.conversationAction),
    encodeBytesField(3, input.modelDetails),
  ];
  const tools = input.tools ?? [];
  if (tools.length > 0) parts.push(encodeBytesField(4, encodeMcpTools(tools)));
  parts.push(encodeStringField(5, input.conversationId));
  parts.push(encodeBytesField(9, input.requestedModel));
  return concatBytes(...parts);
}

/** Wrap an AgentRunRequest in an AgentClientMessage (field 1 = run_request). */
export function encodeAgentClientMessageRun(runRequest: Uint8Array): Uint8Array {
  return encodeBytesField(1, runRequest);
}

/** AgentClientMessage heartbeat (field 7 = empty message), sent every ~5s. */
export function encodeAgentClientHeartbeat(): Uint8Array {
  return encodeBytesField(7, new Uint8Array(0));
}

/**
 * Build the full AgentClientMessage{ run_request } payload for one turn.
 * The returned bytes are the protobuf body; the caller adds Connect framing.
 */
export function buildRunRequestMessage(params: CursorRunParams): Uint8Array {
  const requestContext = encodeRequestContext({
    env: params.env,
    systemPrompt: params.systemPrompt,
    tools: params.tools,
  });

  let conversationAction: Uint8Array;
  if (params.checkpoint && params.checkpoint.length > 0) {
    conversationAction = encodeConversationActionResume(requestContext);
  } else {
    const userMessage = encodeUserMessage(
      params.text,
      params.messageId,
      params.mode ?? CursorAgentMode.AGENT
    );
    conversationAction = encodeConversationAction(
      encodeUserMessageAction(userMessage, requestContext)
    );
  }

  const runRequest = encodeAgentRunRequest({
    conversationAction,
    modelDetails: encodeModelDetails(params.modelId),
    conversationId: params.conversationId,
    requestedModel: encodeRequestedModel(
      params.modelId,
      params.maxMode ?? false,
      params.modelParameters ?? []
    ),
    tools: params.tools,
    checkpoint: params.checkpoint,
  });

  return encodeAgentClientMessageRun(runRequest);
}

// ── BidiAppend (HTTP/1.1 send path) ───────────────────────────────────────────

/** Encode BidiRequestId: field 1 = request_id (string). */
export function encodeBidiRequestId(requestId: string): Uint8Array {
  return encodeStringField(1, requestId);
}

/**
 * Encode BidiAppendRequest used by the HTTP/1.1 fallback to push client frames:
 *   1 = data (hex-encoded AgentClientMessage bytes)
 *   2 = request_id (BidiRequestId)
 *   3 = append_seqno (int64)
 */
export function encodeBidiAppendRequest(
  dataHex: string,
  requestId: string,
  appendSeqno: bigint
): Uint8Array {
  return concatBytes(
    encodeStringField(1, dataHex),
    encodeBytesField(2, encodeBidiRequestId(requestId)),
    encodeVarintField(3, appendSeqno)
  );
}

// ── InteractionUpdate decoding ────────────────────────────────────────────────

/** Token usage carried by a turn-ended update. */
export interface CursorTurnUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** Parsed InteractionUpdate (the streamed render events we care about). */
export interface ParsedInteractionUpdate {
  /** Concatenated text from text_delta (f1.f1) and/or token_delta (f8.f1). */
  text: string;
  /** True when this update is a turn_ended (f14) — the completion signal. */
  turnEnded: boolean;
  /** True when this update is a heartbeat (f13). */
  heartbeat: boolean;
  usage?: CursorTurnUsage;
}

function parseTurnEndedUsage(buf: Uint8Array): CursorTurnUsage {
  const usage: CursorTurnUsage = {};
  for (const f of parseProtoFields(buf)) {
    if (typeof f.value !== 'bigint') continue;
    if (f.field === 1) usage.inputTokens = Number(f.value);
    else if (f.field === 2) usage.outputTokens = Number(f.value);
    else if (f.field === 3) usage.cacheReadTokens = Number(f.value);
    else if (f.field === 4) usage.cacheWriteTokens = Number(f.value);
  }
  return usage;
}

/**
 * Decode an InteractionUpdate body:
 *   1  = text_delta { 1 = text }
 *   8  = token_delta { 1 = text }
 *   13 = heartbeat
 *   14 = turn_ended { 1..4 = usage }
 */
export function parseInteractionUpdate(buf: Uint8Array): ParsedInteractionUpdate {
  let text = '';
  let turnEnded = false;
  let heartbeat = false;
  let usage: CursorTurnUsage | undefined;

  for (const f of parseProtoFields(buf)) {
    if (f.field === 1 && f.value instanceof Uint8Array) {
      const inner = findBytesField(parseProtoFields(f.value), 1);
      if (inner) text += decodeString(inner);
    } else if (f.field === 8 && f.value instanceof Uint8Array) {
      const inner = findBytesField(parseProtoFields(f.value), 1);
      if (inner) text += decodeString(inner);
    } else if (f.field === 13) {
      heartbeat = true;
    } else if (f.field === 14) {
      turnEnded = true;
      if (f.value instanceof Uint8Array) usage = parseTurnEndedUsage(f.value);
    }
  }

  return { text, turnEnded, heartbeat, usage };
}

/** A decoded event from one AgentServerMessage frame. */
export type CursorServerEvent =
  | { type: 'text'; text: string }
  | { type: 'usage'; usage: CursorTurnUsage }
  | { type: 'heartbeat' }
  | { type: 'checkpoint'; checkpoint: Uint8Array }
  | { type: 'turn_ended'; usage?: CursorTurnUsage };

/**
 * Decode an AgentServerMessage body into the high-level events the transport
 * surfaces. For the MVP we handle interaction_update (f1) and
 * conversation_checkpoint_update (f3); exec/kv/interaction-query frames are
 * ignored (no tools in the MVP path).
 */
export function parseAgentServerMessage(buf: Uint8Array): CursorServerEvent[] {
  const events: CursorServerEvent[] = [];
  for (const f of parseProtoFields(buf)) {
    if (f.field === 1 && f.value instanceof Uint8Array) {
      const update = parseInteractionUpdate(f.value);
      if (update.text) events.push({ type: 'text', text: update.text });
      if (update.heartbeat) events.push({ type: 'heartbeat' });
      if (update.usage) events.push({ type: 'usage', usage: update.usage });
      if (update.turnEnded) events.push({ type: 'turn_ended', usage: update.usage });
    } else if (f.field === 3 && f.value instanceof Uint8Array) {
      events.push({ type: 'checkpoint', checkpoint: f.value });
    }
  }
  return events;
}

// ── GetUsableModels decoding ──────────────────────────────────────────────────

/** A model entry decoded from GetUsableModels. */
export interface CursorModelDetails {
  id: string;
  displayName: string;
  reasoning: boolean;
  aliases: string[];
}

/**
 * Parse a single ModelDetails message:
 *   1 = id, 2 = (presence ⇒ reasoning), 3 = displayModelId,
 *   4 = displayName, 5 = displayNameShort, 6 = repeated alias.
 */
export function parseModelDetails(buf: Uint8Array): CursorModelDetails | undefined {
  let id = '';
  let displayModelId = '';
  let displayName = '';
  let displayNameShort = '';
  let reasoning = false;
  const aliases: string[] = [];

  for (const f of parseProtoFields(buf)) {
    if (!(f.value instanceof Uint8Array)) {
      if (f.field === 2) reasoning = true;
      continue;
    }
    if (f.field === 1) id = decodeString(f.value).trim();
    else if (f.field === 2) reasoning = true;
    else if (f.field === 3) displayModelId = decodeString(f.value).trim();
    else if (f.field === 4) displayName = decodeString(f.value).trim();
    else if (f.field === 5) displayNameShort = decodeString(f.value).trim();
    else if (f.field === 6) {
      const alias = decodeString(f.value).trim();
      if (alias) aliases.push(alias);
    }
  }

  if (!id) return undefined;
  const name = displayName || displayNameShort || displayModelId || aliases[0] || id;
  return { id, displayName: name, reasoning, aliases };
}

/** Parse GetUsableModelsResponse: repeated ModelDetails at field 1. */
export function parseGetUsableModelsResponse(buf: Uint8Array): CursorModelDetails[] {
  const models: CursorModelDetails[] = [];
  for (const f of parseProtoFields(buf)) {
    if (f.field !== 1 || !(f.value instanceof Uint8Array)) continue;
    const model = parseModelDetails(f.value);
    if (model) models.push(model);
  }
  return models;
}

/** Heuristic context window / max tokens from a model id (Cursor omits these). */
export function estimateModelLimits(id: string): { contextWindow: number; maxTokens: number } {
  const normalized = id.toLowerCase();
  if (normalized.includes('@1m') || normalized.includes('gemini-3.1')) {
    return { contextWindow: 1_000_000, maxTokens: 64_000 };
  }
  if (normalized.includes('codex') || normalized.includes('gpt')) {
    return { contextWindow: 272_000, maxTokens: 128_000 };
  }
  return { contextWindow: 200_000, maxTokens: 64_000 };
}

// Re-export decode helpers that callers (transport) need.
export { findVarintField };

import { describe, expect, it } from 'vitest';
import {
  concatBytes,
  decodeString,
  encodeBytesField,
  encodeStringField,
  encodeVarintField,
  findBytesField,
  findVarintField,
  parseProtoFields,
} from '../cursor-agent/proto';
import {
  buildRunRequestMessage,
  CursorAgentMode,
  encodeBidiAppendRequest,
  encodeRequestContext,
  encodeRequestContextEnv,
  estimateModelLimits,
  parseAgentServerMessage,
  parseGetUsableModelsResponse,
  parseInteractionUpdate,
  parseModelDetails,
  type CursorEnv,
  type CursorRunParams,
} from '../cursor-agent/messages';

const ENV: CursorEnv = {
  os: 'darwin v24',
  cwd: '/work/project',
  shell: '/bin/zsh',
  timezone: 'America/New_York',
};

function baseParams(overrides: Partial<CursorRunParams> = {}): CursorRunParams {
  return {
    text: 'hello there',
    messageId: 'msg-id-1',
    conversationId: 'conv-id-1',
    modelId: 'composer-2.5',
    mode: CursorAgentMode.AGENT,
    env: ENV,
    ...overrides,
  };
}

describe('cursor messages: RequestContext env', () => {
  it('encodes env fields 1/2/3/10/11', () => {
    const fields = parseProtoFields(encodeRequestContextEnv(ENV));
    expect(decodeString(findBytesField(fields, 1)!)).toBe(ENV.os);
    expect(decodeString(findBytesField(fields, 2)!)).toBe(ENV.cwd);
    expect(decodeString(findBytesField(fields, 3)!)).toBe(ENV.shell);
    expect(decodeString(findBytesField(fields, 10)!)).toBe(ENV.timezone);
    expect(decodeString(findBytesField(fields, 11)!)).toBe(ENV.cwd);
  });

  it('omits the system-prompt rule and tools when absent', () => {
    const fields = parseProtoFields(encodeRequestContext({ env: ENV }));
    expect(findBytesField(fields, 4)).toBeDefined(); // env present
    expect(findBytesField(fields, 2)).toBeUndefined(); // no rule
    expect(findBytesField(fields, 7)).toBeUndefined(); // no tools
  });

  it('adds the system-prompt rule (fields 2/37/39) when present', () => {
    const fields = parseProtoFields(
      encodeRequestContext({ env: ENV, systemPrompt: 'You are helpful.' })
    );
    expect(findBytesField(fields, 2)).toBeDefined();
    expect(findBytesField(fields, 37)).toBeDefined();
    expect(findVarintField(fields, 39)).toBe(1);

    const rule = parseProtoFields(findBytesField(fields, 2)!);
    expect(decodeString(findBytesField(rule, 2)!)).toBe('You are helpful.');
    expect(findVarintField(rule, 4)).toBe(2); // CursorRuleSource.USER
  });

  it('encodes MCP tools into RequestContext fields 7 and 14', () => {
    const fields = parseProtoFields(
      encodeRequestContext({
        env: ENV,
        tools: [{ name: 'read', description: 'read a file', parameters: { type: 'object' } }],
      })
    );
    const tool = parseProtoFields(findBytesField(fields, 7)!);
    expect(decodeString(findBytesField(tool, 1)!)).toBe('cursor-tools-read');
    expect(decodeString(findBytesField(tool, 4)!)).toBe('cursor-tools');
    expect(decodeString(findBytesField(tool, 5)!)).toBe('read');
    expect(findBytesField(fields, 14)).toBeDefined(); // mcp_instructions
  });
});

describe('cursor messages: AgentClientMessage round-trip', () => {
  it('wraps a run_request at field 1', () => {
    const message = buildRunRequestMessage(baseParams());
    const top = parseProtoFields(message);
    expect(top).toHaveLength(1);
    expect(top[0]?.field).toBe(1);
  });

  it('encodes the user turn shape end-to-end', () => {
    const message = buildRunRequestMessage(baseParams());
    const runRequest = parseProtoFields(findBytesField(parseProtoFields(message), 1)!);

    // field 1 = conversation_state (empty on first turn)
    expect((findBytesField(runRequest, 1) as Uint8Array).length).toBe(0);
    // field 5 = conversation_id
    expect(decodeString(findBytesField(runRequest, 5)!)).toBe('conv-id-1');

    // field 3 = model_details { 1 = modelId }
    const modelDetails = parseProtoFields(findBytesField(runRequest, 3)!);
    expect(decodeString(findBytesField(modelDetails, 1)!)).toBe('composer-2.5');

    // field 9 = requested_model { 1 = modelId }
    const requested = parseProtoFields(findBytesField(runRequest, 9)!);
    expect(decodeString(findBytesField(requested, 1)!)).toBe('composer-2.5');

    // field 2 = conversation_action -> field 1 = user_message_action
    const action = parseProtoFields(findBytesField(runRequest, 2)!);
    const userMessageAction = parseProtoFields(findBytesField(action, 1)!);
    const userMessage = parseProtoFields(findBytesField(userMessageAction, 1)!);
    expect(decodeString(findBytesField(userMessage, 1)!)).toBe('hello there');
    expect(decodeString(findBytesField(userMessage, 2)!)).toBe('msg-id-1');
    expect(findVarintField(userMessage, 4)).toBe(CursorAgentMode.AGENT);

    // user_message_action field 2 = request_context with env
    const requestContext = parseProtoFields(findBytesField(userMessageAction, 2)!);
    expect(findBytesField(requestContext, 4)).toBeDefined();
  });

  it('sets maxMode on the requested model when requested', () => {
    const message = buildRunRequestMessage(baseParams({ maxMode: true }));
    const runRequest = parseProtoFields(findBytesField(parseProtoFields(message), 1)!);
    const requested = parseProtoFields(findBytesField(runRequest, 9)!);
    expect(findVarintField(requested, 2)).toBe(1);
  });

  it('uses a resume action and carries the checkpoint when resuming', () => {
    const checkpoint = encodeStringField(1, 'checkpoint-blob');
    const message = buildRunRequestMessage(baseParams({ checkpoint }));
    const runRequest = parseProtoFields(findBytesField(parseProtoFields(message), 1)!);

    // field 1 = conversation_state echoes the checkpoint
    expect(Array.from(findBytesField(runRequest, 1) as Uint8Array)).toEqual(Array.from(checkpoint));

    // conversation_action -> field 2 = resume_action (not field 1 user_message_action)
    const action = parseProtoFields(findBytesField(runRequest, 2)!);
    expect(findBytesField(action, 2)).toBeDefined();
    expect(findBytesField(action, 1)).toBeUndefined();
  });

  it('adds mcp_tools (field 4) only when tools are present', () => {
    const without = buildRunRequestMessage(baseParams());
    const runWithout = parseProtoFields(findBytesField(parseProtoFields(without), 1)!);
    expect(findBytesField(runWithout, 4)).toBeUndefined();

    const withTools = buildRunRequestMessage(
      baseParams({ tools: [{ name: 'bash', description: 'run', parameters: { type: 'object' } }] })
    );
    const runWith = parseProtoFields(findBytesField(parseProtoFields(withTools), 1)!);
    const mcpTools = parseProtoFields(findBytesField(runWith, 4)!);
    const tool = parseProtoFields(findBytesField(mcpTools, 1)!);
    expect(decodeString(findBytesField(tool, 5)!)).toBe('bash');
  });
});

describe('cursor messages: BidiAppendRequest', () => {
  it('encodes data/request_id/seqno', () => {
    const fields = parseProtoFields(encodeBidiAppendRequest('deadbeef', 'req-1', 3n));
    expect(decodeString(findBytesField(fields, 1)!)).toBe('deadbeef');
    const requestId = parseProtoFields(findBytesField(fields, 2)!);
    expect(decodeString(findBytesField(requestId, 1)!)).toBe('req-1');
    expect(findVarintField(fields, 3)).toBe(3);
  });
});

describe('cursor messages: InteractionUpdate parsing', () => {
  function textDelta(text: string): Uint8Array {
    // InteractionUpdate field 1 = text_delta { 1 = text }
    return encodeBytesField(1, encodeStringField(1, text));
  }
  function tokenDelta(text: string): Uint8Array {
    // InteractionUpdate field 8 = token_delta { 1 = text }
    return encodeBytesField(8, encodeStringField(1, text));
  }

  it('extracts text from text_delta (field 1)', () => {
    const parsed = parseInteractionUpdate(textDelta('hello'));
    expect(parsed.text).toBe('hello');
    expect(parsed.turnEnded).toBe(false);
  });

  it('extracts text from token_delta (field 8)', () => {
    expect(parseInteractionUpdate(tokenDelta(' world')).text).toBe(' world');
  });

  it('detects heartbeat (field 13)', () => {
    const parsed = parseInteractionUpdate(encodeVarintField(13, 1));
    expect(parsed.heartbeat).toBe(true);
  });

  it('detects turn_ended (field 14) and reads usage', () => {
    const usage = concatBytes(
      encodeVarintField(1, 100),
      encodeVarintField(2, 50),
      encodeVarintField(3, 10),
      encodeVarintField(4, 5)
    );
    const parsed = parseInteractionUpdate(encodeBytesField(14, usage));
    expect(parsed.turnEnded).toBe(true);
    expect(parsed.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
    });
  });
});

describe('cursor messages: AgentServerMessage parsing', () => {
  it('surfaces text, checkpoint and turn_ended events in order', () => {
    const interactionText = encodeBytesField(1, encodeStringField(1, 'partial answer'));
    const textFrame = encodeBytesField(1, interactionText); // server msg field 1
    const checkpointFrame = encodeBytesField(3, encodeStringField(1, 'cp')); // field 3
    const turnEnded = encodeBytesField(1, encodeBytesField(14, new Uint8Array(0)));

    const events = parseAgentServerMessage(concatBytes(textFrame, checkpointFrame, turnEnded));
    const types = events.map((e) => e.type);
    expect(types).toContain('text');
    expect(types).toContain('checkpoint');
    expect(types).toContain('turn_ended');

    const textEvent = events.find((e) => e.type === 'text');
    expect(textEvent && textEvent.type === 'text' ? textEvent.text : '').toBe('partial answer');
  });
});

describe('cursor messages: GetUsableModels parsing', () => {
  function modelDetails(fields: Uint8Array): Uint8Array {
    return encodeBytesField(1, fields); // GetUsableModelsResponse repeated field 1
  }

  it('parses model id, display name, reasoning flag and aliases', () => {
    const details = concatBytes(
      encodeStringField(1, 'gpt-5.5-none'),
      encodeBytesField(2, new Uint8Array(0)), // presence ⇒ reasoning
      encodeStringField(4, 'GPT-5.5'),
      encodeStringField(6, 'gpt-5.5')
    );
    const model = parseModelDetails(details);
    expect(model).toBeDefined();
    expect(model!.id).toBe('gpt-5.5-none');
    expect(model!.displayName).toBe('GPT-5.5');
    expect(model!.reasoning).toBe(true);
    expect(model!.aliases).toContain('gpt-5.5');
  });

  it('falls back to displayNameShort / id for the name', () => {
    const model = parseModelDetails(encodeStringField(1, 'composer-2.5'));
    expect(model!.displayName).toBe('composer-2.5');
    expect(model!.reasoning).toBe(false);
  });

  it('returns undefined when the id is missing', () => {
    expect(parseModelDetails(encodeStringField(4, 'No Id'))).toBeUndefined();
  });

  it('parses a full response with multiple models', () => {
    const response = concatBytes(
      modelDetails(
        concatBytes(encodeStringField(1, 'composer-2.5'), encodeStringField(4, 'Composer 2.5'))
      ),
      modelDetails(
        concatBytes(encodeStringField(1, 'gpt-5.5-none'), encodeStringField(4, 'GPT-5.5'))
      )
    );
    const models = parseGetUsableModelsResponse(response);
    expect(models.map((m) => m.id)).toEqual(['composer-2.5', 'gpt-5.5-none']);
  });
});

describe('cursor messages: model limit heuristics', () => {
  it('uses 1M for gemini-3.1 and @1m ids', () => {
    expect(estimateModelLimits('gemini-3.1-pro').contextWindow).toBe(1_000_000);
    expect(estimateModelLimits('claude-opus@1m').contextWindow).toBe(1_000_000);
  });
  it('uses 272k for gpt/codex ids', () => {
    expect(estimateModelLimits('gpt-5.5-none').contextWindow).toBe(272_000);
    expect(estimateModelLimits('gpt-5.3-codex').contextWindow).toBe(272_000);
  });
  it('defaults to 200k otherwise', () => {
    expect(estimateModelLimits('composer-2.5').contextWindow).toBe(200_000);
  });
});

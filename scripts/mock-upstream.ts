/**
 * mock-upstream.ts
 *
 * Standalone Bun HTTP server that impersonates every upstream the Plexus dev
 * seed needs: OpenAI/Anthropic/Gemini-compatible LLM endpoints, provider
 * quota/balance JSON endpoints, and a minimal MCP server. Seeded dev
 * providers point at it; a live ticker drives real traffic through the
 * Plexus gateway to it.
 *
 * Dependency-free (Bun/Node built-ins only) and makes no runtime imports
 * from packages/backend — endpoint shapes below were verified by reading
 * backend transformer code, not guessed from memory (see task report).
 *
 * Usage:
 *   bun run mock-upstream
 *   PLEXUS_MOCK_PORT=25000 bun run mock-upstream
 */

import { basename } from 'node:path';

// ─── Port ──────────────────────────────────────────────────────────────────
// Same DJB2 hash as scripts/dev.ts, offset into 20000-29999 so it can never
// collide with dev's 10000-19999 range.

const dirName = basename(process.cwd());

function derivePort(): number {
  const override = process.env.PLEXUS_MOCK_PORT;
  if (override) {
    const parsed = Number(override);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  let hash = 5381;
  for (let i = 0; i < dirName.length; i++) {
    hash = (hash * 33) ^ dirName.charCodeAt(i);
  }
  return 20000 + (Math.abs(hash) % 10000);
}

const PORT = derivePort();

// ─── Small utilities ────────────────────────────────────────────────────────

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function pick<T>(items: readonly T[]): T {
  const item = items[randomInt(0, items.length - 1)];
  if (item === undefined) throw new Error('pick() called with an empty array');
  return item;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ~100-1200ms typical; ~10% of requests take 2-5s (keeps the dashboard concurrency gauge non-zero). */
function randomLatencyMs(): number {
  return Math.random() < 0.1 ? randomInt(2000, 5000) : randomInt(100, 1200);
}

/** Rough chars-per-token heuristic with jitter — good enough for a mock usage block. */
function estimateTokens(text: string): number {
  const base = Math.max(1, Math.round(text.length / 4));
  return Math.max(1, Math.round(base * randomFloat(0.85, 1.15)));
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function nowUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** ISO timestamp between `minMs` and `maxMs` from now — always generated at request time. */
function futureIso(minMs: number, maxMs: number): string {
  return new Date(Date.now() + randomInt(minMs, maxMs)).toISOString();
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/** Extracts joined text from unified-ish OpenAI/Anthropic message content (string or parts array). */
function extractMessageText(messages: unknown): string {
  if (!Array.isArray(messages)) return '';
  return messages
    .map((m) => {
      const content = (m as { content?: unknown } | null)?.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .map((part) =>
            typeof (part as { text?: unknown })?.text === 'string'
              ? (part as { text: string }).text
              : ''
          )
          .join(' ');
      }
      return '';
    })
    .join(' ');
}

/** Extracts joined text from Gemini `contents[].parts[].text`. */
function extractGeminiText(contents: unknown): string {
  if (!Array.isArray(contents)) return '';
  return contents
    .flatMap((c) => {
      const parts = (c as { parts?: unknown } | null)?.parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map((part) =>
      typeof (part as { text?: unknown })?.text === 'string' ? (part as { text: string }).text : ''
    )
    .join(' ');
}

// ─── Request-level error handling ──────────────────────────────────────────

type Family = 'openai' | 'anthropic' | 'gemini' | 'mcp';

class RequestError extends Error {
  readonly status: number;
  readonly family: Family;
  constructor(status: number, family: Family, message: string) {
    super(message);
    this.status = status;
    this.family = family;
  }
}

/** Provider-error-shaped JSON body per wire family. */
function buildErrorBody(
  family: 'openai' | 'anthropic' | 'gemini',
  message: string,
  status: number
) {
  if (family === 'anthropic') {
    return {
      type: 'error',
      error: { type: status === 529 ? 'overloaded_error' : 'api_error', message },
    };
  }
  if (family === 'gemini') {
    return {
      error: { code: status, message, status: status === 503 ? 'UNAVAILABLE' : 'INTERNAL' },
    };
  }
  return { error: { message, type: 'server_error', param: null, code: null } };
}

function buildErrorResponse(family: Family, message: string, status: number): Response {
  if (family === 'mcp') {
    return jsonResponse(status, { jsonrpc: '2.0', id: null, error: { code: -32700, message } });
  }
  return jsonResponse(status, buildErrorBody(family, message, status));
}

async function parseJsonBody(req: Request, family: Family): Promise<any> {
  try {
    return await req.json();
  } catch {
    throw new RequestError(400, family, 'Request body must be valid JSON.');
  }
}

// ─── Flaky-model behavior (applies to all LLM endpoints) ──────────────────
//
// Any request whose model name contains "flaky" has a ~30% chance of a
// provider-error response; a fraction of those failures are long stalls
// instead of a fast error. Math.random() is intentional — this simulates
// live upstream flakiness, not seed data.

const FLAKY_FAILURE_RATE = 0.3;
const FLAKY_STALL_RATE = 0.2; // fraction of failures that stall instead of failing fast

function pickErrorStatus(family: 'openai' | 'anthropic' | 'gemini'): number {
  if (family === 'anthropic') return pick([500, 529]);
  return pick([500, 503]);
}

/**
 * Applies latency jitter and, for flaky models, a chance of failure (or a
 * long stall). Returns a Response when the caller should fail fast/slow with
 * an error, or null when the caller should proceed normally.
 */
async function gateFlakinessAndLatency(
  modelId: string,
  family: 'openai' | 'anthropic' | 'gemini'
): Promise<Response | null> {
  const isFlaky = modelId.toLowerCase().includes('flaky');

  if (isFlaky && Math.random() < FLAKY_FAILURE_RATE) {
    const isStall = Math.random() < FLAKY_STALL_RATE;
    await sleep(isStall ? randomInt(6000, 12000) : randomLatencyMs());
    const status = pickErrorStatus(family);
    return buildErrorResponse(
      family,
      'The mock upstream simulated a provider failure for this flaky model.',
      status
    );
  }

  await sleep(randomLatencyMs());
  return null;
}

// ─── Models & canned content ────────────────────────────────────────────────

const MODEL_IDS = [
  'gpt-4o',
  'gpt-4o-mini',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'flaky-model-v1',
] as const;

const CANNED_SENTENCES = [
  "Here's a concise summary of what you asked for.",
  "I've reviewed the details and everything looks consistent.",
  "Sure, let's break this down step by step.",
  "That's a great question, here's how I'd approach it.",
  'Based on the available information, here is my recommendation.',
  "I've completed the requested task, let me know if you need adjustments.",
  'Here is the analysis you requested, along with a brief explanation.',
  "Understood, I'll proceed with that plan and report back.",
] as const;

// ─── OpenAI-compatible: chat completions, models, embeddings ───────────────

function buildOpenAiUsage(promptText: string, completionText: string) {
  const prompt_tokens = estimateTokens(promptText);
  const completion_tokens = estimateTokens(completionText);
  const cachedTokens = Math.random() < 0.25 ? Math.min(prompt_tokens, randomInt(64, 512)) : 0;
  return {
    prompt_tokens,
    completion_tokens,
    total_tokens: prompt_tokens + completion_tokens,
    prompt_tokens_details: { cached_tokens: cachedTokens },
  };
}

function streamOpenAiChatCompletion(
  id: string,
  created: number,
  model: string,
  promptText: string,
  completionText: string
): Response {
  const usage = buildOpenAiUsage(promptText, completionText);
  const words = completionText.split(' ');

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      send({
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
      });

      for (let i = 0; i < words.length; i++) {
        await sleep(randomInt(15, 60));
        send({
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [
            {
              index: 0,
              delta: { content: i === 0 ? words[i] : ' ' + words[i] },
              finish_reason: null,
            },
          ],
        });
      }

      send({
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      });
      send({ id, object: 'chat.completion.chunk', created, model, choices: [], usage });
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return sseResponse(stream);
}

async function handleChatCompletions(body: any): Promise<Response> {
  if (!body || typeof body.model !== 'string' || !Array.isArray(body.messages)) {
    throw new RequestError(
      400,
      'openai',
      'Request must include "model" (string) and "messages" (array).'
    );
  }

  const failure = await gateFlakinessAndLatency(body.model, 'openai');
  if (failure) return failure;

  const promptText = extractMessageText(body.messages);
  const completionText = pick(CANNED_SENTENCES);
  const id = 'chatcmpl-' + randomId();
  const created = nowUnixSeconds();

  if (body.stream) {
    return streamOpenAiChatCompletion(id, created, body.model, promptText, completionText);
  }

  return jsonResponse(200, {
    id,
    object: 'chat.completion',
    created,
    model: body.model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: completionText },
        finish_reason: 'stop',
        logprobs: null,
      },
    ],
    usage: buildOpenAiUsage(promptText, completionText),
  });
}

function handleModels(): Response {
  const created = nowUnixSeconds() - 3600;
  return jsonResponse(200, {
    object: 'list',
    data: MODEL_IDS.map((id) => ({ id, object: 'model', created, owned_by: 'plexus-mock' })),
  });
}

function randomEmbedding(dims: number): number[] {
  return Array.from({ length: dims }, () => Number((Math.random() * 2 - 1).toFixed(6)));
}

async function handleEmbeddings(body: any): Promise<Response> {
  const validInput = typeof body?.input === 'string' || Array.isArray(body?.input);
  if (!body || typeof body.model !== 'string' || !validInput) {
    throw new RequestError(
      400,
      'openai',
      'Request must include "model" and "input" (string or array).'
    );
  }

  const failure = await gateFlakinessAndLatency(body.model, 'openai');
  if (failure) return failure;

  const inputs: unknown[] = Array.isArray(body.input) ? body.input : [body.input];
  const data = inputs.map((_input, index) => ({
    object: 'embedding',
    index,
    embedding: randomEmbedding(32),
  }));
  const prompt_tokens = estimateTokens(inputs.map(String).join(' '));

  return jsonResponse(200, {
    object: 'list',
    data,
    model: body.model,
    usage: { prompt_tokens, total_tokens: prompt_tokens },
  });
}

// ─── Anthropic-compatible: messages ─────────────────────────────────────────

function buildAnthropicUsage(promptText: string, completionText: string) {
  const input_tokens = estimateTokens(promptText);
  const output_tokens = estimateTokens(completionText);
  const cacheRead = Math.random() < 0.25 ? randomInt(64, Math.max(64, input_tokens)) : 0;
  return {
    input_tokens,
    output_tokens,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: cacheRead,
  };
}

function streamAnthropicMessage(
  id: string,
  model: string,
  text: string,
  usage: ReturnType<typeof buildAnthropicUsage>
): Response {
  const words = text.split(' ');

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      send('message_start', {
        type: 'message_start',
        message: {
          id,
          type: 'message',
          role: 'assistant',
          model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: usage.input_tokens,
            cache_creation_input_tokens: usage.cache_creation_input_tokens,
            cache_read_input_tokens: usage.cache_read_input_tokens,
            output_tokens: 1,
          },
        },
      });

      send('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });

      for (let i = 0; i < words.length; i++) {
        await sleep(randomInt(15, 60));
        send('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: i === 0 ? words[i] : ' ' + words[i] },
        });
      }

      send('content_block_stop', { type: 'content_block_stop', index: 0 });
      send('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: usage.output_tokens },
      });
      send('message_stop', { type: 'message_stop' });
      controller.close();
    },
  });

  return sseResponse(stream);
}

async function handleMessages(body: any): Promise<Response> {
  if (!body || typeof body.model !== 'string' || !Array.isArray(body.messages)) {
    throw new RequestError(
      400,
      'anthropic',
      'Request must include "model" (string) and "messages" (array).'
    );
  }

  const failure = await gateFlakinessAndLatency(body.model, 'anthropic');
  if (failure) return failure;

  const systemText = typeof body.system === 'string' ? body.system : '';
  const promptText = extractMessageText(body.messages) + ' ' + systemText;
  const completionText = pick(CANNED_SENTENCES);
  const usage = buildAnthropicUsage(promptText, completionText);
  const id = 'msg_' + randomId();

  if (body.stream) {
    return streamAnthropicMessage(id, body.model, completionText, usage);
  }

  return jsonResponse(200, {
    id,
    type: 'message',
    role: 'assistant',
    model: body.model,
    content: [{ type: 'text', text: completionText }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage,
  });
}

// ─── Gemini-compatible: generateContent / streamGenerateContent ────────────
//
// Path shape verified against packages/backend/src/transformers/gemini/index.ts
// (GeminiTransformer.getEndpoint): `/v1beta/models/{model}:generateContent`
// or `/v1beta/models/{model}:streamGenerateContent?alt=sse`.

const GEMINI_PATH_RE =
  /^\/v1beta\/(?:models|tunedModels)\/([^/:]+):(generateContent|streamGenerateContent)$/;

function buildGeminiUsageMetadata(promptTokenCount: number, candidatesTokenCount: number) {
  const cachedContentTokenCount =
    Math.random() < 0.25 ? randomInt(16, Math.max(16, Math.floor(promptTokenCount * 0.3))) : 0;
  const usage: Record<string, number> = {
    promptTokenCount,
    candidatesTokenCount,
    totalTokenCount: promptTokenCount + candidatesTokenCount,
  };
  if (cachedContentTokenCount > 0) usage.cachedContentTokenCount = cachedContentTokenCount;
  return usage;
}

function streamGeminiContent(
  responseId: string,
  modelId: string,
  text: string,
  promptText: string
): Response {
  const words = text.split(' ');
  const promptTokenCount = estimateTokens(promptText);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let emitted = '';

      for (let i = 0; i < words.length; i++) {
        await sleep(randomInt(15, 60));
        const piece = i === 0 ? words[i] : ' ' + words[i];
        emitted += piece;
        const isLast = i === words.length - 1;

        send({
          candidates: [
            {
              content: { role: 'model', parts: [{ text: piece }] },
              index: 0,
              ...(isLast ? { finishReason: 'STOP' } : {}),
            },
          ],
          usageMetadata: buildGeminiUsageMetadata(promptTokenCount, estimateTokens(emitted)),
          modelVersion: modelId,
          responseId,
        });
      }

      // Real Gemini has no [DONE] sentinel — the stream simply ends.
      controller.close();
    },
  });

  return sseResponse(stream);
}

async function handleGemini(body: any, modelId: string, streaming: boolean): Promise<Response> {
  if (!body || !Array.isArray(body.contents)) {
    throw new RequestError(400, 'gemini', 'Request must include "contents" (array).');
  }

  const failure = await gateFlakinessAndLatency(modelId, 'gemini');
  if (failure) return failure;

  const systemText = body.systemInstruction ? extractGeminiText([body.systemInstruction]) : '';
  const promptText = extractGeminiText(body.contents) + ' ' + systemText;
  const completionText = pick(CANNED_SENTENCES);
  const responseId = randomId();

  if (streaming) {
    return streamGeminiContent(responseId, modelId, completionText, promptText);
  }

  const promptTokenCount = estimateTokens(promptText);
  const candidatesTokenCount = estimateTokens(completionText);

  return jsonResponse(200, {
    candidates: [
      {
        content: { role: 'model', parts: [{ text: completionText }] },
        finishReason: 'STOP',
        index: 0,
      },
    ],
    usageMetadata: buildGeminiUsageMetadata(promptTokenCount, candidatesTokenCount),
    modelVersion: modelId,
    responseId,
  });
}

// ─── Quota checker endpoints ────────────────────────────────────────────────
//
// GET /quota/:severity matches the synthetic checker's expected shape
// (packages/backend/src/services/quota/checkers/synthetic-checker.ts).
// Utilization bands (packages/backend/src/services/quota/checker-registry.ts
// deriveStatus): ok <75%, warning [75,90), critical [90,100), exhausted >=100.
// Fractions below sit well inside each band to survive rounding.

const VALID_SEVERITIES = ['ok', 'warning', 'critical', 'exhausted'] as const;

function handleQuota(severity: string): Response {
  if (!VALID_SEVERITIES.includes(severity as (typeof VALID_SEVERITIES)[number])) {
    return jsonResponse(404, {
      error: {
        message: `Unknown severity "${severity}". Use one of: ${VALID_SEVERITIES.join(', ')}.`,
        type: 'not_found',
      },
    });
  }

  // Re-roll a fresh jittered fraction per request within the tier's band so
  // repeated calls aren't perfectly identical, while staying in-band.
  const bands: Record<string, [number, number]> = {
    ok: [0.15, 0.5],
    warning: [0.78, 0.87],
    critical: [0.92, 0.97],
    exhausted: [1, 1],
  };
  const [lo, hi] = bands[severity] ?? [0.15, 0.5];
  const frac = randomFloat(lo, hi);

  const rollingMax = 1000;
  const rollingUsed = Math.round(rollingMax * frac);

  const hourlyLimit = 100;
  const hourlyUsed = Math.round(hourlyLimit * frac);

  const weeklyMax = 500;
  const weeklyRemaining = Math.max(0, weeklyMax * (1 - frac));

  return jsonResponse(200, {
    rollingFiveHourLimit: {
      nextTickAt: futureIso(10 * 60_000, 5 * 60 * 60_000),
      remaining: Math.max(0, rollingMax - rollingUsed),
      max: rollingMax,
    },
    search: {
      hourly: {
        limit: hourlyLimit,
        requests: hourlyUsed,
        remaining: Math.max(0, hourlyLimit - hourlyUsed),
        renewsAt: futureIso(60_000, 60 * 60_000),
      },
    },
    weeklyTokenLimit: {
      nextRegenAt: futureIso(60 * 60_000, 7 * 24 * 60 * 60_000),
      maxCredits: `$${weeklyMax.toFixed(2)}`,
      remainingCredits: `$${weeklyRemaining.toFixed(2)}`,
    },
  });
}

// ─── Balance-kind checker endpoint ──────────────────────────────────────────
//
// packages/backend/src/services/quota/checkers/hyper-checker.ts produces a
// `balance` meter (ctx.balance) AND its `endpoint` option is overridable
// (z.string().url().optional(), default https://hyper.charm.land/v1/credits).
// A seeded `hyper`-type checker pointed at this mock's /balance will report a
// real balance meter. Response shape: `{ balance: number }` (see report for
// other endpoint-overridable balance checkers found: naga, openrouter, poe,
// crof, moonshot, novita, cline, sakana, apertis, exedev, kilo, neuralwatt).

function handleBalance(): Response {
  return jsonResponse(200, { balance: Number(randomFloat(5, 500).toFixed(2)) });
}

// ─── MCP endpoint ────────────────────────────────────────────────────────────
//
// Minimal streamable-HTTP JSON-RPC 2.0 server. Plexus's remote_http MCP
// proxy (packages/backend/src/services/mcp-proxy/mcp-proxy-service.ts) is a
// transparent header/body forwarder: it does not require session state, and
// only treats a response as a stream when Content-Type is text/event-stream.
// Responding with plain JSON per request (no SSE, no session id) is the
// simplest shape the proxy allows and matches how Plexus's own /mcp/plexus
// route runs (sessionIdGenerator: undefined, stateless per-request).

const MCP_LATEST_PROTOCOL_VERSION = '2025-11-25';
const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
];

const MCP_TOOLS = [
  {
    name: 'echo',
    description: 'Echoes back the provided message.',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string', description: 'Text to echo back.' } },
      required: ['message'],
    },
  },
  {
    name: 'current_time',
    description: 'Returns the current server time in ISO-8601 format.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function callMcpTool(
  name: unknown,
  args: any
): { content: { type: string; text: string }[]; isError: boolean } {
  if (name === 'echo') {
    const message = typeof args?.message === 'string' ? args.message : '';
    return { content: [{ type: 'text', text: message }], isError: false };
  }
  if (name === 'current_time') {
    return { content: [{ type: 'text', text: new Date().toISOString() }], isError: false };
  }
  return { content: [{ type: 'text', text: `Unknown tool: ${String(name)}` }], isError: true };
}

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function handleMcp(req: Request): Promise<{ response: Response; jsonrpcMethod: string }> {
  const body = await parseJsonBody(req, 'mcp');

  const jsonrpc = body?.jsonrpc;
  const id = body?.id;
  const method = body?.method;
  const params = body?.params;
  const hasId = id !== undefined && id !== null;

  if (jsonrpc !== '2.0' || typeof method !== 'string') {
    return {
      response: jsonResponse(400, rpcError(hasId ? id : null, -32600, 'Invalid Request')),
      jsonrpcMethod: typeof method === 'string' ? method : '?',
    };
  }

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      const protocolVersion = MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : MCP_LATEST_PROTOCOL_VERSION;
      const result = {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'plexus-mock-upstream', version: '1.0.0' },
      };
      return { response: jsonResponse(200, rpcResult(id, result)), jsonrpcMethod: method };
    }

    case 'notifications/initialized':
      // Notification: server MUST accept with no JSON-RPC response body.
      return { response: new Response(null, { status: 202 }), jsonrpcMethod: method };

    case 'tools/list':
      return {
        response: jsonResponse(200, rpcResult(id, { tools: MCP_TOOLS })),
        jsonrpcMethod: method,
      };

    case 'tools/call': {
      const result = callMcpTool(params?.name, params?.arguments ?? {});
      return { response: jsonResponse(200, rpcResult(id, result)), jsonrpcMethod: method };
    }

    default:
      if (!hasId) {
        // Unknown notification — accept silently per JSON-RPC notification semantics.
        return { response: new Response(null, { status: 202 }), jsonrpcMethod: method };
      }
      return {
        response: jsonResponse(200, rpcError(id, -32601, `Method not found: ${method}`)),
        jsonrpcMethod: method,
      };
  }
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

const QUOTA_PATH_RE = /^\/quota\/([^/]+)$/;

const server = Bun.serve({
  port: PORT,
  idleTimeout: 120, // > the 6-12s flaky-stall ceiling, well under Bun's 255s cap
  async fetch(req) {
    const start = Date.now();
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method;
    let modelForLog = '-';
    let response: Response;

    try {
      if (method === 'POST' && pathname === '/v1/chat/completions') {
        const body = await parseJsonBody(req, 'openai');
        modelForLog = typeof body?.model === 'string' ? body.model : '-';
        response = await handleChatCompletions(body);
      } else if (method === 'GET' && pathname === '/v1/models') {
        response = handleModels();
      } else if (method === 'POST' && pathname === '/v1/embeddings') {
        const body = await parseJsonBody(req, 'openai');
        modelForLog = typeof body?.model === 'string' ? body.model : '-';
        response = await handleEmbeddings(body);
      } else if (method === 'POST' && pathname === '/v1/messages') {
        const body = await parseJsonBody(req, 'anthropic');
        modelForLog = typeof body?.model === 'string' ? body.model : '-';
        response = await handleMessages(body);
      } else if (method === 'POST' && GEMINI_PATH_RE.test(pathname)) {
        const match = pathname.match(GEMINI_PATH_RE);
        const modelId = match?.[1] ?? 'unknown-model';
        const action = match?.[2];
        modelForLog = modelId;
        const body = await parseJsonBody(req, 'gemini');
        response = await handleGemini(body, modelId, action === 'streamGenerateContent');
      } else if (method === 'GET' && QUOTA_PATH_RE.test(pathname)) {
        const match = pathname.match(QUOTA_PATH_RE);
        response = handleQuota(match?.[1] ?? '');
      } else if (method === 'GET' && pathname === '/balance') {
        response = handleBalance();
      } else if (method === 'POST' && pathname === '/mcp') {
        const result = await handleMcp(req);
        modelForLog = `mcp:${result.jsonrpcMethod}`;
        response = result.response;
      } else {
        response = jsonResponse(404, {
          error: { message: `Not found: ${method} ${pathname}`, type: 'not_found' },
        });
      }
    } catch (err) {
      if (err instanceof RequestError) {
        response = buildErrorResponse(err.family, err.message, err.status);
      } else {
        console.error('[mock-upstream] unhandled error:', err);
        response = jsonResponse(
          500,
          buildErrorBody('openai', 'Internal mock upstream error.', 500)
        );
      }
    }

    const ms = Date.now() - start;
    console.log(`${method} ${pathname} model=${modelForLog} status=${response.status} ${ms}ms`);
    return response;
  },
  error(err) {
    console.error('[mock-upstream] Bun.serve error:', err);
    return jsonResponse(500, buildErrorBody('openai', 'Internal mock upstream error.', 500));
  },
});

// ─── Startup banner ─────────────────────────────────────────────────────────

console.log(`Plexus mock upstream listening on http://localhost:${PORT}`);
console.log('');
console.log('Endpoints:');
console.log('  OpenAI-compatible:');
console.log('    POST /v1/chat/completions   (stream: true for SSE)');
console.log('    GET  /v1/models');
console.log('    POST /v1/embeddings');
console.log('  Anthropic-compatible:');
console.log('    POST /v1/messages           (stream: true for SSE)');
console.log('  Gemini-compatible:');
console.log('    POST /v1beta/models/:model:generateContent');
console.log('    POST /v1beta/models/:model:streamGenerateContent?alt=sse');
console.log('  Quota checkers:');
console.log('    GET  /quota/ok|warning|critical|exhausted   (synthetic-checker shape)');
console.log('    GET  /balance                                (hyper-checker balance shape)');
console.log('  MCP:');
console.log('    POST /mcp   (initialize, notifications/initialized, tools/list, tools/call)');
console.log('');
console.log(`Model ids served: ${MODEL_IDS.join(', ')}`);
console.log('Models with "flaky" in the name fail ~30% of the time (occasionally a long stall).');
console.log('');
console.log('Press Ctrl+C to stop.');

// ─── Clean shutdown ─────────────────────────────────────────────────────────

function shutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down mock upstream.`);
  server.stop(true);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

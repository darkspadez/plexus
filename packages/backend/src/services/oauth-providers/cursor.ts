/**
 * Cursor subscription OAuth provider + AgentService streaming adapter.
 *
 * Two halves:
 *   1. OAuth: browser `loginDeepControl` + poll, plus token refresh. No client
 *      id, no localhost callback server. Tokens are user-access JWTs (the same
 *      class the Cursor desktop app uses), NOT dashboard API keys.
 *   2. Streaming: `streamCursor` / `completeCursor` drive `CursorAgentTransport`
 *      and emit pi-ai `AssistantMessageEvent` objects of the SAME shape pi-ai's
 *      own stream yields, so the existing OAuth transformers/type-mappers
 *      consume them unchanged.
 *
 * IMPORTANT: this talks a non-public, reverse-engineered Cursor API. It can
 * break on Cursor client updates and may be against Cursor's terms of service.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { homedir, release } from 'node:os';
import type { Context, Model, Message } from '@earendil-works/pi-ai';
import type {
  OAuthCredentials,
  OAuthLoginCallbacks,
  OAuthProviderInterface,
} from '@earendil-works/pi-ai/oauth';
import { CursorAgentTransport, getCursorBaseUrl } from './cursor-agent/transport';
import {
  CursorAgentMode,
  estimateModelLimits,
  type CursorEnv,
  type CursorModelDetails,
  type CursorToolDefinition,
} from './cursor-agent/messages';
import { logger } from '../../utils/logger';

const PROVIDER_ID = 'cursor';
const PROVIDER_NAME = 'Cursor';
// pi-ai needs a non-empty `api` on the Model; we bypass pi-ai streaming via
// streamCursor, so this value is never dispatched through pi-ai's registry.
const CURSOR_API = 'cursor-direct';

const LOGIN_URL = 'https://cursor.com/loginDeepControl';
const POLL_PATH = '/auth/poll';
const REFRESH_PATH = '/auth/exchange_user_api_key';
const REFRESH_TIMEOUT_MS = 15_000;

const POLL_MAX_ATTEMPTS = 150;
const POLL_BASE_DELAY_MS = 1_000;
const POLL_MAX_DELAY_MS = 10_000;
const POLL_BACKOFF = 1.2;
const REFRESH_SKEW_MS = 5 * 60 * 1000;
const FALLBACK_EXPIRY_MS = 60 * 60 * 1000;

// ── Static fallback model list ────────────────────────────────────────────────
// Used until live discovery (GetUsableModels) succeeds. composer-2.5 is the
// Cursor default. Metadata is plausible; discovery overrides it post-login.

interface ModelSeed {
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
}

const STATIC_MODEL_SEEDS: ModelSeed[] = [
  {
    id: 'composer-2.5',
    name: 'Composer 2.5',
    reasoning: true,
    contextWindow: 200_000,
    maxTokens: 64_000,
  },
  {
    id: 'gpt-5.5-none',
    name: 'GPT-5.5',
    reasoning: true,
    contextWindow: 272_000,
    maxTokens: 128_000,
  },
  {
    id: 'claude-opus-4-8',
    name: 'Claude Opus 4.8',
    reasoning: true,
    contextWindow: 200_000,
    maxTokens: 128_000,
  },
];

function buildModel(seed: ModelSeed): Model<any> {
  return {
    id: seed.id,
    name: seed.name,
    api: CURSOR_API,
    provider: PROVIDER_ID,
    baseUrl: getCursorBaseUrl(),
    reasoning: seed.reasoning,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: seed.contextWindow,
    maxTokens: seed.maxTokens,
  };
}

function modelFromDetails(details: CursorModelDetails): Model<any> {
  const limits = estimateModelLimits(details.id);
  return buildModel({
    id: details.id,
    name: details.displayName || details.id,
    reasoning: cursorModelSupportsThinking(details.id, details.displayName, details.reasoning),
    contextWindow: limits.contextWindow,
    maxTokens: limits.maxTokens,
  });
}

/**
 * Cursor's AgentService often omits a thinking flag even for models it runs
 * with an internal reasoning budget, so keep thinking enabled unless the id /
 * name explicitly says non-reasoning.
 */
function cursorModelSupportsThinking(id: string, name = id, apiFlag = false): boolean {
  if (apiFlag) return true;
  const normalized = `${id} ${name}`.toLowerCase();
  if (normalized.includes('non-reasoning')) return false;
  return true;
}

const STATIC_MODELS: Model<any>[] = STATIC_MODEL_SEEDS.map(buildModel);
const STATIC_MODEL_INDEX = new Map(STATIC_MODELS.map((m) => [m.id, m]));

/** Look up a Cursor model by id from the static fallback list. */
export function getCursorModel(modelId: string): Model<any> | undefined {
  const direct = STATIC_MODEL_INDEX.get(modelId);
  if (direct) return direct;
  const normalized = normalizeCursorModelId(modelId);
  return STATIC_MODEL_INDEX.get(normalized);
}

/** The static fallback model list. */
export function listCursorModels(): Model<any>[] {
  return [...STATIC_MODELS];
}

/** Discover the models available to the subscription via GetUsableModels. */
export async function discoverCursorModels(accessToken: string): Promise<Model<any>[]> {
  const transport = new CursorAgentTransport({ accessToken });
  const details = await transport.getUsableModels();
  return details.map(modelFromDetails);
}

// ── Model id quirks ───────────────────────────────────────────────────────────

function normalizeCursorModelId(modelId?: string): string {
  const fallback = process.env.CURSOR_DEFAULT_MODEL || 'composer-2.5';
  if (!modelId || modelId === 'cursor' || modelId === 'auto') return fallback;
  // Cursor serves the ordinary GPT-5.5 alias under an explicit effort slug.
  if (modelId === 'gpt-5.5') return 'gpt-5.5-none';
  return modelId;
}

// ── OAuth: login / refresh ────────────────────────────────────────────────────

interface CursorPkce {
  verifier: string;
  challenge: string;
}

function createPkce(): CursorPkce {
  const verifier = randomBytes(96).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function buildLoginUrl(challenge: string, uuid: string): string {
  const params = new URLSearchParams({
    challenge,
    uuid,
    mode: 'login',
    redirectTarget: 'cli',
  });
  return `${LOGIN_URL}?${params.toString()}`;
}

/** Decode a JWT `exp` (seconds) into an expiry epoch ms, with a refresh skew. */
function jwtExpiry(token: string): number {
  try {
    const parts = token.split('.');
    const payloadSegment = parts[1];
    if (parts.length === 3 && payloadSegment) {
      const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as {
        exp?: unknown;
      };
      if (typeof payload.exp === 'number') return payload.exp * 1000 - REFRESH_SKEW_MS;
    }
  } catch {
    // Unparseable token — fall through to the fixed fallback.
  }
  return Date.now() + FALLBACK_EXPIRY_MS;
}

function looksLikeJwt(value: unknown): value is string {
  return typeof value === 'string' && value.split('.').length === 3;
}

function credentialsFromTokens(access: string, refresh: string): OAuthCredentials {
  return { access, refresh, expires: jwtExpiry(access) };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new Error('Cursor authorization cancelled.'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('Cursor authorization cancelled.'));
      },
      { once: true }
    );
  });
}

/**
 * Poll the Cursor auth endpoint until the browser login is approved.
 * HTTP 404 = pending; HTTP 200 JSON `{accessToken, refreshToken}` = approved.
 */
async function pollForTokens(
  uuid: string,
  verifier: string,
  signal?: AbortSignal,
  onProgress?: (message: string) => void
): Promise<{ accessToken: string; refreshToken: string }> {
  const pollUrl = `${getCursorBaseUrl()}${POLL_PATH}`;
  let delay = POLL_BASE_DELAY_MS;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    await sleep(delay, signal);
    const url = `${pollUrl}?${new URLSearchParams({ uuid, verifier }).toString()}`;
    const response = await fetch(url, signal ? { signal } : undefined);

    if (response.status === 404) {
      delay = Math.min(delay * POLL_BACKOFF, POLL_MAX_DELAY_MS);
      if (attempt % 5 === 0) onProgress?.('Still waiting for Cursor authorization...');
      continue;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Cursor authorization poll failed: HTTP ${response.status}${body ? ` ${body}` : ''}`
      );
    }

    const data = (await response.json()) as { accessToken?: string; refreshToken?: string };
    if (!data.accessToken || !data.refreshToken) {
      throw new Error('Cursor authorization did not return access and refresh tokens.');
    }
    return { accessToken: data.accessToken, refreshToken: data.refreshToken };
  }
  throw new Error('Timed out waiting for Cursor authorization.');
}

async function login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  callbacks.onProgress?.('Preparing Cursor browser authorization...');
  const pkce = createPkce();
  const uuid = randomUUID();

  callbacks.onAuth({
    url: buildLoginUrl(pkce.challenge, uuid),
    instructions: 'Approve in your browser — this completes automatically.',
  });

  callbacks.onProgress?.('Waiting for Cursor authorization...');
  const tokens = await pollForTokens(uuid, pkce.verifier, callbacks.signal, callbacks.onProgress);
  callbacks.onProgress?.('Cursor authorization complete.');
  return credentialsFromTokens(tokens.accessToken, tokens.refreshToken);
}

async function refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
  if (!credentials.refresh || !looksLikeJwt(credentials.access)) return credentials;
  if (credentials.expires && credentials.expires > Date.now() + REFRESH_SKEW_MS) {
    return credentials;
  }

  let response: Response;
  try {
    response = await fetch(`${getCursorBaseUrl()}${REFRESH_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.refresh}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `Cursor token refresh request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Cursor token refresh failed: HTTP ${response.status}${body ? ` ${body}` : ''}`
    );
  }

  const data = (await response.json()) as { accessToken?: string; refreshToken?: string };
  if (!data.accessToken) {
    throw new Error('Cursor token refresh did not return an access token.');
  }
  const refresh = looksLikeJwt(data.refreshToken) ? data.refreshToken : credentials.refresh;
  return credentialsFromTokens(data.accessToken, refresh);
}

/** The Cursor subscription OAuth provider. */
export const cursorOAuthProvider: OAuthProviderInterface = {
  id: PROVIDER_ID,
  name: PROVIDER_NAME,
  usesCallbackServer: false,
  login,
  refreshToken,
  getApiKey: (credentials: OAuthCredentials) => credentials.access,
  modifyModels: (models) => models,
};

// ── Streaming adapter (pi-ai AssistantMessageEvent shapes) ────────────────────

interface AssistantUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
}

function emptyUsage(): AssistantUsage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

/**
 * The partial assistant message pi-ai threads through every event. We build it
 * as a plain object matching pi-ai's `AssistantMessage` shape so the existing
 * type-mappers (which read `.content`, `.usage`, `.stopReason`, `.provider`,
 * `.model`, `.timestamp`) work unchanged.
 */
interface PartialAssistant {
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  api: string;
  provider: string;
  model: string;
  usage: AssistantUsage;
  stopReason: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';
  errorMessage?: string;
  timestamp: number;
}

function createPartial(model: Model<any>): PartialAssistant {
  return {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: emptyUsage(),
    stopReason: 'stop',
    timestamp: Date.now(),
  };
}

function applyUsage(
  partial: PartialAssistant,
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  }
): void {
  if (usage.inputTokens !== undefined) partial.usage.input = usage.inputTokens;
  if (usage.outputTokens !== undefined) partial.usage.output = usage.outputTokens;
  if (usage.cacheReadTokens !== undefined) partial.usage.cacheRead = usage.cacheReadTokens;
  if (usage.cacheWriteTokens !== undefined) partial.usage.cacheWrite = usage.cacheWriteTokens;
  partial.usage.totalTokens = partial.usage.input + partial.usage.output;
}

function blockToText(block: unknown): string {
  if (!block || typeof block !== 'object') return '';
  const b = block as Record<string, unknown>;
  if (b.type === 'text' && typeof b.text === 'string') return b.text;
  if (b.type === 'thinking' && typeof b.thinking === 'string') return b.thinking;
  return '';
}

function messageContentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(blockToText).filter(Boolean).join('\n');
  return '';
}

/**
 * Flatten a pi-ai Context into a single prompt string. Cursor's AgentService
 * takes one user message per turn; for multi-turn history we serialise the
 * transcript so the model has context (MVP: no native multi-message replay).
 */
function contextToPrompt(context: Context): string {
  const messages = context.messages;
  const last = messages[messages.length - 1];
  if (messages.length === 1 && last && last.role === 'user') {
    return messageContentToText(last.content);
  }

  const lines: string[] = [];
  for (const message of messages) {
    lines.push(serializeMessageLine(message));
  }
  if (last && last.role === 'toolResult') {
    lines.push('INSTRUCTION: Use the latest tool result above to answer the original request now.');
  }
  return lines.filter(Boolean).join('\n\n');
}

function serializeMessageLine(message: Message): string {
  if (message.role === 'user') return `USER: ${messageContentToText(message.content)}`;
  if (message.role === 'assistant') {
    return `ASSISTANT: ${message.content.map(blockToText).filter(Boolean).join('\n')}`;
  }
  const toolName = (message as { toolName?: string }).toolName ?? 'tool';
  return `TOOL RESULT (${toolName}): ${message.content.map(blockToText).filter(Boolean).join('\n')}`;
}

function detectOsString(): string {
  // RequestContext.env os string; Cursor accepts a "<platform> <release>" form.
  // Use the OS kernel release (e.g. "24.0.0"), not the JS runtime name.
  return `${process.platform} ${release()}`.trim() || process.platform;
}

function buildEnv(): CursorEnv {
  let timezone = 'UTC';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    // keep UTC
  }
  return {
    os: detectOsString(),
    cwd: process.cwd() || homedir(),
    shell: process.env.SHELL || '/bin/zsh',
    timezone,
  };
}

function contextToTools(context: Context): CursorToolDefinition[] | undefined {
  if (!context.tools || context.tools.length === 0) return undefined;
  return context.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: stripSymbolKeys(tool.parameters) as Record<string, unknown>,
  }));
}

/** Recursively drop symbol keys so a TypeBox schema JSON-serialises cleanly. */
function stripSymbolKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSymbolKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) out[key] = stripSymbolKeys(val);
    return out;
  }
  return value;
}

/** Options accepted by streamCursor/completeCursor. `apiKey` is the access JWT. */
export interface CursorStreamOptions {
  apiKey: string;
  signal?: AbortSignal;
  [key: string]: unknown;
}

/**
 * Stream a Cursor completion, yielding pi-ai `AssistantMessageEvent` objects of
 * the SAME shape pi-ai's stream yields (start / text_start / text_delta /
 * text_end / done / error). The OAuth transformer's `transformStream` and
 * `type-mappers` consume these unchanged.
 */
export async function* streamCursor(
  model: Model<any>,
  context: Context,
  options: CursorStreamOptions
): AsyncIterable<unknown> {
  const partial = createPartial(model);

  if (!options.apiKey) {
    partial.stopReason = 'error';
    partial.errorMessage = 'No Cursor OAuth token found.';
    yield { type: 'error', reason: 'error', error: partial };
    return;
  }
  if (options.signal?.aborted) {
    partial.stopReason = 'aborted';
    partial.errorMessage = 'Cursor request aborted.';
    yield { type: 'error', reason: 'aborted', error: partial };
    return;
  }

  yield { type: 'start', partial };

  const transport = new CursorAgentTransport({
    accessToken: options.apiKey,
    baseUrl: model.baseUrl || getCursorBaseUrl(),
  });

  const modelId = normalizeCursorModelId(model.id);
  const runParams = {
    text: contextToPrompt(context),
    messageId: randomUUID(),
    conversationId: randomUUID(),
    modelId,
    mode: CursorAgentMode.AGENT,
    env: buildEnv(),
    ...(context.systemPrompt?.trim() ? { systemPrompt: context.systemPrompt.trim() } : {}),
    ...(contextToTools(context) ? { tools: contextToTools(context) } : {}),
    maxMode: process.env.PI_CURSOR_MAX_MODE === '1',
  };

  let textIndex: number | undefined;
  let assistantText = '';
  // text_start must be emitted before the first text_delta; buffer it so we can
  // yield it inside the loop in order.
  let pendingStart:
    | { type: 'text_start'; contentIndex: number; partial: PartialAssistant }
    | undefined;

  const beginText = (): number => {
    if (textIndex === undefined) {
      partial.content.push({ type: 'text', text: '' });
      textIndex = partial.content.length - 1;
      pendingStart = { type: 'text_start', contentIndex: textIndex, partial };
    }
    return textIndex;
  };

  try {
    for await (const chunk of transport.streamRun(runParams, options.signal)) {
      if (options.signal?.aborted) {
        partial.stopReason = 'aborted';
        partial.errorMessage = 'Cursor request aborted.';
        yield { type: 'error', reason: 'aborted', error: partial };
        return;
      }

      if (chunk.type === 'text') {
        if (!chunk.content) continue;
        const index = beginText();
        if (pendingStart) {
          yield pendingStart;
          pendingStart = undefined;
        }
        assistantText += chunk.content;
        const block = partial.content[index];
        if (block && block.type === 'text') block.text += chunk.content;
        yield { type: 'text_delta', contentIndex: index, delta: chunk.content, partial };
      } else if (chunk.type === 'usage') {
        applyUsage(partial, chunk.usage);
      } else if (chunk.type === 'error') {
        partial.stopReason = options.signal?.aborted ? 'aborted' : 'error';
        partial.errorMessage = chunk.error;
        yield {
          type: 'error',
          reason: partial.stopReason === 'aborted' ? 'aborted' : 'error',
          error: partial,
        };
        return;
      } else if (chunk.type === 'done') {
        break;
      }
    }

    if (textIndex !== undefined) {
      const block = partial.content[textIndex];
      yield {
        type: 'text_end',
        contentIndex: textIndex,
        content: block && block.type === 'text' ? block.text : assistantText,
        partial,
      };
    }
    partial.stopReason = 'stop';
    yield { type: 'done', reason: 'stop', message: partial };
  } catch (error) {
    partial.stopReason = options.signal?.aborted ? 'aborted' : 'error';
    partial.errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      'Cursor: stream failed',
      error instanceof Error ? error : new Error(String(error))
    );
    yield {
      type: 'error',
      reason: partial.stopReason === 'aborted' ? 'aborted' : 'error',
      error: partial,
    };
  }
}

/**
 * Run a Cursor completion to completion, accumulating the stream into a single
 * pi-ai `AssistantMessage` (the same shape `transformResponse` consumes).
 */
export async function completeCursor(
  model: Model<any>,
  context: Context,
  options: CursorStreamOptions
): Promise<unknown> {
  let finalMessage: PartialAssistant | undefined;

  for await (const event of streamCursor(model, context, options)) {
    if (!event || typeof event !== 'object') continue;
    const e = event as { type?: string; message?: PartialAssistant; error?: PartialAssistant };
    if (e.type === 'done' && e.message) finalMessage = e.message;
    else if (e.type === 'error' && e.error) finalMessage = e.error;
  }

  if (!finalMessage) {
    const partial = createPartial(model);
    partial.stopReason = 'error';
    partial.errorMessage = 'Cursor produced no response.';
    return partial;
  }
  return finalMessage;
}

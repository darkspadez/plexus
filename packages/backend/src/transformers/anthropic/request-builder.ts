import { UnifiedChatRequest } from '../../types/unified';
import { convertUnifiedToolsToAnthropic } from './tool-mapper';

type AnthropicImageSource =
  | { type: 'base64'; media_type: string; data: string }
  | { type: 'url'; url: string };

const ANTHROPIC_IMAGE_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

class AnthropicImageValidationError extends Error {
  readonly routingContext = {
    statusCode: 400,
    code: 'invalid_image_source',
  } as const;

  constructor(message: string) {
    super(message);
    this.name = 'AnthropicImageValidationError';
  }
}

function invalidImageSource(
  message = 'Invalid Anthropic image source: expected a supported base64 image data URI, HTTPS URL, or raw base64 data'
): never {
  throw new AnthropicImageValidationError(message);
}

function isValidBase64(data: string): boolean {
  if (!data || data.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    return false;
  }

  const unpadded = data.replace(/=+$/, '');
  return Buffer.from(data, 'base64').toString('base64').replace(/=+$/, '') === unpadded;
}

/**
 * Converts a unified `image_url` part into an Anthropic image `source`.
 * Unified stores images as data URIs, HTTPS URLs, or raw base64 data;
 * the previous builder always emitted `data: ''`, which dropped every
 * screenshot on the chat/responses → messages path.
 */
export function toAnthropicImageSource(part: {
  image_url?: { url?: string };
  media_type?: string;
}): AnthropicImageSource {
  const value = part.image_url?.url;
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    return invalidImageSource();
  }

  if (/^data:/i.test(value)) {
    const match = /^data:([^;,]+);base64,(.+)$/is.exec(value);
    if (!match) return invalidImageSource();

    const mediaType = match[1]!.toLowerCase();
    const data = match[2]!;
    if (!ANTHROPIC_IMAGE_MEDIA_TYPES.has(mediaType) || !isValidBase64(data)) {
      return invalidImageSource();
    }

    return {
      type: 'base64',
      media_type: mediaType,
      data,
    };
  }

  if (/^http:\/\//i.test(value)) {
    return invalidImageSource('Anthropic image URLs must use HTTPS');
  }

  if (/^https:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:' || !parsed.hostname) return invalidImageSource();
    } catch {
      return invalidImageSource();
    }
    return { type: 'url', url: value };
  }

  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(value) || !isValidBase64(value)) {
    return invalidImageSource();
  }

  if (part.media_type !== undefined && typeof part.media_type !== 'string') {
    return invalidImageSource();
  }
  const mediaType = part.media_type === undefined ? 'image/jpeg' : part.media_type.toLowerCase();
  if (!ANTHROPIC_IMAGE_MEDIA_TYPES.has(mediaType)) return invalidImageSource();

  return {
    type: 'base64',
    media_type: mediaType,
    data: value,
  };
}

/**
 * Pulls a JSON Schema object from either the unified `response_format`
 * (Responses `text.format` / Chat `response_format`) or `text.format`.
 * Accepts both the unified shape (`json_schema` is the schema) and the
 * OpenAI Chat nested shape (`json_schema.schema` is the schema).
 */
export function jsonSchemaFromUnified(
  request: UnifiedChatRequest
): Record<string, unknown> | undefined {
  const responseFormat = request.response_format;
  if (
    responseFormat?.type === 'json_schema' &&
    responseFormat.json_schema &&
    typeof responseFormat.json_schema === 'object'
  ) {
    const nested = responseFormat.json_schema as Record<string, unknown>;
    // OpenAI Chat wraps the schema as { name, schema, strict }; unified /
    // Responses store the JSON Schema object directly on json_schema.
    const looksLikeOpenAiWrapper =
      nested.schema &&
      typeof nested.schema === 'object' &&
      (typeof nested.name === 'string' || typeof nested.strict === 'boolean');
    if (looksLikeOpenAiWrapper) {
      return nested.schema as Record<string, unknown>;
    }
    return nested;
  }

  const textFormat = request.text?.format;
  if (
    textFormat?.type === 'json_schema' &&
    textFormat.schema &&
    typeof textFormat.schema === 'object'
  ) {
    return textFormat.schema as Record<string, unknown>;
  }

  return undefined;
}

/**
 * Transforms a Unified request into Anthropic API format.
 *
 * Key transformations:
 * - System message extraction
 * - Message role normalization (tool -> user)
 * - Tool call reconstruction from unified format
 * - Message merging (consecutive messages with same role)
 */
export async function buildAnthropicRequest(request: UnifiedChatRequest): Promise<any> {
  let system: string | { type: string; text: string; cache_control?: unknown }[] | undefined;
  const messages: any[] = [];

  for (const msg of request.messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string') {
        system = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Filter out Claude Code-specific billing header blocks. These are only valid
        // for the pi-ai OAuth Claude Code path and must not be forwarded via the
        // translation path to upstream messages endpoints.
        const filteredBlocks = msg.content.filter(
          (block: any) =>
            !(
              block.type === 'text' &&
              typeof block.text === 'string' &&
              block.text.trimStart().startsWith('x-anthropic-billing-header:')
            )
        );
        if (filteredBlocks.length > 0) {
          system = filteredBlocks.map((block: any) => ({
            type: block.type as string,
            text: block.text as string,
            ...(block.cache_control !== undefined ? { cache_control: block.cache_control } : {}),
          }));
        }
      }
    } else if (msg.role === 'user' || msg.role === 'assistant') {
      const content: any[] = [];

      if (msg.thinking) {
        content.push({
          type: 'thinking',
          thinking: msg.thinking.content,
          signature: msg.thinking.signature,
        });
      }

      if (msg.content) {
        if (typeof msg.content === 'string') {
          content.push({ type: 'text', text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'text') {
              content.push({
                type: 'text',
                text: part.text,
                ...(part.cache_control !== undefined ? { cache_control: part.cache_control } : {}),
              });
            } else if (part.type === 'image_url') {
              const source = toAnthropicImageSource(part);
              content.push({
                type: 'image',
                source,
                ...(part.cache_control !== undefined ? { cache_control: part.cache_control } : {}),
              });
            }
          }
        }
      }

      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          });
        }
      }

      messages.push({ role: msg.role, content });
    } else if (msg.role === 'tool') {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.tool_call_id,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          },
        ],
      });
    }
  }

  // Merge consecutive messages of the same role
  // This is required by Anthropic API: can't have consecutive user or assistant messages
  const mergedMessages: any[] = [];
  for (const msg of messages) {
    if (mergedMessages.length > 0) {
      const last = mergedMessages[mergedMessages.length - 1];
      if (last.role === msg.role) {
        last.content.push(...msg.content);
        continue;
      }
    }
    mergedMessages.push(msg);
  }

  const payload: any = {
    model: request.model,
    messages: mergedMessages,
    system: system,
    max_tokens: request.max_tokens || 4096,
    temperature: request.temperature,
    stream: request.stream,
    tools: request.tools ? convertUnifiedToolsToAnthropic(request.tools) : undefined,
  };

  // For same-format (messages -> messages) requests, carry through Anthropic-native
  // top-level fields that the unified schema does not model. The unified schema
  // intentionally abstracts away provider-specific options (thinking config, output
  // config, metadata) so cross-format transforms don't drop them on the floor when
  // the client is talking the same API type as the upstream provider.
  if (request.incomingApiType?.toLowerCase() === 'messages' && request.originalBody) {
    const passthroughFields = [
      'thinking',
      'output_config',
      'output_format',
      'metadata',
      'tool_choice',
      'top_p',
      'top_k',
      'stop_sequences',
      'prompt_cache_key',
    ];
    for (const field of passthroughFields) {
      if (request.originalBody[field] !== undefined && payload[field] === undefined) {
        payload[field] = request.originalBody[field];
      }
    }
  }

  // Cross-format (Responses `text.format` / Chat `response_format`) → Anthropic
  // structured outputs. Same-format messages already carry `output_config` via
  // the passthrough above; only fill `format` when the client didn't send one.
  const schema = jsonSchemaFromUnified(request);
  if (schema && payload.output_config?.format === undefined) {
    payload.output_config = {
      ...(payload.output_config ?? {}),
      format: { type: 'json_schema', schema },
    };
  }

  return payload;
}

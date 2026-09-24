import { describe, expect, test } from 'vitest';
import { ProviderConfigSchema } from '../../../config';
import { AnthropicTransformer } from '../../../transformers/anthropic';
import { OpenAITransformer } from '../../../transformers/openai';
import type { RouteResult } from '../../routing/router';
import { buildRequestPayload } from '../request-payload-builder';

// Claude buffers a client tool's whole input unless the tool opts into eager
// streaming, so a chat client asking for a large tool call sees a minute or
// more of silence. Chat clients cannot express the per-tool option, so a
// streaming chat -> Anthropic request opts in for them.

const route = (api_base_url: string): RouteResult => ({
  provider: 'anthropic-direct',
  model: 'claude-sonnet-5',
  config: ProviderConfigSchema.parse({ api_base_url, api_key: 'test-key' }),
});

const chatBody = (stream: boolean) => ({
  model: 'claude-sonnet-5',
  stream,
  messages: [{ role: 'user', content: 'Write the homepage.' }],
  tools: [
    {
      type: 'function',
      function: {
        name: 'create_page',
        description: 'Create a WordPress page.',
        parameters: { type: 'object', properties: { content: { type: 'string' } } },
      },
    },
  ],
});

async function chatPayload(api_base_url: string, stream: boolean) {
  const body = chatBody(stream);
  const request = await new OpenAITransformer().parseRequest(body);
  request.incomingApiType = 'chat';
  request.originalBody = body;
  const { payload } = await buildRequestPayload(
    request,
    route(api_base_url),
    new AnthropicTransformer(),
    'messages'
  );
  return payload;
}

describe('eager tool input streaming on chat -> Anthropic', () => {
  test('streaming requests to Anthropic opt client tools in', async () => {
    const payload = await chatPayload('https://api.anthropic.com/v1', true);
    expect(payload.tools[0].eager_input_streaming).toBe(true);
  });

  test('non-streaming requests are left alone', async () => {
    const payload = await chatPayload('https://api.anthropic.com/v1', false);
    expect(payload.tools[0]).not.toHaveProperty('eager_input_streaming');
  });

  test('Messages-compatible endpoints that are not Anthropic are left alone', async () => {
    const payload = await chatPayload('https://llm-proxy.example.com/v1', true);
    expect(payload.tools[0]).not.toHaveProperty('eager_input_streaming');
  });

  test("a Messages client's own tool options pass through untouched", async () => {
    const body = {
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      stream: true,
      messages: [{ role: 'user', content: 'Write the homepage.' }],
      tools: [
        {
          name: 'create_page',
          description: 'Create a WordPress page.',
          input_schema: { type: 'object', properties: {} },
        },
      ],
    };
    const transformer = new AnthropicTransformer();
    const request = await transformer.parseRequest(body);
    request.incomingApiType = 'messages';
    request.originalBody = body;
    const { payload } = await buildRequestPayload(
      request,
      route('https://api.anthropic.com/v1'),
      transformer,
      'messages'
    );
    expect(payload.tools[0]).not.toHaveProperty('eager_input_streaming');
  });
});

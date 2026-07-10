import { describe, expect, test } from 'vitest';
import { ResponsesTransformer } from '../responses';

async function transformEvents(events: any[]): Promise<any[]> {
  const encoder = new TextEncoder();
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
        );
      }
      controller.close();
    },
  });

  const reader = new ResponsesTransformer().transformStream(source).getReader();
  const chunks: any[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}

describe('ResponsesTransformer stream transformation', () => {
  test('finishes with tool_calls after streaming a function call', async () => {
    const chunks = await transformEvents([
      {
        type: 'response.created',
        response: { id: 'resp_1', model: 'gpt-4o', created_at: 1234567890 },
      },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'function_call',
          call_id: 'call_1',
          name: 'get_date',
          arguments: '',
        },
      },
      {
        type: 'response.function_call_arguments.delta',
        output_index: 0,
        item_id: 'fc_1',
        delta: '{"timezone":"UTC"}',
      },
      {
        type: 'response.completed',
        response: { usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } },
      },
    ]);

    expect(chunks.find((chunk) => chunk.delta?.tool_calls)?.delta.tool_calls).toEqual([
      {
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'get_date', arguments: '' },
      },
    ]);
    expect(chunks.findLast((chunk) => chunk.finish_reason)?.finish_reason).toBe('tool_calls');
  });

  test('finishes with stop when no function call was streamed', async () => {
    const chunks = await transformEvents([
      {
        type: 'response.created',
        response: { id: 'resp_1', model: 'gpt-4o', created_at: 1234567890 },
      },
      { type: 'response.output_text.delta', delta: 'Done' },
      { type: 'response.completed', response: {} },
    ]);

    expect(chunks.findLast((chunk) => chunk.finish_reason)?.finish_reason).toBe('stop');
  });

  test('recognizes function calls present only in the completed response', async () => {
    const chunks = await transformEvents([
      {
        type: 'response.created',
        response: { id: 'resp_1', model: 'gpt-4o', created_at: 1234567890 },
      },
      {
        type: 'response.completed',
        response: { output: [{ type: 'function_call' }] },
      },
    ]);

    expect(chunks.findLast((chunk) => chunk.finish_reason)?.finish_reason).toBe('tool_calls');
  });
});

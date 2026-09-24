import { describe, expect, test } from 'vitest';
import { withEagerToolInputStreaming } from '../tool-mapper';

const clientTool = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  description: `${name} tool`,
  input_schema: { type: 'object', properties: {} },
  ...extra,
});

describe('withEagerToolInputStreaming', () => {
  test('opts every client tool into eager input streaming', () => {
    const tools = withEagerToolInputStreaming([clientTool('create_page'), clientTool('search')]);
    expect(tools.map((t: any) => t.eager_input_streaming)).toEqual([true, true]);
  });

  test('keeps a value the caller already chose', () => {
    const [tool] = withEagerToolInputStreaming([
      clientTool('create_page', { eager_input_streaming: false }),
    ]);
    expect(tool.eager_input_streaming).toBe(false);
  });

  test('covers explicitly typed custom tools but leaves server tools alone', () => {
    const webSearch = { type: 'web_search_20250305', name: 'web_search', max_uses: 3 };
    const tools = withEagerToolInputStreaming([
      clientTool('create_page', { type: 'custom' }),
      webSearch,
    ]);
    expect(tools[0].eager_input_streaming).toBe(true);
    expect(tools[1]).toEqual(webSearch);
  });

  test('does not mutate the tools it was given', () => {
    const original = clientTool('create_page');
    withEagerToolInputStreaming([original]);
    expect(original).not.toHaveProperty('eager_input_streaming');
  });
});

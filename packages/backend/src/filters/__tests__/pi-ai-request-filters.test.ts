import { describe, expect, it } from 'vitest';
import { filterPiAiRequestOptions } from '../pi-ai-request-filters';

describe('filterPiAiRequestOptions', () => {
  it.each([
    ['github-copilot', 'gpt-5.6-luna'],
    ['github-copilot', 'gpt-5.6-sol'],
    ['github-copilot', 'gpt-5.6-terra'],
    ['openai-codex', 'gpt-5.6-luna'],
    ['openai-codex', 'gpt-5.6-sol'],
    ['openai-codex', 'gpt-5.6-terra'],
  ])('strips temperature for %s %s', (provider, id) => {
    const result = filterPiAiRequestOptions({ temperature: 0.7, maxTokens: 256 }, {
      id,
      provider,
    } as any);

    expect(result).toEqual({
      filteredOptions: { maxTokens: 256 },
      strippedParameters: ['temperature'],
    });
  });

  it('does not apply a GPT-5.6 rule to the invalid bare Copilot model name', () => {
    const result = filterPiAiRequestOptions({ temperature: 0.7, maxTokens: 256 }, {
      id: 'gpt-5.6',
      provider: 'github-copilot',
    } as any);

    expect(result).toEqual({
      filteredOptions: { temperature: 0.7, maxTokens: 256 },
      strippedParameters: [],
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  applyPiAiProviderChange,
  isAutoCompatLocked,
} from '../../components/providers/ProviderAdvancedEditor';
import type { Provider } from '../../lib/api';

const baseProvider: Provider = {
  id: 'opencode-go',
  name: 'OpenCode Go',
  type: ['chat'],
  apiBaseUrl: 'https://opencode.ai/zen/go/v1',
  apiKey: 'test-key',
  enabled: true,
};

describe('pi-ai provider auto_compat guard', () => {
  it('forces auto_compat on when a pi-ai provider is set', () => {
    const next = applyPiAiProviderChange({ ...baseProvider, auto_compat: false }, 'opencode-go');
    expect(next.pi_ai_provider).toBe('opencode-go');
    expect(next.auto_compat).toBe(true);
  });

  it('leaves auto_compat untouched when the provider is cleared', () => {
    const next = applyPiAiProviderChange(
      { ...baseProvider, pi_ai_provider: 'opencode-go', auto_compat: false },
      ''
    );
    expect(next.pi_ai_provider).toBeUndefined();
    expect(next.auto_compat).toBe(false);
  });

  it('locks Auto Compat only while a provider is set', () => {
    expect(isAutoCompatLocked({ ...baseProvider, pi_ai_provider: 'opencode-go' })).toBe(true);
    expect(isAutoCompatLocked(baseProvider)).toBe(false);
  });
});

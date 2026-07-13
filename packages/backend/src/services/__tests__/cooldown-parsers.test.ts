import { describe, expect, test } from 'vitest';
import { CooldownParserRegistry } from '../runtime/cooldown-parsers';

describe('CooldownParserRegistry', () => {
  test('Returns null for unregistered provider type', () => {
    const result = CooldownParserRegistry.parseCooldown('unknown-provider', 'reset after 20s');
    expect(result).toBe(null);
  });
});

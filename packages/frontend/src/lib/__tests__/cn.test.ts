import { describe, expect, test } from 'vitest';
import { cn } from '../cn';

describe('cn', () => {
  test('keeps text-label alongside a text color', () => {
    expect(cn('text-label uppercase text-foreground-muted')).toBe(
      'text-label uppercase text-foreground-muted'
    );
  });

  test('treats text-label as a font size that later sizes override', () => {
    expect(cn('text-label', 'text-xs')).toBe('text-xs');
  });
});

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

  test('treats text-2xs and text-3xs as font sizes', () => {
    expect(cn('text-xs', 'text-2xs')).toBe('text-2xs');
    expect(cn('text-3xs', 'text-foreground-muted')).toBe('text-3xs text-foreground-muted');
  });

  test('lets caller radius override themed radius tiers', () => {
    expect(cn('rounded-selector', 'rounded-md')).toBe('rounded-md');
    expect(cn('rounded-field', 'rounded')).toBe('rounded');
    expect(cn('rounded-md', 'rounded-box')).toBe('rounded-box');
  });
});

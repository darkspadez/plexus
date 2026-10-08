import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBuiltinThemesCss, GENERATED_CSS_HEADER } from '../generated-css';

const file = readFileSync(join(__dirname, '../../styles/themes.generated.css'), 'utf8');

describe('themes.generated.css', () => {
  it('matches the generator output (run `bun run gen:themes` if this fails)', () => {
    expect(
      file === buildBuiltinThemesCss(),
      'themes.generated.css is stale: run `bun run gen:themes` in packages/frontend'
    ).toBe(true);
  });

  it('starts with the header and puts the plexus-dark fallback first', () => {
    expect(file.startsWith(GENERATED_CSS_HEADER)).toBe(true);
    const fallback = file.indexOf(':where(:root), [data-theme="plexus-dark"]');
    const light = file.indexOf('[data-theme="plexus-light"]');
    expect(fallback).toBeGreaterThan(-1);
    expect(light).toBeGreaterThan(fallback);
  });
});

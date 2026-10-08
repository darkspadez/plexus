import { describe, expect, it } from 'vitest';
import { CUSTOM_THEME_ID_RE, CustomThemeDefSchema } from '@plexus/shared';
import { BUILTIN_THEMES, PLEXUS_LIGHT } from '../builtin';
import {
  applyContentAuto,
  colorError,
  colorErrorsFor,
  derivedContentVar,
  normalizeRadius,
  seedFromTheme,
  seedNoteFor,
  setContentAuto,
  slugThemeId,
  withCurrentOption,
} from '../editor';

const fixed = (n: number) => () => n;
const cupcake = BUILTIN_THEMES.find((t) => t.id === 'cupcake')!;

describe('slugThemeId', () => {
  it('slugs the name and appends 4 random chars', () => {
    expect(slugThemeId('My Cool Theme!', fixed(0))).toBe('custom-my-cool-theme-aaaa');
  });

  it('cuts the slug to 30 characters without a trailing dash', () => {
    const id = slugThemeId('a'.repeat(29) + ' bbbbbb', fixed(0.999));
    expect(id).toBe(`custom-${'a'.repeat(29)}-9999`);
    expect(CUSTOM_THEME_ID_RE.test(id)).toBe(true);
  });

  it('falls back to "theme" for names with no latin letters', () => {
    expect(slugThemeId('日本語', fixed(0))).toBe('custom-theme-aaaa');
    expect(slugThemeId('   ', fixed(0))).toBe('custom-theme-aaaa');
  });

  it('regenerates on collision', () => {
    let n = 0;
    const rand = () => (n++ < 4 ? 0 : 0.5);
    const id = slugThemeId('x', rand, ['custom-x-aaaa']);
    expect(id).not.toBe('custom-x-aaaa');
    expect(id.startsWith('custom-x-')).toBe(true);
  });

  it('always matches the id regex', () => {
    for (const name of ['A', '--', 'Ünïcode name', 'x'.repeat(40)]) {
      expect(CUSTOM_THEME_ID_RE.test(slugThemeId(name))).toBe(true);
    }
  });
});

describe('seedFromTheme', () => {
  it('drops overrides, resets the id and keeps the look', () => {
    const seed = seedFromTheme(PLEXUS_LIGHT, 'Plexus Light copy');
    expect(seed).not.toHaveProperty('overrides');
    expect(seed.id).toBe('custom-draft');
    expect(seed.name).toBe('Plexus Light copy');
    expect(seed.colors).toEqual(PLEXUS_LIGHT.colors);
    expect(seed.radius).toEqual(PLEXUS_LIGHT.radius);
    expect(seed.border).toBe(PLEXUS_LIGHT.border);
    expect(seed.depth).toBe(PLEXUS_LIGHT.depth);
    expect(CustomThemeDefSchema.safeParse(seed).success).toBe(true);
  });

  it('copies rather than aliases and truncates the name', () => {
    const seed = seedFromTheme(cupcake, 'n'.repeat(60));
    expect(seed.name).toHaveLength(40);
    expect(seed.colors).not.toBe(cupcake.colors);
    expect(seed.radius).not.toBe(cupcake.radius);
  });
});

describe('seedNoteFor', () => {
  it('only notes themes that carry overrides', () => {
    expect(seedNoteFor(PLEXUS_LIGHT)).toContain('Plexus Light');
    expect(seedNoteFor(cupcake)).toBeUndefined();
  });
});

describe('setContentAuto', () => {
  const base = seedFromTheme(cupcake, 'x');

  it('removes the key when auto is on', () => {
    const withManual = setContentAuto(base, 'primary-content', false, '#123456');
    const out = setContentAuto(withManual, 'primary-content', true, '#ffffff');
    expect('primary-content' in out.colors).toBe(false);
  });

  it('seeds the derived value when auto is turned off', () => {
    const auto = setContentAuto(base, 'accent-content', true, '#000000');
    const out = setContentAuto(auto, 'accent-content', false, '#abcdef');
    expect(out.colors['accent-content']).toBe('#abcdef');
    expect(auto.colors['accent-content']).toBeUndefined();
  });

  it('does not mutate the draft', () => {
    const before = JSON.stringify(base);
    setContentAuto(base, 'info-content', true, '#000000');
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe('derivedContentVar', () => {
  it('maps error to danger', () => {
    expect(derivedContentVar('error-content')).toBe('danger-foreground');
    expect(derivedContentVar('primary-content')).toBe('primary-foreground');
    expect(derivedContentVar('neutral-content')).toBe('neutral-foreground');
  });
});

describe('colorError', () => {
  it('accepts hex and functional colors', () => {
    expect(colorError('#e11d48')).toBeUndefined();
    expect(colorError('oklch(60% 0.2 20)')).toBeUndefined();
    expect(colorError(' rgb(10 20 30) ')).toBeUndefined();
  });

  it('rejects junk and unparseable functional colors', () => {
    expect(colorError('notacolor')).toBeDefined();
    expect(colorError('')).toBeDefined();
    expect(colorError('hsl(foo)')).toBeDefined();
    expect(colorError('red; x')).toBeDefined();
  });
});

describe('colorErrorsFor / applyContentAuto', () => {
  const base = seedFromTheme(cupcake, 'x');
  const keys = ['primary', 'primary-content'];

  it('reports held invalid text over the draft value', () => {
    const errs = colorErrorsFor(base.colors, { 'primary-content': '#ff' }, keys);
    expect(Object.keys(errs)).toEqual(['primary-content']);
  });

  it('auto-on clears the held error', () => {
    const held = { 'primary-content': '#ff' };
    const out = applyContentAuto(base, held, 'primary-content', true, '#000000');
    expect('primary-content' in out.draft.colors).toBe(false);
    expect(out.held['primary-content']).toBeUndefined();
    expect(colorErrorsFor(out.draft.colors, out.held, keys)).toEqual({});
    expect(held['primary-content']).toBe('#ff');
  });

  it('auto-off seeds the derived hex with no error', () => {
    const out = applyContentAuto(
      base,
      { 'primary-content': '#ff' },
      'primary-content',
      false,
      '#abcdef'
    );
    expect(out.draft.colors['primary-content']).toBe('#abcdef');
    expect(colorErrorsFor(out.draft.colors, out.held, keys)).toEqual({});
  });
});

describe('withCurrentOption', () => {
  it('leaves preset values alone', () => {
    expect(withCurrentOption(['0', '1rem'], '1rem').map((o) => o.value)).toEqual(['0', '1rem']);
  });

  it('prepends a pressed "Current" option for a non-preset value', () => {
    const opts = withCurrentOption(['0', '1rem'], '0.75rem');
    expect(opts[0]).toEqual({ value: '0.75rem', label: 'Current (0.75rem)' });
    expect(opts).toHaveLength(3);
  });
});

describe('normalizeRadius', () => {
  it('maps 0rem to the 0 preset and leaves other values', () => {
    expect(normalizeRadius({ box: '0rem', field: '0.25rem', selector: '0rem' })).toEqual({
      box: '0',
      field: '0.25rem',
      selector: '0',
    });
  });

  it('is applied when seeding from a daisy theme with 0rem tiers', () => {
    const sharp = BUILTIN_THEMES.find((t) => t.radius.box === '0rem' && t.radius.field === '0rem')!;
    const seed = seedFromTheme(sharp, 'Sharp copy');
    expect(seed.radius.box).toBe('0');
    expect(seed.radius.field).toBe('0');
    expect(CustomThemeDefSchema.safeParse(seed).success).toBe(true);
  });
});

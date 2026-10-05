import { describe, expect, it } from 'vitest';
import {
  CustomThemeDefSchema,
  MAX_CUSTOM_THEMES,
  ThemeDefSchema,
  UiThemesLibrarySchema,
} from '@plexus/shared';

const validDef = () => ({
  id: 'test-light',
  name: 'Test Light',
  colorScheme: 'light' as const,
  colors: {
    'base-100': '#ffffff',
    'base-200': '#f2f2f2',
    'base-300': '#e5e5e5',
    'base-content': '#1f2937',
    primary: '#570df8',
    secondary: '#f000b8',
    accent: '#37cdbe',
    neutral: '#3d4451',
    info: '#3abff8',
    success: '#36d399',
    warning: '#fbbd23',
    error: '#f87272',
  } as Record<string, string>,
  radius: { box: '1rem', field: '0.5rem', selector: '0.5rem' },
  border: '1px' as const,
  depth: 1 as const,
});

const customDef = (id = 'custom-mine') => ({ ...validDef(), id });

describe('ThemeDefSchema', () => {
  it('parses a valid definition', () => {
    expect(ThemeDefSchema.safeParse(validDef()).success).toBe(true);
  });

  it('rejects a missing required color', () => {
    const def = validDef();
    delete def.colors['primary'];
    expect(ThemeDefSchema.safeParse(def).success).toBe(false);
  });

  it('treats content colors as optional', () => {
    const def = validDef();
    def.colors['primary-content'] = '#ffffff';
    expect(ThemeDefSchema.safeParse(def).success).toBe(true);
  });

  it.each(['red; } body { x', '#fff</style>', 'url(x)', 'rgb(0 0 0); x', "rgb('x')"])(
    'rejects CSS injection attempt %s',
    (bad) => {
      const def = validDef();
      def.colors['primary'] = bad;
      expect(ThemeDefSchema.safeParse(def).success).toBe(false);
    }
  );

  it('accepts rem radii and rejects px', () => {
    const ok = validDef();
    ok.radius.box = '2rem';
    expect(ThemeDefSchema.safeParse(ok).success).toBe(true);
    ok.radius.box = '0rem';
    expect(ThemeDefSchema.safeParse(ok).success).toBe(true);
    ok.radius.box = '0';
    expect(ThemeDefSchema.safeParse(ok).success).toBe(true);
    ok.radius.box = '2px';
    expect(ThemeDefSchema.safeParse(ok).success).toBe(false);
  });

  it('accepts modern color syntaxes and rejects malformed hex', () => {
    const accepted = ['rgb(217, 119, 6)', 'oklch(25.33% 0.016 252.42)', 'color(display-p3 1 0 0)'];
    for (const value of accepted) {
      const def = validDef();
      def.colors['accent'] = value;
      expect(ThemeDefSchema.safeParse(def).success).toBe(true);
    }
    const def = validDef();
    def.colors['accent'] = '#12345';
    expect(ThemeDefSchema.safeParse(def).success).toBe(false);
  });

  it('rejects unknown color keys', () => {
    const def = validDef();
    def.colors['bogus'] = '#000000';
    expect(ThemeDefSchema.safeParse(def).success).toBe(false);
  });
});

describe('CustomThemeDefSchema', () => {
  it('accepts custom- ids and rejects built-in style ids', () => {
    expect(CustomThemeDefSchema.safeParse(customDef()).success).toBe(true);
    expect(CustomThemeDefSchema.safeParse(customDef('plexus-dark')).success).toBe(false);
  });

  it('rejects overrides', () => {
    const def = { ...customDef(), overrides: { primary: '#000000' } };
    expect(CustomThemeDefSchema.safeParse(def).success).toBe(false);
  });
});

describe('UiThemesLibrarySchema', () => {
  it('parses a valid library', () => {
    const lib = { version: 1, themes: [customDef('custom-a'), customDef('custom-b')] };
    expect(UiThemesLibrarySchema.safeParse(lib).success).toBe(true);
  });

  it('rejects more than the maximum number of themes', () => {
    const themes = Array.from({ length: MAX_CUSTOM_THEMES + 1 }, (_, i) =>
      customDef(`custom-${i}`)
    );
    expect(UiThemesLibrarySchema.safeParse({ version: 1, themes }).success).toBe(false);
  });

  it('rejects duplicate ids', () => {
    const themes = [customDef('custom-a'), customDef('custom-a')];
    expect(UiThemesLibrarySchema.safeParse({ version: 1, themes }).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { ThemeDefSchema, type ThemeDef } from '@plexus/shared';
import { composite, contrast, deltaE, ensureContrast, parseColor, toHex } from '../color';
import { CHART_MIN_DELTA_E, COMPILED_TOKENS, compileTheme } from '../compile';

const ROLES = [
  'primary',
  'secondary',
  'accent',
  'neutral',
  'info',
  'success',
  'warning',
  'danger',
  'critical',
];

type DefInput = Omit<Partial<ThemeDef>, 'colors'> & { colors?: Partial<ThemeDef['colors']> };

function makeDef(overrides: DefInput = {}) {
  const { colors, ...rest } = overrides;
  return {
    id: 'synthetic',
    name: 'Synthetic',
    colorScheme: 'light',
    colors: {
      'base-100': '#ffffff',
      'base-200': '#f3f4f6',
      'base-300': '#e5e7eb',
      'base-content': '#1f2937',
      primary: '#2563eb',
      secondary: '#9333ea',
      accent: '#0d9488',
      neutral: '#374151',
      info: '#0284c7',
      success: '#16a34a',
      warning: '#d97706',
      error: '#dc2626',
      ...colors,
    },
    radius: { box: '0.5rem', field: '0.25rem', selector: '0.25rem' },
    border: '1px',
    depth: 1,
    ...rest,
  } as ThemeDef;
}

const darkDef = () =>
  makeDef({
    id: 'synthetic-dark',
    colorScheme: 'dark',
    colors: {
      'base-100': '#1d232a',
      'base-200': '#191e24',
      'base-300': '#15191e',
      'base-content': '#a6adbb',
      primary: '#605dff',
      secondary: '#f43098',
      accent: '#00d3bb',
      neutral: '#2a323c',
      info: '#00bafe',
      success: '#00d390',
      warning: '#fcb700',
      error: '#ff627d',
    },
  });

const lowContrastDef = () =>
  makeDef({
    id: 'low-contrast',
    colors: {
      'base-100': '#ffffff',
      'base-200': '#fafafa',
      'base-300': '#f0f0f0',
      'base-content': '#dddddd',
      primary: '#fff3a0',
      'primary-content': '#fffbd0',
    },
  });

const c = (hex: string) => parseColor(hex);

function expectContrastInvariants(def: ThemeDef) {
  const { vars } = compileTheme(def);
  const surface = c(vars['surface']);
  const background = c(vars['background']);
  for (const role of ROLES) {
    expect(
      contrast(c(vars[`${role}-foreground`]), c(vars[role])),
      `${role}-foreground`
    ).toBeGreaterThanOrEqual(4.5);
    for (const bg of [surface, background]) {
      expect(contrast(c(vars[`${role}-text`]), bg), `${role}-text`).toBeGreaterThanOrEqual(4.5);
    }
  }
  for (const bg of [surface, background]) {
    expect(contrast(c(vars['foreground']), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c(vars['foreground-muted']), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c(vars['foreground-subtle']), bg)).toBeGreaterThanOrEqual(3.0);
  }
}

describe('compileTheme contrast guarantees', () => {
  it('holds for a light theme', () => expectContrastInvariants(makeDef()));
  it('holds for a dark theme', () => expectContrastInvariants(darkDef()));

  it('holds for a deliberately low-contrast theme and reports diagnostics', () => {
    const def = lowContrastDef();
    expectContrastInvariants(def);
    const tokens = compileTheme(def).diagnostics.map((d) => d.token);
    expect(tokens).toContain('foreground');
    expect(tokens).toContain('primary-text');
    expect(tokens).toContain('primary-foreground');
    for (const d of compileTheme(def).diagnostics) expect(d.ratio).toBeLessThan(d.min);
  });

  it('emits no diagnostics for a comfortable theme', () => {
    expect(compileTheme(makeDef()).diagnostics.map((d) => d.token)).not.toContain('foreground');
  });
});

describe('compileTheme elevated and hover surfaces', () => {
  const plexusDarkLike = () =>
    makeDef({
      id: 'plexus-dark-like',
      colorScheme: 'dark',
      colors: {
        'base-100': '#16181D',
        'base-200': '#0A0B0E',
        'base-300': '#06070A',
        'base-content': '#E8EAED',
        neutral: '#8B8C8F',
      },
      overrides: { 'surface-elevated': '#1F2127', 'surface-hover': '#2C2F37' },
    });

  it('keeps neutral-text readable on a pinned hover surface and its tint', () => {
    const def = plexusDarkLike();
    const { vars } = compileTheme(def);
    const text = c(vars['neutral-text']);
    for (const bg of ['#1F2127', '#2C2F37']) {
      expect(contrast(text, c(bg)), bg).toBeGreaterThanOrEqual(4.5);
      const tinted = composite(c(vars['neutral']), 0.18, c(bg));
      expect(contrast(text, tinted), `tint over ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    // Without the extended fit the raw neutral sits well under 4.5 on hover.
    expect(contrast(c('#8B8C8F'), c('#2C2F37'))).toBeLessThan(4.5);
  });

  it('fits derived elevated and hover surfaces when they are not pinned', () => {
    const { vars } = compileTheme({ ...plexusDarkLike(), overrides: {} });
    for (const role of ROLES) {
      for (const bg of ['surface-elevated', 'surface-hover']) {
        expect(
          contrast(c(vars[`${role}-text`]), c(vars[bg])),
          `${role} on ${bg}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('compileTheme diagnostics basis', () => {
  it('never reports a ratio at or above min, even when hex quantization causes the adjustment', () => {
    // Find an input whose unquantized ratio passes but whose hex-quantized ratio fails.
    const white = c('#ffffff');
    let found: string | undefined;
    for (let hue = 0; hue < 360 && !found; hue += 5) {
      const at = (l: number) => `oklch(${l.toFixed(6)} 0.1 ${hue})`;
      // Bisect to the lightness where the raw ratio crosses 4.5, then scan just above it.
      let lo = 0.3;
      let hi = 0.8;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (contrast(c(at(mid)), white) >= 4.5) lo = mid;
        else hi = mid;
      }
      for (let i = 0; i < 300 && !found; i++) {
        const css = at(lo - i * 0.00001);
        if (contrast(c(css), white) >= 4.5 && contrast(c(toHex(c(css))), white) < 4.5) found = css;
      }
    }
    expect(found, 'search must find a quantization-sensitive color').toBeDefined();
    const out = compileTheme(
      makeDef({
        colors: {
          'base-100': '#ffffff',
          'base-200': '#ffffff',
          'base-300': '#ffffff',
          secondary: found,
        },
      })
    );
    const issue = out.diagnostics.find((d) => d.token === 'secondary-text');
    expect(issue).toBeDefined();
    for (const d of out.diagnostics) expect(d.ratio).toBeLessThan(d.min);
  });
});

describe('compileTheme output', () => {
  it('is deterministic', () => {
    expect(compileTheme(darkDef()).css).toBe(compileTheme(darkDef()).css);
  });

  it('emits every token in order with the expected css shape', () => {
    const out = compileTheme(makeDef());
    expect(Object.keys(out.vars)).toEqual([...COMPILED_TOKENS]);
    const lines = out.css.split('\n');
    expect(lines[0]).toBe('[data-theme="synthetic"] {');
    expect(lines[1]).toBe('  color-scheme: light;');
    expect(lines[2]).toBe(`  --surface: ${out.vars['surface']};`);
    expect(out.css.endsWith('}\n')).toBe(true);
    expect(lines).toHaveLength(COMPILED_TOKENS.length + 4);
  });

  it('uses a custom selector verbatim', () => {
    expect(compileTheme(makeDef(), { selector: ':root' }).css.startsWith(':root {\n')).toBe(true);
  });

  it('uses 0.12 subtle alpha for light and 0.18 for dark', () => {
    expect(compileTheme(makeDef()).vars['primary-subtle']).toBe('rgb(37 99 235 / 0.12)');
    expect(compileTheme(darkDef()).vars['primary-subtle']).toMatch(/ \/ 0\.18\)$/);
  });

  it('passes shape tokens through and uses a no-op elevation at depth 0', () => {
    const flat = compileTheme(makeDef({ depth: 0, border: '2px' }));
    expect(flat.vars['theme-radius-box']).toBe('0.5rem');
    expect(flat.vars['theme-border-width']).toBe('2px');
    expect(flat.vars['elevation-sm']).toBe('0 0 #0000');
    expect(flat.vars['elevation-md']).toBe('0 0 #0000');
    expect(flat.vars['elevation-lg']).toBe('0 0 #0000');
    expect(compileTheme(makeDef()).vars['elevation-lg']).toContain('rgb(20 18 14');
    expect(compileTheme(darkDef()).vars['elevation-lg']).toContain('rgb(0 0 0');
  });

  it('uses a provided content color when it already has enough contrast', () => {
    const out = compileTheme(makeDef({ colors: { 'primary-content': '#ffffff' } }));
    expect(out.vars['primary-foreground']).toBe('#ffffff');
  });

  it('sorts inverted bases so surface is lightest and sunken darkest', () => {
    const out = compileTheme(
      makeDef({
        colors: { 'base-100': '#202020', 'base-200': '#303030', 'base-300': '#404040' },
        colorScheme: 'dark',
      })
    );
    expect(out.vars['surface']).toBe('#404040');
    expect(out.vars['background']).toBe('#303030');
    expect(out.vars['surface-sunken']).toBe('#202020');
  });
});

describe('compileTheme overrides', () => {
  it('applies overrides last and drops their diagnostics', () => {
    const base = compileTheme(lowContrastDef());
    expect(base.diagnostics.map((d) => d.token)).toContain('primary-text');
    const out = compileTheme({
      ...lowContrastDef(),
      overrides: { 'primary-text': '#123456', 'elevation-sm': '0 0 0 1px rgb(0 0 0 / 0.1)' },
    });
    expect(out.vars['primary-text']).toBe('#123456');
    expect(out.vars['elevation-sm']).toBe('0 0 0 1px rgb(0 0 0 / 0.1)');
    expect(out.diagnostics.map((d) => d.token)).not.toContain('primary-text');
    expect(out.diagnostics.map((d) => d.token)).toContain('foreground');
  });

  it('throws on unknown override tokens', () => {
    expect(() => compileTheme({ ...makeDef(), overrides: { nope: '#000000' } })).toThrow(
      'Unknown theme override token: nope'
    );
  });

  it('throws on unparseable colors', () => {
    const def = makeDef({ colors: { primary: 'bogus' } });
    expect(() => compileTheme(def)).toThrow('Unparseable color "bogus" for primary');
  });
});

describe('compileTheme charts', () => {
  it('replaces a duplicate series with a fallback color', () => {
    const def = makeDef({ colors: { primary: '#2563eb', secondary: '#2563eb' } });
    const { vars } = compileTheme(def);
    expect(vars['chart-2']).not.toBe(vars['chart-1']);
    // Fallback candidates are contrast-fitted against the surface before use.
    const surface = c(vars['surface']);
    const fallbacks = [
      vars['success'],
      vars['warning'],
      vars['danger'],
      vars['foreground-subtle'],
    ].map((hex) => toHex(ensureContrast(c(hex), [surface], 3.0).color));
    expect(fallbacks).toContain(vars['chart-2']);
    expect(vars['chart-2']).not.toBe(vars['chart-3']);
  });

  it('keeps series distinct by the delta-E threshold', () => {
    const { vars } = compileTheme(makeDef());
    expect(CHART_MIN_DELTA_E).toBe(0.08);
    const set = new Set([1, 2, 3, 4, 5].map((i) => vars[`chart-${i}`]));
    expect(set.size).toBe(5);
  });

  it('keeps chart colors visible against the surface', () => {
    const { vars } = compileTheme(makeDef({ colors: { neutral: '#fefefe' } }));
    expect(contrast(c(vars['chart-5']), c(vars['surface']))).toBeGreaterThanOrEqual(3.0);
    const dark = compileTheme(darkDef());
    for (let i = 1; i <= 5; i++) {
      expect(contrast(c(dark.vars[`chart-${i}`]), c(dark.vars['surface']))).toBeGreaterThanOrEqual(
        3.0
      );
    }
  });

  it('never reports chart diagnostics', () => {
    const tokens = compileTheme(makeDef({ colors: { neutral: '#fefefe' } })).diagnostics.map(
      (d) => d.token
    );
    expect(tokens.some((t) => t.startsWith('chart-'))).toBe(false);
  });
});

describe('compileTheme focus token', () => {
  it('is emitted right after the role block and is 3:1 on every surface', () => {
    const out = compileTheme(darkDef());
    const keys = Object.keys(out.vars);
    expect(keys[keys.indexOf('critical-text') + 1]).toBe('focus');
    for (const bg of ['surface', 'background', 'surface-sunken']) {
      expect(contrast(c(out.vars['focus']), c(out.vars[bg]))).toBeGreaterThanOrEqual(3.0);
    }
  });

  it('follows an overridden accent', () => {
    const out = compileTheme({ ...makeDef(), overrides: { accent: '#0a7a3c' } });
    expect(out.vars['focus']).toBe('#0a7a3c');
  });
});

const YELLOW_BASES = {
  'base-100': '#fff248',
  'base-200': '#f0e43c',
  'base-300': '#d9cd2e',
  'base-content': '#1a1700',
};

describe('compileTheme text over role tints', () => {
  it('fits -text against sunken and the subtle tint over surface and background', () => {
    const def = makeDef({ colors: { warning: '#ffbf00', ...YELLOW_BASES } });
    const { vars } = compileTheme(def);
    const bgs = [vars['surface'], vars['background'], vars['surface-sunken']].map(c);
    for (const role of ROLES) {
      const tint = c(vars[`${role}-subtle`]);
      const all = [...bgs, composite(tint, 0.12, bgs[0]), composite(tint, 0.12, bgs[1])];
      for (const bg of all) {
        expect(contrast(c(vars[`${role}-text`]), bg), `${role}-text`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('uses a contrast-fitted base for the tint when the role hugs the surface', () => {
    const def = makeDef({ colors: { warning: '#ffbf00', ...YELLOW_BASES } });
    const { vars } = compileTheme(def);
    // parseColor drops alpha for contrast purposes: the channels are the tint base.
    expect(
      contrast(c(vars['warning-subtle']), c(vars['surface'])),
      'tint base vs surface'
    ).toBeGreaterThanOrEqual(3.0);
    // The fitted base is darker than the raw role, so the tint is darker too.
    const raw = compileTheme(makeDef({ colors: { warning: '#ffbf00' } })).vars['warning-subtle'];
    expect(vars['warning-subtle']).not.toBe(raw);
  });

  it('keeps the plain role tint when the role is well separated from the surface', () => {
    const { vars } = compileTheme(makeDef());
    expect(vars['danger-subtle']).toMatch(/^rgb\(\d+ \d+ \d+ \/ 0\.12\)$/);
  });
});

describe('compileTheme role overrides feed derivation', () => {
  it('derives subtle and text from an overridden critical', () => {
    const plain = compileTheme(makeDef());
    const out = compileTheme({ ...makeDef(), overrides: { critical: '#ea580c' } });
    expect(out.vars['critical']).toBe('#ea580c');
    expect(out.vars['critical-subtle']).toBe('rgb(234 88 12 / 0.12)');
    expect(out.vars['critical-subtle']).not.toBe(plain.vars['critical-subtle']);
    expect(contrast(c(out.vars['critical-text']), c(out.vars['surface']))).toBeGreaterThanOrEqual(
      4.5
    );
  });
});

describe('compileTheme chart synthesis', () => {
  it('synthesizes distinct series for an achromatic theme', () => {
    const gray = makeDef({
      colors: {
        primary: '#949494',
        secondary: '#949494',
        accent: '#949494',
        neutral: '#949494',
        info: '#949494',
        success: '#949494',
        warning: '#949494',
        error: '#949494',
      },
    });
    const { vars } = compileTheme(gray);
    const series = [1, 2, 3, 4, 5].map((i) => c(vars[`chart-${i}`]));
    for (let i = 0; i < 5; i++) {
      expect(contrast(series[i], c(vars['surface']))).toBeGreaterThanOrEqual(3.0);
      for (let j = i + 1; j < 5; j++) {
        expect(deltaE(series[i], series[j]), `${i + 1}/${j + 1}`).toBeGreaterThanOrEqual(
          CHART_MIN_DELTA_E
        );
      }
    }
  });
});

describe('theme definitions used by the compiler', () => {
  it('synthetic defs satisfy the shared schema', () => {
    expect(ThemeDefSchema.safeParse(makeDef()).success).toBe(true);
    expect(ThemeDefSchema.safeParse(darkDef()).success).toBe(true);
  });
});

describe('compileTheme square radius', () => {
  it("emits a length for a unitless '0' so min()/calc() stay valid", () => {
    const { vars } = compileTheme(makeDef({ radius: { box: '0', field: '0', selector: '0' } }));
    expect(vars['theme-radius-box']).toBe('0rem');
    expect(vars['theme-radius-field']).toBe('0rem');
    expect(vars['theme-radius-selector']).toBe('0rem');
  });

  it('leaves other radius values untouched', () => {
    const { vars } = compileTheme(makeDef());
    expect(vars['theme-radius-box']).toBe('0.5rem');
  });
});

describe('compileTheme unreachable contrast', () => {
  it('reports outputRatio below min when even black/white cannot reach the floor', () => {
    const grey = '#777777';
    const out = compileTheme(
      makeDef({
        colors: { 'base-100': grey, 'base-200': grey, 'base-300': grey, 'base-content': grey },
      })
    );
    const unreachable = out.diagnostics.filter((d) => d.outputRatio < d.min);
    expect(unreachable.length).toBeGreaterThan(0);
  });

  it('reports outputRatio at or above min when the adjustment succeeds', () => {
    const out = compileTheme(lowContrastDef());
    const reached = out.diagnostics.filter((d) => d.outputRatio >= d.min);
    expect(reached.length).toBeGreaterThan(0);
  });
});

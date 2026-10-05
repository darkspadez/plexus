import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ThemeDefSchema } from '@plexus/shared';
import { composite, contrast, deltaE, parseColor } from '../color';
import { CHART_MIN_DELTA_E, COMPILED_TOKENS, compileTheme } from '../compile';
import { BUILTIN_THEMES, getBuiltinTheme } from '../builtin';

const ROLES = COMPILED_TOKENS.filter((t) => t.endsWith('-text')).map((t) =>
  t.slice(0, -'-text'.length)
);
const SUBTLE_ALPHA = { light: 0.12, dark: 0.18 } as const;

describe('built-in themes', () => {
  it('has 37 unique themes with the Plexus pair first', () => {
    expect(BUILTIN_THEMES).toHaveLength(37);
    expect(new Set(BUILTIN_THEMES.map((t) => t.id)).size).toBe(37);
    expect(BUILTIN_THEMES[0]?.id).toBe('plexus-light');
    expect(BUILTIN_THEMES[1]?.id).toBe('plexus-dark');
    expect(getBuiltinTheme('synthwave')?.name).toBe('Synthwave');
    expect(getBuiltinTheme('nope')).toBeUndefined();
  });

  it('all pass ThemeDefSchema', () => {
    for (const def of BUILTIN_THEMES) {
      const res = ThemeDefSchema.safeParse(def);
      expect(res.success, `${def.id} failed schema`).toBe(true);
    }
  });

  it('derives the role list from the compiled tokens', () => {
    expect(ROLES).toHaveLength(9);
    expect(ROLES).toContain('critical');
  });

  it('meets contrast floors where text and indicators actually sit', () => {
    const failures: string[] = [];
    for (const def of BUILTIN_THEMES) {
      const { vars } = compileTheme(def);
      const c = (token: string) => parseColor(vars[token] as string);
      const check = (
        label: string,
        fg: ReturnType<typeof c>,
        bg: ReturnType<typeof c>,
        min: number
      ) => {
        const ratio = contrast(fg, bg);
        if (ratio < min) failures.push(`${def.id}: ${label} = ${ratio.toFixed(2)} (< ${min})`);
      };
      const plain = ['surface', 'background', 'surface-sunken'];
      for (const bg of plain) {
        check(`foreground on ${bg}`, c('foreground'), c(bg), 4.5);
        check(`foreground-muted on ${bg}`, c('foreground-muted'), c(bg), 4.5);
        check(`foreground-subtle on ${bg}`, c('foreground-subtle'), c(bg), 3.0);
        check(`focus on ${bg}`, c('focus'), c(bg), 3.0);
      }
      const alpha = SUBTLE_ALPHA[def.colorScheme];
      for (const role of ROLES) {
        const text = c(`${role}-text`);
        for (const bg of plain) check(`${role}-text on ${bg}`, text, c(bg), 4.5);
        // -subtle is emitted as `rgb(r g b / a)`: composite it over the opaque bgs.
        const tint = parseColor(vars[`${role}-subtle`] as string);
        for (const bg of ['surface', 'background']) {
          check(
            `${role}-text on ${role}-subtle over ${bg}`,
            text,
            composite(tint, alpha, c(bg)),
            4.5
          );
        }
        check(`${role}-foreground on ${role}`, c(`${role}-foreground`), c(role), 4.5);
      }
    }
    expect(failures).toEqual([]);
  });

  it('keeps role tints visible against the surface', () => {
    const failures: string[] = [];
    for (const def of BUILTIN_THEMES) {
      const { vars } = compileTheme(def);
      const alpha = SUBTLE_ALPHA[def.colorScheme];
      for (const role of ROLES) {
        const tinted = composite(
          parseColor(vars[`${role}-subtle`] as string),
          alpha,
          parseColor(vars['surface'] as string)
        );
        // Overridden bases may legitimately sit near the surface; the tint just has to differ.
        if (deltaE(tinted, parseColor(vars['surface'] as string)) < 0.005) {
          failures.push(`${def.id}: ${role}-subtle is invisible on surface`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('gives five distinct, readable chart series for every theme', () => {
    const failures: string[] = [];
    for (const def of BUILTIN_THEMES) {
      const { vars } = compileTheme(def);
      const series = [1, 2, 3, 4, 5].map((i) => parseColor(vars[`chart-${i}`] as string));
      const surface = parseColor(vars['surface'] as string);
      series.forEach((s, i) => {
        const ratio = contrast(s, surface);
        if (ratio < 3.0)
          failures.push(`${def.id}: chart-${i + 1} vs surface = ${ratio.toFixed(2)}`);
        for (let j = i + 1; j < series.length; j++) {
          const d = deltaE(s, series[j]);
          if (d < CHART_MIN_DELTA_E) {
            failures.push(`${def.id}: chart-${i + 1}/chart-${j + 1} deltaE = ${d.toFixed(3)}`);
          }
        }
      });
    }
    expect(failures).toEqual([]);
  });

  it('Plexus pair reproduces today surfaces', () => {
    const expected = {
      'plexus-light': {
        surface: '#FFFFFF',
        background: '#F6F4EE',
        foreground: '#1A1815',
        'foreground-muted': '#6B6557',
        border: '#E5E1D6',
      },
      'plexus-dark': {
        surface: '#16181D',
        background: '#0A0B0E',
        foreground: '#E8EAED',
        'foreground-muted': '#9DA1AA',
        border: '#22252C',
      },
    };
    for (const [id, tokens] of Object.entries(expected)) {
      const def = getBuiltinTheme(id);
      expect(def).toBeDefined();
      const { vars } = compileTheme(def!);
      for (const [token, hex] of Object.entries(tokens)) {
        expect(vars[token]?.toLowerCase(), `${id} ${token}`).toBe(hex.toLowerCase());
      }
    }
  });
});

describe('globals.css bridge', () => {
  it('maps every compiled color token to a --color-* entry in @theme inline', () => {
    const css = readFileSync(join(__dirname, '../../globals.css'), 'utf8');
    const start = css.indexOf('@theme inline');
    const block = css.slice(start, css.indexOf('\n}', start));
    const missing = COMPILED_TOKENS.filter(
      (t) => !/^(theme-|elevation-|chart-)/.test(t) && !block.includes(`--color-${t}: var(--${t});`)
    );
    expect(missing).toEqual([]);
  });
});

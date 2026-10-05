import { describe, expect, it } from 'vitest';
import { CustomThemeDefSchema } from '@plexus/shared';
import { BUILTIN_THEMES } from '../builtin';
import { seedFromTheme } from '../editor';
import { exportThemeDaisyCss, exportThemeJson, importTheme } from '../interop';

const cupcake = BUILTIN_THEMES.find((t) => t.id === 'cupcake')!;
const dracula = BUILTIN_THEMES.find((t) => t.id === 'dracula')!;
const seed = { ...seedFromTheme(cupcake, 'Cupcake copy'), id: 'custom-cupcake-copy' };

const GENERATOR_BLOCK = `@plugin "daisyui/theme" {
  name: "mytheme";
  default: false;
  prefersdark: false;
  color-scheme: "dark";
  --color-base-100: oklch(25.33% 0.016 252.42);
  --color-base-200: oklch(23.26% 0.014 253.1);
  --color-base-300: oklch(21.15% 0.012 254.09);
  --color-base-content: oklch(97.807% 0.029 256.847);
  --color-primary: oklch(58% 0.233 277.117);
  --color-primary-content: oklch(96% 0.018 272.314);
  --color-secondary: oklch(65% 0.241 354.308);
  --color-secondary-content: oklch(94% 0.028 342.258);
  --color-accent: oklch(77% 0.152 181.912);
  --color-accent-content: oklch(38% 0.063 188.416);
  --color-neutral: oklch(14% 0.005 285.823);
  --color-neutral-content: oklch(92% 0.004 286.32);
  --color-info: oklch(74% 0.16 232.661);
  --color-info-content: oklch(29% 0.066 243.157);
  --color-success: oklch(76% 0.177 163.223);
  --color-success-content: oklch(37% 0.077 168.94);
  --color-warning: oklch(82% 0.189 84.429);
  --color-warning-content: oklch(41% 0.112 45.904);
  --color-error: oklch(71% 0.194 13.428);
  --color-error-content: oklch(27% 0.105 12.094);
  --radius-selector: 0.5rem;
  --radius-field: 0.25rem;
  --radius-box: 0.5rem;
  --size-selector: 0.25rem;
  --size-field: 0.25rem;
  --border: 1px;
  --depth: 1;
  --noise: 0;
}`;

/** The generator block with chosen declarations removed. */
const without = (...keys: string[]) =>
  GENERATOR_BLOCK.split('\n')
    .filter((line) => !keys.some((k) => line.trim().startsWith(`${k}:`)))
    .join('\n');

function ok(text: string) {
  const r = importTheme(text);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r;
}

describe('export', () => {
  it('writes the daisyUI block in the documented order', () => {
    const css = exportThemeDaisyCss(seed);
    const lines = css.trim().split('\n');
    expect(lines[0]).toBe('@plugin "daisyui/theme" {');
    expect(lines.slice(1, 5)).toEqual([
      '  name: "cupcake-copy";',
      '  default: false;',
      '  prefersdark: false;',
      '  color-scheme: "light";',
    ]);
    expect(lines[5]).toMatch(/^ {2}--color-base-100: /);
    expect(lines.slice(-9)).toEqual([
      `  --radius-selector: ${cupcake.radius.selector};`,
      `  --radius-field: ${cupcake.radius.field};`,
      `  --radius-box: ${cupcake.radius.box};`,
      '  --size-selector: 0.25rem;',
      '  --size-field: 0.25rem;',
      `  --border: ${cupcake.border};`,
      `  --depth: ${cupcake.depth};`,
      '  --noise: 0;',
      '}',
    ]);
  });

  it('omits absent content colors and ends JSON with a newline', () => {
    const { 'primary-content': _drop, ...colors } = seed.colors;
    const def = { ...seed, colors };
    expect(exportThemeDaisyCss(def)).not.toContain('--color-primary-content');
    expect(exportThemeJson(def).endsWith('}\n')).toBe(true);
    expect(JSON.parse(exportThemeJson(def))).toEqual(def);
  });
});

describe('round trips', () => {
  it.each([
    ['cupcake', cupcake],
    ['dracula', dracula],
  ])('daisyUI CSS keeps every value (%s)', (_n, theme) => {
    const def = { ...seedFromTheme(theme, theme.name), id: 'custom-rt' };
    const r = ok(exportThemeDaisyCss(def));
    expect(r.draft.colors).toEqual(def.colors);
    expect(r.draft.radius).toEqual(def.radius);
    expect(r.draft.border).toBe(def.border);
    expect(r.draft.depth).toBe(def.depth);
    expect(r.draft.colorScheme).toBe(def.colorScheme);
    expect(r.warnings).toEqual([]);
  });

  it('JSON keeps every value and ignores the id', () => {
    const r = ok(exportThemeJson(seed));
    const { id: _id, ...rest } = seed;
    expect(r.draft).toEqual(rest);
    expect(r.draft).not.toHaveProperty('id');
    expect(r.warnings).toEqual([]);
  });

  it('every built-in survives a CSS round trip as a valid theme', () => {
    for (const theme of BUILTIN_THEMES) {
      const def = { ...seedFromTheme(theme, theme.name), id: 'custom-rt' };
      const r = ok(exportThemeDaisyCss(def));
      expect(CustomThemeDefSchema.safeParse({ ...r.draft, id: 'custom-rt' }).success).toBe(true);
      expect(r.draft.colors).toEqual(def.colors);
    }
  });
});

describe('importing CSS', () => {
  it('reads a realistic generator block with no warnings', () => {
    const r = ok(GENERATOR_BLOCK);
    expect(r.warnings).toEqual([]);
    expect(r.draft.name).toBe('Mytheme');
    expect(r.draft.colorScheme).toBe('dark');
    expect(r.draft.colors['base-100']).toBe('oklch(25.33% 0.016 252.42)');
    expect(r.draft.colors['error-content']).toBe('oklch(27% 0.105 12.094)');
    expect(r.draft.radius).toEqual({ box: '0.5rem', field: '0.25rem', selector: '0.5rem' });
    expect(r.draft.border).toBe('1px');
    expect(r.draft.depth).toBe(1);
  });

  it('accepts a bare color-scheme', () => {
    const r = ok(GENERATOR_BLOCK.replace('color-scheme: "dark"', 'color-scheme: light'));
    expect(r.draft.colorScheme).toBe('light');
    expect(r.warnings).toEqual([]);
  });

  it('accepts [data-theme] and :root rules', () => {
    const body = GENERATOR_BLOCK.slice(GENERATOR_BLOCK.indexOf('{'));
    for (const head of ['[data-theme="x"] ', ':root ']) {
      const r = ok(head + body);
      expect(r.draft.colors.primary).toBe('oklch(58% 0.233 277.117)');
    }
  });

  it('normalizes 0rem radii to the 0 preset and keeps other values', () => {
    const r = ok(GENERATOR_BLOCK.replace('--radius-field: 0.25rem', '--radius-field: 0rem'));
    expect(r.draft.radius).toEqual({ box: '0.5rem', field: '0', selector: '0.5rem' });
  });

  it('normalizes 0rem radii from JSON too', () => {
    const r = ok(
      JSON.stringify({ ...seed, radius: { box: '0rem', field: '0rem', selector: '1rem' } })
    );
    expect(r.draft.radius).toEqual({ box: '0', field: '0', selector: '1rem' });
  });

  it('reports whether the name came from the input', () => {
    expect(ok(GENERATOR_BLOCK).nameFromInput).toBe(true);
    expect(ok(without('name')).nameFromInput).toBe(false);
    // A theme genuinely called "Imported theme" still counts as named.
    expect(ok(GENERATOR_BLOCK.replace('"mytheme"', '"Imported theme"')).nameFromInput).toBe(true);
    expect(ok(GENERATOR_BLOCK.replace('"mytheme"', '"Imported theme"')).draft.name).toBe(
      'Imported theme'
    );
  });

  it('warns about unknown keys but not --size/--noise/default/prefersdark', () => {
    const r = ok(GENERATOR_BLOCK.replace('--noise: 0;', '--noise: 0;\n  --foo: 1;'));
    expect(r.warnings).toEqual(['Ignored --foo']);
  });

  it('warns about content after the first block', () => {
    const r = ok(`${GENERATOR_BLOCK}\nbody { color: red }`);
    expect(r.warnings).toEqual(['Ignored text after the first block']);
  });

  it('applies defaults with warnings when radius, border, depth, scheme and name are absent', () => {
    const r = ok(
      without(
        'name',
        'color-scheme',
        '--radius-selector',
        '--radius-field',
        '--radius-box',
        '--border',
        '--depth'
      )
    );
    expect(r.draft.name).toBe('Imported theme');
    expect(r.draft.radius).toEqual({ box: '0.5rem', field: '0.25rem', selector: '0.5rem' });
    expect(r.draft.border).toBe('1px');
    expect(r.draft.depth).toBe(0);
    // base-100 is dark (l = 0.2533)
    expect(r.draft.colorScheme).toBe('dark');
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('color-scheme'),
        expect.stringContaining('--radius-box'),
        expect.stringContaining('--radius-field'),
        expect.stringContaining('--radius-selector'),
        expect.stringContaining('--border'),
        expect.stringContaining('--depth'),
        expect.stringContaining('name'),
      ])
    );
    expect(r.warnings).toHaveLength(7);
  });

  it('infers a light scheme from a light base-100', () => {
    const r = ok(
      without('color-scheme').replace(
        '--color-base-100: oklch(25.33% 0.016 252.42)',
        '--color-base-100: oklch(98% 0.004 56)'
      )
    );
    expect(r.draft.colorScheme).toBe('light');
  });

  it('snaps --border: 3px to 2px with a warning', () => {
    const r = ok(GENERATOR_BLOCK.replace('--border: 1px', '--border: 3px'));
    expect(r.draft.border).toBe('2px');
    expect(r.warnings).toEqual(['Border 3px snapped to 2px']);
  });

  it('snaps depth above 0 to 1', () => {
    const r = ok(GENERATOR_BLOCK.replace('--depth: 1', '--depth: 2'));
    expect(r.draft.depth).toBe(1);
    expect(r.warnings).toHaveLength(1);
  });

  it('reports a missing required color', () => {
    const r = importTheme(without('--color-primary'));
    expect(r).toEqual({ ok: false, error: 'Missing --color-primary' });
  });

  it('rejects a bad color value with its path', () => {
    const r = importTheme(GENERATOR_BLOCK.replace('oklch(58% 0.233 277.117)', 'banana'));
    expect(r).toEqual({ ok: false, error: 'colors.primary: not a valid CSS color' });
  });

  it('rejects a radius that is not rem', () => {
    const r = importTheme(GENERATOR_BLOCK.replace('--radius-box: 0.5rem', '--radius-box: 8px'));
    expect(r).toEqual({ ok: false, error: expect.stringContaining('radius.box') });
  });

  it('rejects a block cut short by an injected brace (required colors lost)', () => {
    const attack = GENERATOR_BLOCK.replace(
      '--color-primary: oklch(58% 0.233 277.117);',
      '--color-primary: red; } body { background: url(x);'
    );
    // `}` ends the block after primary, so the later required colors never arrive.
    expect(importTheme(attack)).toEqual({ ok: false, error: 'Missing --color-secondary' });
  });

  it('rejects a hostile color value even when every required color is present', () => {
    const attack = without('--color-primary').replace(
      /\n\}$/,
      '\n  --color-primary: red; } body { x: url(y)\n}'
    );
    expect(attack).toContain('url(y)');
    const r = importTheme(attack);
    expect(r).toEqual({ ok: false, error: 'colors.primary: not a valid CSS color' });
  });

  it('collapses newlines and tabs inside color values', () => {
    const r = ok(
      GENERATOR_BLOCK.replace('oklch(58% 0.233 277.117)', 'oklch(\n\t58%   0.233\n277.117)')
    );
    expect(r.draft.colors.primary).toBe('oklch( 58% 0.233 277.117)');
  });

  it('reports an unsupported color-scheme with a single warning', () => {
    const r = ok(GENERATOR_BLOCK.replace('color-scheme: "dark"', 'color-scheme: "sepia"'));
    expect(r.draft.colorScheme).toBe('dark');
    expect(r.warnings).toEqual(['Unsupported color-scheme "sepia"; inferred dark from base-100']);
  });

  it('caps long ignored keys', () => {
    const long = `--${'x'.repeat(100)}`;
    const r = ok(GENERATOR_BLOCK.replace('--noise: 0;', `--noise: 0;\n  ${long}: 1;`));
    expect(r.warnings).toEqual([`Ignored ${long.slice(0, 40)}…`]);
  });

  it('keeps the display name across a CSS round trip', () => {
    const def = { ...seedFromTheme(cupcake, 'Gate Dark'), id: 'custom-gate-dark-ab12' };
    const css = exportThemeDaisyCss(def);
    expect(css).toContain('name: "gate-dark";');
    const r = ok(css);
    expect(r.draft.name).toBe('Gate Dark');
  });

  it('only exports [a-z0-9-] in the name line', () => {
    const def = { ...seed, name: 'Evil"; } body {' };
    expect(exportThemeDaisyCss(def)).toContain('name: "evil-body";');
  });

  it('keeps hostile characters out of an accepted draft', () => {
    const r = importTheme(
      GENERATOR_BLOCK.replace(
        '--color-primary: oklch(58% 0.233 277.117)',
        '--color-primary: #fff</style><script>'
      )
    );
    expect(r.ok).toBe(false);
  });

  it('rejects empty input and text without a block', () => {
    expect(importTheme('   ')).toEqual({ ok: false, error: 'Paste a theme first' });
    expect(importTheme('hello there').ok).toBe(false);
  });
});

describe('importing JSON', () => {
  const daisyObject = {
    'color-scheme': 'dark',
    '--color-base-100': 'oklch(25.33% 0.016 252.42)',
    '--color-base-200': 'oklch(23.26% 0.014 253.1)',
    '--color-base-300': 'oklch(21.15% 0.012 254.09)',
    '--color-base-content': 'oklch(97.807% 0.029 256.847)',
    '--color-primary': 'oklch(58% 0.233 277.117)',
    '--color-secondary': 'oklch(65% 0.241 354.308)',
    '--color-accent': 'oklch(77% 0.152 181.912)',
    '--color-neutral': 'oklch(14% 0.005 285.823)',
    '--color-info': 'oklch(74% 0.16 232.661)',
    '--color-success': 'oklch(76% 0.177 163.223)',
    '--color-warning': 'oklch(82% 0.189 84.429)',
    '--color-error': 'oklch(71% 0.194 13.428)',
    '--radius-selector': '0.5rem',
    '--radius-field': '0.25rem',
    '--radius-box': '0.5rem',
    '--size-selector': '0.25rem',
    '--size-field': '0.25rem',
    '--border': '1px',
    '--depth': '0',
    '--noise': '0',
  };

  it('imports a daisy object wrapped in { name: {...} }', () => {
    const r = ok(JSON.stringify({ midnight: daisyObject }));
    expect(r.draft.name).toBe('midnight');
    expect(r.draft.colorScheme).toBe('dark');
    expect(r.draft.colors.primary).toBe('oklch(58% 0.233 277.117)');
    expect(r.draft.depth).toBe(0);
    expect(r.warnings).toEqual([]);
  });

  it('imports an unwrapped daisy object', () => {
    const r = ok(JSON.stringify(daisyObject));
    expect(r.draft.colorScheme).toBe('dark');
    expect(r.draft.name).toBe('Imported theme');
  });

  it('warns about unknown keys in a Plexus theme JSON', () => {
    const { id: _id, ...rest } = seed;
    const r = ok(JSON.stringify({ ...rest, extra: 1, colors: { ...rest.colors, wat: '#fff' } }));
    expect(r.warnings.sort()).toEqual(['Ignored colors.wat', 'Ignored extra']);
  });

  it('rejects invalid JSON and non-objects', () => {
    expect(importTheme('{ nope').ok).toBe(false);
    expect(importTheme('[1,2]').ok).toBe(false);
    expect(importTheme('{}').ok).toBe(false);
  });

  it('rejects non-string colors', () => {
    const r = importTheme(JSON.stringify({ ...daisyObject, '--color-primary': 5 }));
    expect(r).toEqual({ ok: false, error: 'colors.primary: not a valid CSS color' });
  });
});

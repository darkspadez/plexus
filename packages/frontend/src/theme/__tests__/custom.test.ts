import { describe, expect, it } from 'vitest';
import { CustomThemeDefSchema, type CustomThemeDef } from '@plexus/shared';
import { DEFAULT_APPEARANCE, type Appearance } from '../appearance';
import { BUILTIN_THEMES } from '../builtin';
import {
  buildCustomThemesCss,
  buildThemeCache,
  confirmsAbsence,
  decideCustomSync,
  isActiveReference,
  planDeletedReplacement,
  colorSchemeFromCss,
  findDeletedReferences,
  parseThemeCache,
  replaceDeletedReferences,
  resolveRenderedThemeId,
} from '../custom';

const cupcake = BUILTIN_THEMES.find((t) => t.id === 'cupcake')!;

function makeTheme(id: string, patch: Partial<CustomThemeDef> = {}): CustomThemeDef {
  const { overrides: _overrides, ...rest } = cupcake;
  return CustomThemeDefSchema.parse({ ...rest, id, name: id, ...patch });
}

const appearance = (patch: Partial<Appearance>): Appearance => ({
  ...DEFAULT_APPEARANCE,
  ...patch,
});

describe('buildCustomThemesCss', () => {
  it('compiles every valid theme into one stylesheet', () => {
    const out = buildCustomThemesCss([makeTheme('custom-a'), makeTheme('custom-b')]);
    expect(out.failed).toEqual([]);
    expect(out.css).toContain('[data-theme="custom-a"]');
    expect(out.css).toContain('[data-theme="custom-b"]');
    expect(Object.keys(out.cssById)).toEqual(['custom-a', 'custom-b']);
  });

  it('skips a theme the compiler cannot parse (hsl(foo)) and reports it', () => {
    const bad = makeTheme('custom-bad', {
      colors: { ...cupcake.colors, primary: 'hsl(foo)' },
    });
    const out = buildCustomThemesCss([makeTheme('custom-ok'), bad]);
    expect(out.failed).toEqual(['custom-bad']);
    expect(out.css).toContain('custom-ok');
    expect(out.css).not.toContain('custom-bad');
    expect(out.cssById['custom-bad']).toBeUndefined();
  });

  it('skips a def that fails the schema instead of compiling it verbatim', () => {
    const evil = {
      ...makeTheme('custom-evil'),
      radius: { box: '1rem; } body { x: y', field: '0', selector: '0' },
    };
    const out = buildCustomThemesCss([evil as CustomThemeDef]);
    expect(out.failed).toEqual(['custom-evil']);
    expect(out.css).toBe('');
  });

  it('returns an empty stylesheet for no themes', () => {
    expect(buildCustomThemesCss([])).toEqual({ css: '', failed: [], cssById: {} });
  });

  it('serves repeat compiles of an identical def from the cache', () => {
    const a = buildCustomThemesCss([makeTheme('custom-same')]);
    const b = buildCustomThemesCss([makeTheme('custom-same')]);
    expect(b.cssById['custom-same']).toBe(a.cssById['custom-same']);
  });
});

describe('buildThemeCache', () => {
  const css = { 'custom-a': 'A', 'custom-b': 'B', 'custom-c': 'C' };

  it('holds only the custom ids referenced by theme, light and dark', () => {
    const a = appearance({
      mode: 'system',
      theme: 'custom-c',
      light: 'custom-a',
      dark: 'plexus-dark',
    });
    expect(buildThemeCache(a, css)).toEqual({ 'custom-c': 'C', 'custom-a': 'A' });
  });

  it('is empty when nothing custom is referenced', () => {
    expect(buildThemeCache(DEFAULT_APPEARANCE, css)).toEqual({});
  });

  it('omits referenced ids that did not compile', () => {
    const a = appearance({ theme: 'custom-gone' });
    expect(buildThemeCache(a, css)).toEqual({});
  });
});

describe('findDeletedReferences', () => {
  it('returns referenced custom ids missing from the loaded list', () => {
    const a = appearance({ theme: 'custom-a', light: 'custom-b', dark: 'plexus-dark' });
    expect(findDeletedReferences(a, ['custom-a'])).toEqual(['custom-b']);
  });

  it('ignores built-ins and de-duplicates', () => {
    const a = appearance({ theme: 'custom-x', light: 'custom-x', dark: 'dracula' });
    expect(findDeletedReferences(a, [])).toEqual(['custom-x']);
    expect(findDeletedReferences(DEFAULT_APPEARANCE, [])).toEqual([]);
  });
});

describe('replaceDeletedReferences', () => {
  it('maps each slot to the Plexus default of its scheme', () => {
    const a = appearance({
      mode: 'system',
      theme: 'custom-x',
      light: 'custom-x',
      dark: 'custom-x',
    });
    const out = replaceDeletedReferences(a, ['custom-x'], false);
    expect(out.appearance).toMatchObject({
      theme: 'plexus-light',
      light: 'plexus-light',
      dark: 'plexus-dark',
    });
    expect(out.replacements).toHaveLength(3);
  });

  it('uses the OS scheme for the single-mode theme slot', () => {
    const a = appearance({ mode: 'single', theme: 'custom-x' });
    expect(replaceDeletedReferences(a, ['custom-x'], true).appearance.theme).toBe('plexus-dark');
    expect(replaceDeletedReferences(a, ['custom-x'], false).appearance.theme).toBe('plexus-light');
  });

  it('returns the same object when nothing matches', () => {
    expect(replaceDeletedReferences(DEFAULT_APPEARANCE, ['custom-x'], true).appearance).toBe(
      DEFAULT_APPEARANCE
    );
  });
});

describe('resolveRenderedThemeId', () => {
  const builtinIds = new Set(BUILTIN_THEMES.map((t) => t.id));
  const none = new Set<string>();
  const single = (theme: string) => appearance({ mode: 'single', theme });

  it('renders built-ins as themselves', () => {
    const avail = { builtinIds, loadedCustomIds: null, bootCachedIds: none };
    expect(resolveRenderedThemeId(single('dracula'), true, avail)).toBe('dracula');
  });

  it('renders a loaded custom theme', () => {
    const avail = { builtinIds, loadedCustomIds: new Set(['custom-a']), bootCachedIds: none };
    expect(resolveRenderedThemeId(single('custom-a'), true, avail)).toBe('custom-a');
  });

  it('keeps an unloaded custom id only when the boot cache has it', () => {
    const cached = { builtinIds, loadedCustomIds: null, bootCachedIds: new Set(['custom-a']) };
    const uncached = { builtinIds, loadedCustomIds: null, bootCachedIds: none };
    expect(resolveRenderedThemeId(single('custom-a'), false, cached)).toBe('custom-a');
    expect(resolveRenderedThemeId(single('custom-a'), false, uncached)).toBe('plexus-light');
    expect(resolveRenderedThemeId(single('custom-a'), true, uncached)).toBe('plexus-dark');
  });

  it('falls back once loaded and the id is gone, even if boot-cached', () => {
    const avail = {
      builtinIds,
      loadedCustomIds: new Set<string>(),
      bootCachedIds: new Set(['custom-a']),
    };
    expect(resolveRenderedThemeId(single('custom-a'), false, avail)).toBe('plexus-light');
  });

  it('falls back for an unknown non-custom id by OS scheme', () => {
    const avail = { builtinIds, loadedCustomIds: null, bootCachedIds: none };
    expect(resolveRenderedThemeId(single('nope'), false, avail)).toBe('plexus-light');
  });
});

describe('parseThemeCache / colorSchemeFromCss', () => {
  it('keeps only non-empty string entries and survives junk', () => {
    expect(parseThemeCache(JSON.stringify({ a: 'x', b: 1, c: '' }))).toEqual({ a: 'x' });
    expect(parseThemeCache('nope')).toEqual({});
    expect(parseThemeCache('[1]')).toEqual({});
    expect(parseThemeCache(null)).toEqual({});
  });

  it('reads the color scheme from compiled css', () => {
    const css = buildCustomThemesCss([makeTheme('custom-s', { colorScheme: 'dark' })]).css;
    expect(colorSchemeFromCss(css)).toBe('dark');
    expect(colorSchemeFromCss('a { b: c }')).toBeUndefined();
    expect(colorSchemeFromCss(undefined)).toBeUndefined();
  });
});

describe('decideCustomSync', () => {
  const base = { referenced: ['custom-a'], loaded: ['custom-a'] };

  it.each([
    ['nothing referenced', { referenced: [], loaded: [] }, false, 'none'],
    ['all referenced ids loaded (stale data)', base, false, 'none'],
    ['all referenced ids loaded (server data)', base, true, 'none'],
    [
      'missing id on data that may predate the reference',
      { ...base, loaded: [] },
      false,
      'refetch',
    ],
    ['missing id on fresh server data', { ...base, loaded: [] }, true, 'replace'],
    [
      'only one of two missing, not fresh',
      { referenced: ['custom-a', 'custom-b'], loaded: ['custom-a'] },
      false,
      'refetch',
    ],
    [
      'only one of two missing, fresh',
      { referenced: ['custom-a', 'custom-b'], loaded: ['custom-a'] },
      true,
      'replace',
    ],
  ] as const)('%s -> %s', (_name, input, serverFresh, action) => {
    expect(decideCustomSync({ ...input, serverFresh }).action).toBe(action);
  });

  it('lists the missing ids de-duplicated and sorted, so the set has a stable key', () => {
    const out = decideCustomSync({
      referenced: ['custom-b', 'custom-a', 'custom-b', 'custom-c'],
      loaded: ['custom-c'],
      serverFresh: false,
    });
    expect(out).toEqual({ action: 'refetch', missing: ['custom-a', 'custom-b'] });
  });

  it('never replaces on a non-fresh list, whatever is missing', () => {
    expect(
      decideCustomSync({ referenced: ['custom-x'], loaded: [], serverFresh: false }).action
    ).not.toBe('replace');
  });
});

describe('active reference and deletion replacement', () => {
  const sys = appearance({
    mode: 'system',
    theme: 'custom-t',
    light: 'custom-l',
    dark: 'custom-d',
  });
  const single = appearance({
    mode: 'single',
    theme: 'custom-t',
    light: 'custom-l',
    dark: 'custom-d',
  });

  it('isActiveReference follows mode and OS scheme', () => {
    expect(isActiveReference(sys, true, 'custom-d')).toBe(true);
    expect(isActiveReference(sys, true, 'custom-l')).toBe(false);
    expect(isActiveReference(sys, false, 'custom-l')).toBe(true);
    expect(isActiveReference(sys, true, 'custom-t')).toBe(false);
    expect(isActiveReference(single, true, 'custom-t')).toBe(true);
    expect(isActiveReference(single, true, 'custom-l')).toBe(false);
  });

  it('shows a replacement only for the slot on screen', () => {
    const out = planDeletedReplacement(sys, ['custom-d'], true);
    expect(out.shown).toMatchObject({ slot: 'dark', from: 'custom-d', to: 'plexus-dark' });
    expect(out.appearance.dark).toBe('plexus-dark');
  });

  it('replaces an unused slot silently', () => {
    const out = planDeletedReplacement(sys, ['custom-l', 'custom-t'], true);
    expect(out.shown).toBeNull();
    expect(out.appearance).toMatchObject({
      light: 'plexus-light',
      theme: 'plexus-dark',
      dark: 'custom-d',
    });
  });

  it('single mode: the theme slot is on screen, light/dark are not', () => {
    expect(planDeletedReplacement(single, ['custom-l'], false).shown).toBeNull();
    expect(planDeletedReplacement(single, ['custom-t'], false).shown?.slot).toBe('theme');
  });
});

describe('confirmsAbsence', () => {
  const base = [makeTheme('custom-a')];
  const next = [makeTheme('custom-a')];

  it('never confirms without an explicit refetch, even for a server list', () => {
    expect(confirmsAbsence(true, next, null)).toBe(false);
  });

  it('does not confirm the list the refetch was requested against', () => {
    expect(confirmsAbsence(true, base, base)).toBe(false);
  });

  it('does not confirm an optimistic (non-server) list', () => {
    expect(confirmsAbsence(false, next, base)).toBe(false);
  });

  it('confirms a different server list after a refetch was requested', () => {
    expect(confirmsAbsence(true, next, base)).toBe(true);
  });

  it('with decideCustomSync: a missing id with no pending refetch only refetches', () => {
    const d = decideCustomSync({
      referenced: ['custom-x'],
      loaded: ['custom-a'],
      serverFresh: confirmsAbsence(true, next, null),
    });
    expect(d.action).toBe('refetch');
  });
});

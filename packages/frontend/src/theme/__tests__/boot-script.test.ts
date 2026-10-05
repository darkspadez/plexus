import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPEARANCE_STORAGE_KEY, LEGACY_THEME_KEY, parseAppearance } from '../appearance';
import { BUILTIN_THEMES } from '../builtin';
import { THEME_CACHE_STORAGE_KEY, resolveRenderedThemeId } from '../custom';

const html = readFileSync(path.resolve(__dirname, '../../../index.html'), 'utf8');
const bootSource = (() => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const boot = scripts.find((m) => m[1].includes('data-theme') || m[1].includes('dataset.theme'));
  if (!boot) throw new Error('boot script not found in index.html');
  return boot[1];
})();

interface Env {
  storage?: Record<string, string>;
  /** localStorage.getItem throws (blocked storage). */
  blocked?: boolean;
  prefersDark: boolean;
  matchMediaThrows?: boolean;
}

function runBoot(env: Env) {
  const appended: { id: string; textContent: string }[] = [];
  const dataset: Record<string, string> = {};
  const fakeDocument = {
    documentElement: { dataset, style: { setProperty() {} } },
    head: { appendChild: (el: { id: string; textContent: string }) => appended.push(el) },
    createElement: () => ({ id: '', textContent: '' }),
    getElementById: () => null,
  };
  const fakeStorage = {
    getItem(k: string) {
      if (env.blocked) throw new Error('SecurityError');
      return env.storage?.[k] ?? null;
    },
  };
  const fakeWindow = {
    matchMedia() {
      if (env.matchMediaThrows) throw new Error('no matchMedia');
      return { matches: env.prefersDark };
    },
  };
  new Function('localStorage', 'window', 'document', bootSource)(
    fakeStorage,
    fakeWindow,
    fakeDocument
  );
  return { theme: dataset.theme, boot: appended.find((e) => e.id === 'plexus-custom-themes-boot') };
}

/** What AppearanceContext renders for the same inputs, before custom themes load. */
function expectedTheme(env: Env): string {
  const get = (k: string) => (env.blocked ? null : (env.storage?.[k] ?? null));
  const { appearance } = parseAppearance(get(APPEARANCE_STORAGE_KEY), get(LEGACY_THEME_KEY));
  const prefersDark = env.matchMediaThrows ? true : env.prefersDark;
  const cache = (() => {
    try {
      return JSON.parse(get(THEME_CACHE_STORAGE_KEY) ?? 'null') ?? {};
    } catch {
      return {};
    }
  })();
  return resolveRenderedThemeId(appearance, prefersDark, {
    builtinIds: new Set(BUILTIN_THEMES.map((t) => t.id)),
    loadedCustomIds: null,
    bootCachedIds: new Set(
      Object.keys(cache).filter((k) => typeof cache[k] === 'string' && cache[k])
    ),
  });
}

const app = (o: Record<string, unknown>) =>
  JSON.stringify({
    mode: 'single',
    theme: 'plexus-dark',
    light: 'plexus-light',
    dark: 'plexus-dark',
    ...o,
  });
const cacheJson = (o: Record<string, string>) => JSON.stringify(o);

const CASES: { name: string; env: Env; injects?: boolean; contains?: string[] }[] = [
  { name: 'no keys, dark OS', env: { prefersDark: true } },
  { name: 'no keys, light OS', env: { prefersDark: false } },
  { name: 'legacy light', env: { prefersDark: true, storage: { [LEGACY_THEME_KEY]: 'light' } } },
  { name: 'legacy dark', env: { prefersDark: false, storage: { [LEGACY_THEME_KEY]: 'dark' } } },
  { name: 'legacy system', env: { prefersDark: false, storage: { [LEGACY_THEME_KEY]: 'system' } } },
  {
    name: 'single built-in',
    env: { prefersDark: true, storage: { [APPEARANCE_STORAGE_KEY]: app({ theme: 'dracula' }) } },
  },
  {
    name: 'system pair, light OS',
    env: {
      prefersDark: false,
      storage: {
        [APPEARANCE_STORAGE_KEY]: app({ mode: 'system', light: 'cupcake', dark: 'dracula' }),
      },
    },
  },
  {
    name: 'system pair, dark OS',
    env: {
      prefersDark: true,
      storage: {
        [APPEARANCE_STORAGE_KEY]: app({ mode: 'system', light: 'cupcake', dark: 'dracula' }),
      },
    },
  },
  {
    name: 'invalid appearance JSON falls back to legacy',
    env: {
      prefersDark: true,
      storage: { [APPEARANCE_STORAGE_KEY]: '{oops', [LEGACY_THEME_KEY]: 'light' },
    },
  },
  {
    name: 'custom id with cache',
    injects: true,
    env: {
      prefersDark: true,
      storage: {
        [APPEARANCE_STORAGE_KEY]: app({ theme: 'custom-x' }),
        [THEME_CACHE_STORAGE_KEY]: cacheJson({ 'custom-x': '[data-theme="custom-x"]{}' }),
      },
    },
  },
  {
    name: 'custom system slot with cache, light OS',
    injects: true,
    env: {
      prefersDark: false,
      storage: {
        [APPEARANCE_STORAGE_KEY]: app({ mode: 'system', light: 'custom-y' }),
        [THEME_CACHE_STORAGE_KEY]: cacheJson({ 'custom-y': '[data-theme="custom-y"]{}' }),
      },
    },
  },
  {
    // The OS can flip before custom themes load; the other slot's CSS must already be there.
    name: 'system pair, both slots custom and cached, dark OS',
    injects: true,
    contains: ['[data-theme="custom-l"]', '[data-theme="custom-d"]'],
    env: {
      prefersDark: true,
      storage: {
        [APPEARANCE_STORAGE_KEY]: app({ mode: 'system', light: 'custom-l', dark: 'custom-d' }),
        [THEME_CACHE_STORAGE_KEY]: cacheJson({
          'custom-l': '[data-theme="custom-l"]{}',
          'custom-d': '[data-theme="custom-d"]{}',
        }),
      },
    },
  },
  {
    name: 'system pair, both slots custom and cached, light OS',
    injects: true,
    contains: ['[data-theme="custom-l"]', '[data-theme="custom-d"]'],
    env: {
      prefersDark: false,
      storage: {
        [APPEARANCE_STORAGE_KEY]: app({ mode: 'system', light: 'custom-l', dark: 'custom-d' }),
        [THEME_CACHE_STORAGE_KEY]: cacheJson({
          'custom-l': '[data-theme="custom-l"]{}',
          'custom-d': '[data-theme="custom-d"]{}',
        }),
      },
    },
  },
  {
    name: 'custom id without cache, light OS',
    env: { prefersDark: false, storage: { [APPEARANCE_STORAGE_KEY]: app({ theme: 'custom-x' }) } },
  },
  {
    name: 'custom id with cache for a different id',
    injects: true,
    env: {
      prefersDark: true,
      storage: {
        [APPEARANCE_STORAGE_KEY]: app({ theme: 'custom-x' }),
        [THEME_CACHE_STORAGE_KEY]: cacheJson({ 'custom-z': '[data-theme="custom-z"]{}' }),
      },
    },
  },
  {
    name: 'custom id with corrupt cache, light OS',
    env: {
      prefersDark: false,
      storage: {
        [APPEARANCE_STORAGE_KEY]: app({ theme: 'custom-x' }),
        [THEME_CACHE_STORAGE_KEY]: 'null',
      },
    },
  },
  { name: 'blocked storage, light OS', env: { prefersDark: false, blocked: true } },
  { name: 'blocked storage, dark OS', env: { prefersDark: true, blocked: true } },
  { name: 'matchMedia throws', env: { prefersDark: false, matchMediaThrows: true } },
];

describe('index.html boot script parity', () => {
  it.each(CASES)('$name', ({ env, injects, contains }) => {
    const out = runBoot(env);
    expect(out.theme).toBe(expectedTheme(env));
    expect(Boolean(out.boot)).toBe(Boolean(injects));
    if (injects) expect(out.boot!.textContent).toContain('[data-theme=');
    for (const needle of contains ?? []) expect(out.boot!.textContent).toContain(needle);
  });
});

/**
 * Pure logic for server-provided custom themes: compile (with a cache), the
 * boot cache, unloaded-id resolution and deletion handling. No React, no
 * `window`. The boot script in index.html mirrors resolveRenderedThemeId.
 */
import { CustomThemeDefSchema, type CustomThemeDef } from '@plexus/shared';
import { resolveThemeId, type Appearance } from './appearance';
import { compileTheme } from './compile';
import { DEFAULT_DARK_THEME_ID, DEFAULT_LIGHT_THEME_ID } from './ids';

export const CUSTOM_THEME_PREFIX = 'custom-';
export const THEME_CACHE_STORAGE_KEY = 'plexus.themeCache';
export const CUSTOM_STYLE_ID = 'plexus-custom-themes';
export const CUSTOM_BOOT_STYLE_ID = 'plexus-custom-themes-boot';

export function isCustomThemeId(id: string): boolean {
  return id.startsWith(CUSTOM_THEME_PREFIX);
}

export function plexusDefaultFor(prefersDark: boolean): string {
  return prefersDark ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID;
}

// Compile cache. Module level (not a ref) so it is safe under React Compiler.
// Keyed by the serialized def; bounded so live editing cannot grow it forever.
const COMPILE_CACHE_MAX = 200;
const compileCache = new Map<string, { css: string } | { error: string }>();

function compileCustom(def: unknown): { css: string; id: string } | { error: string; id: string } {
  const key = JSON.stringify(def);
  const rawId =
    def !== null && typeof def === 'object' && typeof (def as { id?: unknown }).id === 'string'
      ? (def as { id: string }).id
      : '(unknown)';
  const hit = compileCache.get(key);
  if (hit) return { ...hit, id: rawId };
  let entry: { css: string } | { error: string };
  const parsed = CustomThemeDefSchema.safeParse(def);
  if (!parsed.success) {
    entry = { error: parsed.error.message };
  } else {
    try {
      entry = { css: compileTheme(parsed.data).css };
    } catch (err) {
      entry = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  if (compileCache.size >= COMPILE_CACHE_MAX) {
    const oldest = compileCache.keys().next().value;
    if (oldest !== undefined) compileCache.delete(oldest);
  }
  compileCache.set(key, entry);
  return { ...entry, id: rawId };
}

export interface CustomThemesBuild {
  /** Concatenated CSS of every theme that compiled. */
  css: string;
  /** Ids of themes that failed validation or compilation (skipped). */
  failed: string[];
  /** Compiled CSS per successfully compiled theme id. */
  cssById: Record<string, string>;
}

/**
 * Validate and compile each theme. A theme that fails the schema or whose
 * colors the compiler cannot parse (e.g. `hsl(foo)`) is skipped and reported.
 */
export function buildCustomThemesCss(themes: readonly CustomThemeDef[]): CustomThemesBuild {
  const cssById: Record<string, string> = {};
  const failed: string[] = [];
  const blocks: string[] = [];
  for (const def of themes) {
    const res = compileCustom(def);
    if ('css' in res) {
      cssById[res.id] = res.css;
      blocks.push(res.css.trimEnd());
    } else {
      failed.push(res.id);
    }
  }
  return { css: blocks.length ? `${blocks.join('\n\n')}\n` : '', failed, cssById };
}

/** Custom theme ids the appearance references (theme, light, dark), de-duplicated. */
export function referencedCustomIds(a: Appearance): string[] {
  return [...new Set([a.theme, a.light, a.dark].filter(isCustomThemeId))];
}

/** Boot cache contents: CSS for only the custom ids the appearance references. */
export function buildThemeCache(
  a: Appearance,
  compiledById: Readonly<Record<string, string>>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of referencedCustomIds(a)) {
    const css = compiledById[id];
    if (css) out[id] = css;
  }
  return out;
}

/** Parse the stored boot cache; anything malformed yields an empty map. */
export function parseThemeCache(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [id, css] of Object.entries(v)) {
      if (typeof css === 'string' && css) out[id] = css;
    }
    return out;
  } catch {
    return {};
  }
}

/** Custom ids the appearance references that are absent from a loaded list. */
export function findDeletedReferences(a: Appearance, loadedIds: Iterable<string>): string[] {
  const loaded = new Set(loadedIds);
  return referencedCustomIds(a).filter((id) => !loaded.has(id));
}

/**
 * Whether a list confirms a missing reference. Only a server list that is not
 * the one a refetch was requested against, and only after a refetch was
 * requested (`requestedAgainst` null means none was): a list whose fetch began
 * before the reference appeared can look fresh, so it never counts alone.
 */
export function confirmsAbsence(
  fromServer: boolean,
  list: unknown,
  requestedAgainst: unknown | null
): boolean {
  return fromServer && requestedAgainst !== null && list !== requestedAgainst;
}

export type CustomSyncDecision =
  | { action: 'none'; missing: [] }
  /** Ask the server again; the reference may simply be newer than the list. */
  | { action: 'refetch'; missing: string[] }
  /** A server list fetched after the reference appeared lacks it: it was deleted. */
  | { action: 'replace'; missing: string[] };

/**
 * What to do about custom ids the appearance references that the loaded list
 * lacks. `serverFresh` means the list was fetched from the server after the
 * reference appeared (optimistic cache writes and lists older than the
 * reference do not count). An absent id is only "deleted" on fresh data;
 * otherwise it may be a theme another tab just created, so refetch.
 */
export function decideCustomSync(input: {
  referenced: readonly string[];
  loaded: Iterable<string>;
  serverFresh: boolean;
}): CustomSyncDecision {
  const loaded = new Set(input.loaded);
  const missing = [...new Set(input.referenced.filter((id) => !loaded.has(id)))].sort();
  if (missing.length === 0) return { action: 'none', missing: [] };
  return { action: input.serverFresh ? 'replace' : 'refetch', missing };
}

export interface ThemeReplacement {
  slot: 'theme' | 'light' | 'dark';
  from: string;
  to: string;
}

/**
 * Swap references to removed custom ids for the Plexus default of the slot's
 * scheme. `theme` (single mode) uses the current OS scheme.
 */
export function replaceDeletedReferences(
  a: Appearance,
  removedIds: readonly string[],
  prefersDark: boolean
): { appearance: Appearance; replacements: ThemeReplacement[] } {
  const removed = new Set(removedIds);
  const defaults = {
    theme: plexusDefaultFor(prefersDark),
    light: DEFAULT_LIGHT_THEME_ID,
    dark: DEFAULT_DARK_THEME_ID,
  };
  const next = { ...a };
  const replacements: ThemeReplacement[] = [];
  for (const slot of ['theme', 'light', 'dark'] as const) {
    if (removed.has(a[slot])) {
      next[slot] = defaults[slot];
      replacements.push({ slot, from: a[slot], to: defaults[slot] });
    }
  }
  return { appearance: replacements.length ? next : a, replacements };
}

/** The slot that decides what is on screen right now. */
export function activeSlot(a: Appearance, prefersDark: boolean): 'theme' | 'light' | 'dark' {
  if (a.mode === 'system') return prefersDark ? 'dark' : 'light';
  return 'theme';
}

/** Whether removing `id` changes the theme the user is looking at. */
export function isActiveReference(a: Appearance, prefersDark: boolean, id: string): boolean {
  return a[activeSlot(a, prefersDark)] === id;
}

/**
 * Replace references to removed ids. `shown` is the replacement for the slot on
 * screen (null when only unused slots changed): only that one deserves a
 * "switched to ..." notice; the rest are swapped silently.
 */
export function planDeletedReplacement(
  a: Appearance,
  removedIds: readonly string[],
  prefersDark: boolean
): { appearance: Appearance; shown: ThemeReplacement | null } {
  const { appearance, replacements } = replaceDeletedReferences(a, removedIds, prefersDark);
  const slot = activeSlot(a, prefersDark);
  return { appearance, shown: replacements.find((r) => r.slot === slot) ?? null };
}

export interface RenderAvailability {
  builtinIds: ReadonlySet<string>;
  /** Ids of usable custom themes, or null while custom themes are not loaded. */
  loadedCustomIds: ReadonlySet<string> | null;
  /** Custom ids whose CSS the boot script found in the boot cache. */
  bootCachedIds: ReadonlySet<string>;
}

/**
 * The theme id actually rendered. A known built-in or loaded custom renders as
 * itself. A custom id that is not loaded yet renders as itself only when the
 * boot cache supplied its CSS. Everything else falls back to the Plexus theme
 * for the OS scheme. Mirrors the boot script, which treats every non-custom id
 * as built-in.
 */
export function resolveRenderedThemeId(
  a: Appearance,
  prefersDark: boolean,
  avail: RenderAvailability
): string {
  const id = resolveThemeId(a, prefersDark);
  if (avail.builtinIds.has(id)) return id;
  if (isCustomThemeId(id)) {
    if (avail.loadedCustomIds) {
      if (avail.loadedCustomIds.has(id)) return id;
    } else if (avail.bootCachedIds.has(id)) {
      return id;
    }
  }
  return plexusDefaultFor(prefersDark);
}

/** Color scheme declared by a compiled theme's CSS, if any. */
export function colorSchemeFromCss(css: string | undefined): 'light' | 'dark' | undefined {
  const m = css ? /color-scheme:\s*(light|dark)/.exec(css) : null;
  return m ? (m[1] as 'light' | 'dark') : undefined;
}

import React from 'react';
import type { CustomThemeDef, ThemeDef } from '@plexus/shared';
import {
  APPEARANCE_STORAGE_KEY,
  LEGACY_ACCENT_KEY,
  LEGACY_THEME_KEY,
  parseAppearance,
  resolveThemeId,
  withMode,
  withThemePicked,
  type Appearance,
  type AppearanceMode,
} from '../theme/appearance';
import { BUILTIN_THEMES, getBuiltinTheme } from '../theme/builtin';
import {
  CUSTOM_BOOT_STYLE_ID,
  CUSTOM_STYLE_ID,
  THEME_CACHE_STORAGE_KEY,
  buildCustomThemesCss,
  buildThemeCache,
  colorSchemeFromCss,
  isCustomThemeId,
  parseThemeCache,
  plexusDefaultFor,
  findDeletedReferences,
  planDeletedReplacement,
  resolveRenderedThemeId,
} from '../theme/custom';

export interface AppearanceContextValue {
  appearance: Appearance;
  resolvedThemeId: string;
  resolvedTheme: ThemeDef;
  colorScheme: 'light' | 'dark';
  /** Built-in themes followed by loaded custom themes. */
  themes: readonly ThemeDef[];
  builtinThemes: readonly ThemeDef[];
  customThemes: readonly CustomThemeDef[];
  /** Loaded custom themes whose colors failed to compile (kept so admins can fix or delete them). */
  brokenCustomThemes: readonly CustomThemeDef[];
  /** Whether the OS currently prefers a dark color scheme. */
  prefersDark: boolean;
  /** Look up a built-in or loaded custom theme by id. */
  getTheme: (id: string) => ThemeDef | undefined;
  /** Replace the custom theme list (marks it loaded). */
  setCustomThemes: (themes: readonly CustomThemeDef[]) => void;
  /** Add or replace one custom theme right now (a just-saved one), before the query cache notifies. */
  upsertCustomTheme: (theme: CustomThemeDef) => void;
  /** Swap references to removed custom ids for the Plexus default of each slot. */
  replaceThemeReferences: (removedIds: readonly string[]) => void;
  /**
   * Pick a theme. `scheme` is for a theme not in `themes` yet (just saved); it
   * decides which system-mode slot is rewritten.
   */
  pickTheme: (id: string, scheme?: 'light' | 'dark') => void;
  setMode: (mode: AppearanceMode) => void;
  setSlot: (slot: 'light' | 'dark', id: string) => void;
}

const AppearanceContext = React.createContext<AppearanceContextValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return true;
  }
}

function readInitial(): Appearance {
  return parseAppearance(safeGet(APPEARANCE_STORAGE_KEY), safeGet(LEGACY_THEME_KEY)).appearance;
}

const BUILTIN_IDS: ReadonlySet<string> = new Set(BUILTIN_THEMES.map((t) => t.id));

function readBootCache(): Record<string, string> {
  return parseThemeCache(safeGet(THEME_CACHE_STORAGE_KEY));
}

export const AppearanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appearance, setAppearance] = React.useState<Appearance>(readInitial);
  const [prefersDark, setPrefersDark] = React.useState<boolean>(readPrefersDark);

  const [customRaw, setCustomRaw] = React.useState<readonly CustomThemeDef[]>([]);
  const [customThemesLoaded, setCustomThemesLoaded] = React.useState(false);
  // CSS the boot script injected for custom themes, read once. A custom id that
  // is not loaded yet renders as itself only if it is in here.
  const [bootCache] = React.useState<Record<string, string>>(readBootCache);

  const build = React.useMemo(() => buildCustomThemesCss(customRaw), [customRaw]);
  const customThemes = React.useMemo(
    () => customRaw.filter((t) => !build.failed.includes(t.id)),
    [customRaw, build]
  );
  const brokenCustomThemes = React.useMemo(
    () => customRaw.filter((t) => build.failed.includes(t.id)),
    [customRaw, build]
  );
  const themes = React.useMemo<readonly ThemeDef[]>(
    () => [...BUILTIN_THEMES, ...customThemes],
    [customThemes]
  );

  const getTheme = React.useCallback(
    (id: string): ThemeDef | undefined =>
      getBuiltinTheme(id) ?? customThemes.find((t) => t.id === id),
    [customThemes]
  );

  const avail = React.useMemo(
    () => ({
      builtinIds: BUILTIN_IDS,
      loadedCustomIds: customThemesLoaded ? new Set(customThemes.map((t) => t.id)) : null,
      bootCachedIds: new Set(Object.keys(bootCache)),
    }),
    [customThemesLoaded, customThemes, bootCache]
  );

  const resolvedThemeId = resolveRenderedThemeId(appearance, prefersDark, avail);
  // For an unloaded (boot-cached) custom theme there is no def yet: consumers
  // see the Plexus fallback def while the DOM uses the cached CSS.
  const resolvedTheme =
    getTheme(resolvedThemeId) ?? getBuiltinTheme(plexusDefaultFor(prefersDark))!;
  const colorScheme: 'light' | 'dark' = getTheme(resolvedThemeId)
    ? resolvedTheme.colorScheme
    : isCustomThemeId(resolvedThemeId)
      ? (colorSchemeFromCss(bootCache[resolvedThemeId]) ?? (prefersDark ? 'dark' : 'light'))
      : resolvedTheme.colorScheme;

  // Follow OS scheme changes.
  React.useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Keep other tabs in sync. Only updates state; the persistence effect below
  // skips the write because the serialized value already matches storage.
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== APPEARANCE_STORAGE_KEY && e.key !== null) return;
      setAppearance(parseAppearance(e.newValue, null).appearance);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Persist (only when the serialized value changed) and apply to the DOM. The
  // boot script already set data-theme before React mounted, so the mount run
  // is normally a no-op for the DOM.
  React.useEffect(() => {
    try {
      const serialized = JSON.stringify(appearance);
      if (window.localStorage.getItem(APPEARANCE_STORAGE_KEY) !== serialized) {
        window.localStorage.setItem(APPEARANCE_STORAGE_KEY, serialized);
      }
      window.localStorage.removeItem(LEGACY_THEME_KEY);
      window.localStorage.removeItem(LEGACY_ACCENT_KEY);
    } catch {
      // storage unavailable: appearance still applies for this session
    }
  }, [appearance]);

  React.useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.theme !== resolvedThemeId) root.dataset.theme = resolvedThemeId;
    if (root.dataset.accent !== undefined) delete root.dataset.accent;
  }, [resolvedThemeId]);

  // Inject compiled custom themes. Waits for the first real load so the boot
  // style (supplying the same CSS) is never removed before replacements exist.
  React.useEffect(() => {
    for (const id of build.failed) {
      console.warn(`[appearance] custom theme "${id}" failed to compile; skipped`);
    }
  }, [build]);

  React.useEffect(() => {
    if (!customThemesLoaded) return;
    let el = document.getElementById(CUSTOM_STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = CUSTOM_STYLE_ID;
      document.head.appendChild(el);
    }
    if (el.textContent !== build.css) el.textContent = build.css;
    document.getElementById(CUSTOM_BOOT_STYLE_ID)?.remove();
  }, [customThemesLoaded, build.css]);

  // Boot cache: CSS for only the referenced custom ids. Never touched before
  // the list has loaded, otherwise mounting with [] would wipe it. Also left
  // alone while a referenced id is missing from the list: another tab may have
  // just created it and written the cache for it.
  const hasMissingReference =
    findDeletedReferences(
      appearance,
      customRaw.map((t) => t.id)
    ).length > 0;
  React.useEffect(() => {
    if (!customThemesLoaded || hasMissingReference) return;
    try {
      const cache = buildThemeCache(appearance, build.cssById);
      if (Object.keys(cache).length === 0) {
        window.localStorage.removeItem(THEME_CACHE_STORAGE_KEY);
      } else {
        const serialized = JSON.stringify(cache);
        if (window.localStorage.getItem(THEME_CACHE_STORAGE_KEY) !== serialized) {
          window.localStorage.setItem(THEME_CACHE_STORAGE_KEY, serialized);
        }
      }
    } catch {
      // storage unavailable: next boot just falls back
    }
  }, [customThemesLoaded, hasMissingReference, appearance, build.cssById]);

  const setCustomThemes = React.useCallback((list: readonly CustomThemeDef[]) => {
    setCustomRaw(list);
    setCustomThemesLoaded(true);
  }, []);

  const upsertCustomTheme = React.useCallback((theme: CustomThemeDef) => {
    setCustomRaw((prev) =>
      prev.some((t) => t.id === theme.id)
        ? prev.map((t) => (t.id === theme.id ? theme : t))
        : [...prev, theme]
    );
  }, []);

  const replaceThemeReferences = React.useCallback(
    (removedIds: readonly string[]) => {
      setAppearance((prev) => planDeletedReplacement(prev, removedIds, prefersDark).appearance);
    },
    [prefersDark]
  );

  const pickTheme = React.useCallback(
    (id: string, knownScheme?: 'light' | 'dark') => {
      const scheme = knownScheme ?? getTheme(id)?.colorScheme ?? 'dark';
      setAppearance((prev) => withThemePicked(prev, id, scheme));
    },
    [getTheme]
  );

  const setMode = React.useCallback(
    (mode: AppearanceMode) => {
      setAppearance((prev) => {
        // Pin the on-screen theme, except keep an unloaded custom reference
        // as-is so it is not replaced by the Plexus fallback.
        const referenced = resolveThemeId(prev, prefersDark);
        const pinned =
          isCustomThemeId(referenced) && !customThemesLoaded
            ? referenced
            : resolveRenderedThemeId(prev, prefersDark, avail);
        return withMode(prev, mode, pinned);
      });
    },
    [prefersDark, customThemesLoaded, avail]
  );

  const setSlot = React.useCallback((slot: 'light' | 'dark', id: string) => {
    setAppearance((prev) => ({ ...prev, [slot]: id }));
  }, []);

  const value = React.useMemo<AppearanceContextValue>(
    () => ({
      appearance,
      resolvedThemeId,
      resolvedTheme,
      colorScheme,
      themes,
      builtinThemes: BUILTIN_THEMES,
      customThemes,
      brokenCustomThemes,
      prefersDark,
      getTheme,
      setCustomThemes,
      upsertCustomTheme,
      replaceThemeReferences,
      pickTheme,
      setMode,
      setSlot,
    }),
    [
      appearance,
      resolvedThemeId,
      resolvedTheme,
      colorScheme,
      themes,
      customThemes,
      brokenCustomThemes,
      prefersDark,
      getTheme,
      setCustomThemes,
      upsertCustomTheme,
      replaceThemeReferences,
      pickTheme,
      setMode,
      setSlot,
    ]
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
};

export const useAppearance = (): AppearanceContextValue => {
  const ctx = React.useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used within AppearanceProvider');
  return ctx;
};

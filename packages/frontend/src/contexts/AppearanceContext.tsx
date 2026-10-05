import React from 'react';
import type { ThemeDef } from '@plexus/shared';
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
import {
  BUILTIN_THEMES,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  getBuiltinTheme,
} from '../theme/builtin';

interface AppearanceContextValue {
  appearance: Appearance;
  resolvedThemeId: string;
  resolvedTheme: ThemeDef;
  colorScheme: 'light' | 'dark';
  themes: readonly ThemeDef[];
  pickTheme: (id: string) => void;
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

/**
 * The theme actually on screen. Unknown ids (e.g. custom themes that have not
 * loaded yet) render the Plexus fallback for the current OS scheme without
 * rewriting storage.
 */
function resolveTheme(a: Appearance, prefersDark: boolean): ThemeDef {
  return (
    getBuiltinTheme(resolveThemeId(a, prefersDark)) ??
    getBuiltinTheme(prefersDark ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID)!
  );
}

export const AppearanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appearance, setAppearance] = React.useState<Appearance>(readInitial);
  const [prefersDark, setPrefersDark] = React.useState<boolean>(readPrefersDark);

  const resolvedTheme = resolveTheme(appearance, prefersDark);
  const resolvedThemeId = resolvedTheme.id;
  const colorScheme = resolvedTheme.colorScheme;

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

  const pickTheme = React.useCallback((id: string) => {
    const scheme = getBuiltinTheme(id)?.colorScheme ?? 'dark';
    setAppearance((prev) => withThemePicked(prev, id, scheme));
  }, []);

  const setMode = React.useCallback(
    (mode: AppearanceMode) => {
      setAppearance((prev) => withMode(prev, mode, resolveTheme(prev, prefersDark).id));
    },
    [prefersDark]
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
      themes: BUILTIN_THEMES,
      pickTheme,
      setMode,
      setSlot,
    }),
    [appearance, resolvedThemeId, resolvedTheme, colorScheme, pickTheme, setMode, setSlot]
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
};

export const useAppearance = (): AppearanceContextValue => {
  const ctx = React.useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used within AppearanceProvider');
  return ctx;
};

/**
 * Appearance state: which theme(s) the UI renders with. Pure logic only (no
 * React, no `window`); AppearanceContext wires it to storage and the DOM.
 * The boot script in index.html mirrors the parse/resolve rules below.
 */

import { DEFAULT_DARK_THEME_ID, DEFAULT_LIGHT_THEME_ID } from './ids';

export type AppearanceMode = 'single' | 'system';

export interface Appearance {
  mode: AppearanceMode;
  /** Theme id used in `single` mode. */
  theme: string;
  /** Theme id used in `system` mode when the OS prefers light. */
  light: string;
  /** Theme id used in `system` mode when the OS prefers dark. */
  dark: string;
  /** UI scale multiplier; one of SCALE_PRESETS. */
  scale: number;
}

export const APPEARANCE_STORAGE_KEY = 'plexus.appearance';
export const LEGACY_THEME_KEY = 'plexus.theme';
export const LEGACY_ACCENT_KEY = 'plexus.accent';

export const SCALE_PRESETS = [0.875, 0.9375, 1, 1.125, 1.25] as const;

export const DEFAULT_APPEARANCE: Appearance = {
  mode: 'system',
  theme: DEFAULT_DARK_THEME_ID,
  light: DEFAULT_LIGHT_THEME_ID,
  dark: DEFAULT_DARK_THEME_ID,
  scale: 1,
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function snapScale(v: unknown): number {
  return typeof v === 'number' && (SCALE_PRESETS as readonly number[]).includes(v) ? v : 1;
}

function fromLegacy(legacyTheme: string | null): Appearance {
  if (legacyTheme === 'light') {
    return { ...DEFAULT_APPEARANCE, mode: 'single', theme: DEFAULT_LIGHT_THEME_ID };
  }
  if (legacyTheme === 'dark') {
    return { ...DEFAULT_APPEARANCE, mode: 'single', theme: DEFAULT_DARK_THEME_ID };
  }
  return { ...DEFAULT_APPEARANCE };
}

/**
 * Parse the stored appearance. A value is valid when `mode` is 'single' or
 * 'system' and `theme`, `light` and `dark` are non-empty strings (an unknown
 * `scale` snaps to 1). Anything else falls back to the legacy `plexus.theme`
 * value; `migrated` is true whenever the stored value was absent or invalid.
 */
export function parseAppearance(
  raw: string | null,
  legacyTheme: string | null
): { appearance: Appearance; migrated: boolean } {
  if (raw !== null) {
    try {
      const v: unknown = JSON.parse(raw);
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        const o = v as Record<string, unknown>;
        if (
          (o.mode === 'single' || o.mode === 'system') &&
          isNonEmptyString(o.theme) &&
          isNonEmptyString(o.light) &&
          isNonEmptyString(o.dark)
        ) {
          return {
            appearance: {
              mode: o.mode,
              theme: o.theme,
              light: o.light,
              dark: o.dark,
              scale: snapScale(o.scale),
            },
            migrated: false,
          };
        }
      }
    } catch {
      // fall through to legacy migration
    }
  }
  return { appearance: fromLegacy(legacyTheme), migrated: true };
}

export function resolveThemeId(a: Appearance, prefersDark: boolean): string {
  if (a.mode === 'system') return prefersDark ? a.dark : a.light;
  return a.theme;
}

export function withThemePicked(
  a: Appearance,
  id: string,
  colorScheme: 'light' | 'dark'
): Appearance {
  if (a.mode === 'single') return { ...a, theme: id };
  return colorScheme === 'dark' ? { ...a, dark: id } : { ...a, light: id };
}

/**
 * Switch between `single` and `system`. Entering `single` pins the theme that
 * is on screen right now (`resolvedId`) so turning Match system off never
 * changes the look. Entering `system` keeps the light/dark slots as they were.
 */
export function withMode(a: Appearance, mode: AppearanceMode, resolvedId: string): Appearance {
  if (mode === a.mode) return a;
  if (mode === 'single') return { ...a, mode, theme: resolvedId };
  return { ...a, mode };
}

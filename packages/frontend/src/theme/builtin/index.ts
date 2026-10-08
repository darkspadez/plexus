import type { ThemeDef } from '@plexus/shared';
import { DAISY_THEMES } from './daisy';
import { DEFAULT_DARK_THEME_ID, DEFAULT_LIGHT_THEME_ID } from '../ids';
import { PLEXUS_DARK, PLEXUS_LIGHT } from './plexus';

export { DAISY_THEMES, PLEXUS_DARK, PLEXUS_LIGHT };

export const BUILTIN_THEMES: readonly ThemeDef[] = [PLEXUS_LIGHT, PLEXUS_DARK, ...DAISY_THEMES];

export { DEFAULT_DARK_THEME_ID, DEFAULT_LIGHT_THEME_ID };

export function getBuiltinTheme(id: string): ThemeDef | undefined {
  return BUILTIN_THEMES.find((t) => t.id === id);
}

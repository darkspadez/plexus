import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  parseAppearance,
  resolveThemeId,
  withMode,
  withThemePicked,
  type Appearance,
} from '../appearance';

const single: Appearance = {
  mode: 'single',
  theme: 'cupcake',
  light: 'plexus-light',
  dark: 'plexus-dark',
  scale: 1,
};
const system: Appearance = { ...single, mode: 'system' };

describe('parseAppearance', () => {
  it('uses valid JSON as-is and is not migrated', () => {
    const stored: Appearance = {
      mode: 'system',
      theme: 'dracula',
      light: 'cupcake',
      dark: 'synthwave',
      scale: 1.125,
    };
    const out = parseAppearance(JSON.stringify(stored), 'light');
    expect(out.migrated).toBe(false);
    expect(out.appearance).toEqual(stored);
  });

  it('drops unknown keys', () => {
    const out = parseAppearance(JSON.stringify({ ...DEFAULT_APPEARANCE, extra: 1 }), null);
    expect(out.appearance).toEqual(DEFAULT_APPEARANCE);
    expect('extra' in out.appearance).toBe(false);
  });

  it('snaps unknown or mistyped scale to 1', () => {
    expect(
      parseAppearance(JSON.stringify({ ...DEFAULT_APPEARANCE, scale: 3 }), null).appearance.scale
    ).toBe(1);
    expect(
      parseAppearance(JSON.stringify({ ...DEFAULT_APPEARANCE, scale: '1.25' }), null).appearance
        .scale
    ).toBe(1);
    expect(
      parseAppearance(JSON.stringify({ ...DEFAULT_APPEARANCE, scale: 0.875 }), null).appearance
        .scale
    ).toBe(0.875);
  });

  it('migrates from legacy light', () => {
    const out = parseAppearance(null, 'light');
    expect(out.migrated).toBe(true);
    expect(out.appearance).toEqual({
      ...DEFAULT_APPEARANCE,
      mode: 'single',
      theme: 'plexus-light',
    });
  });

  it('migrates from legacy dark', () => {
    const out = parseAppearance(null, 'dark');
    expect(out.migrated).toBe(true);
    expect(out.appearance).toEqual({
      ...DEFAULT_APPEARANCE,
      mode: 'single',
      theme: 'plexus-dark',
    });
  });

  it.each(['system', null, 'bogus'])('migrates legacy %s to the default', (legacy) => {
    const out = parseAppearance(null, legacy);
    expect(out.migrated).toBe(true);
    expect(out.appearance).toEqual(DEFAULT_APPEARANCE);
  });

  it('treats invalid JSON as absent and migrates', () => {
    const out = parseAppearance('{not json', 'light');
    expect(out.migrated).toBe(true);
    expect(out.appearance.theme).toBe('plexus-light');
  });

  it.each([
    ['wrong mode', { ...DEFAULT_APPEARANCE, mode: 'auto' }],
    ['non-string theme', { ...DEFAULT_APPEARANCE, theme: 5 }],
    ['empty light', { ...DEFAULT_APPEARANCE, light: '' }],
    ['missing dark', { mode: 'system', theme: 'a', light: 'b' }],
    ['array', []],
    ['null', null],
  ])('falls back to legacy for %s', (_name, value) => {
    const out = parseAppearance(JSON.stringify(value), 'dark');
    expect(out.migrated).toBe(true);
    expect(out.appearance).toEqual({
      ...DEFAULT_APPEARANCE,
      mode: 'single',
      theme: 'plexus-dark',
    });
  });
});

describe('resolveThemeId', () => {
  it('uses the light or dark slot in system mode', () => {
    expect(resolveThemeId(system, true)).toBe('plexus-dark');
    expect(resolveThemeId(system, false)).toBe('plexus-light');
  });

  it('uses theme in single mode regardless of OS preference', () => {
    expect(resolveThemeId(single, true)).toBe('cupcake');
    expect(resolveThemeId(single, false)).toBe('cupcake');
  });
});

describe('withThemePicked', () => {
  it('sets theme in single mode for both schemes', () => {
    expect(withThemePicked(single, 'dracula', 'dark').theme).toBe('dracula');
    expect(withThemePicked(single, 'nord', 'light').theme).toBe('nord');
    expect(withThemePicked(single, 'dracula', 'dark').dark).toBe('plexus-dark');
  });

  it('sets the matching slot in system mode', () => {
    const dark = withThemePicked(system, 'dracula', 'dark');
    expect(dark.dark).toBe('dracula');
    expect(dark.light).toBe('plexus-light');
    expect(dark.theme).toBe('cupcake');
    const light = withThemePicked(system, 'nord', 'light');
    expect(light.light).toBe('nord');
    expect(light.dark).toBe('plexus-dark');
  });

  it('does not mutate its input', () => {
    withThemePicked(system, 'dracula', 'dark');
    expect(system.dark).toBe('plexus-dark');
  });
});

describe('withMode', () => {
  it('pins the on-screen theme when leaving system mode', () => {
    const a: Appearance = { ...system, theme: 'cupcake', light: 'plexus-light', dark: 'dracula' };
    expect(withMode(a, 'single', 'plexus-light')).toEqual({
      ...a,
      mode: 'single',
      theme: 'plexus-light',
    });
  });

  it('keeps the light/dark slots when entering system mode', () => {
    const next = withMode({ ...single, light: 'nord', dark: 'dracula' }, 'system', 'cupcake');
    expect(next).toMatchObject({
      mode: 'system',
      theme: 'cupcake',
      light: 'nord',
      dark: 'dracula',
    });
  });

  it('returns the same object when the mode is unchanged', () => {
    expect(withMode(single, 'single', 'other')).toBe(single);
  });
});

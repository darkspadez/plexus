/**
 * Pure helpers for the custom theme editor: id generation, seeding a draft from
 * an existing theme, the Auto toggle for `-content` colors and color validation.
 * No React, no `window`.
 */
import {
  CssColorSchema,
  THEME_CONTENT_COLOR_KEYS,
  type CustomThemeDef,
  type ThemeDef,
} from '@plexus/shared';
import { parseColor } from './color';

export type ContentColorKey = (typeof THEME_CONTENT_COLOR_KEYS)[number];

export const DRAFT_THEME_ID = 'custom-draft';
export const MAX_THEME_NAME = 40;
export const RADIUS_PRESETS = ['0', '0.25rem', '0.5rem', '1rem', '2rem'] as const;
export const BORDER_PRESETS = ['1px', '1.5px', '2px'] as const;

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_MAX = 30;

function suffix(rand: () => number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ID_ALPHABET[Math.min(ID_ALPHABET.length - 1, Math.floor(rand() * ID_ALPHABET.length))];
  }
  return out;
}

/**
 * Lowercase `[a-z0-9-]` slug of a theme name: non-alphanumeric runs collapse to
 * `-`, ends are trimmed, cut to 30 characters, `theme` when nothing is left.
 */
export function slugifyThemeName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, SLUG_MAX)
      .replace(/-+$/g, '') || 'theme'
  );
}

/**
 * `custom-<slug>-<4 random chars>`. The slug is the lowercase name with
 * non-alphanumeric runs collapsed to `-`, trimmed and cut to 30 characters
 * (`theme` when nothing is left, e.g. a non-Latin name). Regenerates the suffix
 * on a collision with `existingIds`. `rand` returns a number in [0, 1).
 */
export function slugThemeId(
  name: string,
  rand: () => number = Math.random,
  existingIds: Iterable<string> = []
): string {
  const slug = slugifyThemeName(name);
  const taken = new Set(existingIds);
  for (let attempt = 0; ; attempt++) {
    // Grow the suffix if 4 chars keep colliding (practically unreachable).
    const id = `custom-${slug}-${suffix(rand, 4 + Math.floor(attempt / 20))}`;
    if (!taken.has(id)) return id;
  }
}

/** `0rem` is the `0` preset; keep one spelling so the shape controls match it. */
export function normalizeRadius(radius: CustomThemeDef['radius']): CustomThemeDef['radius'] {
  const fix = (v: string) => (v === '0rem' ? '0' : v);
  return { box: fix(radius.box), field: fix(radius.field), selector: fix(radius.selector) };
}

/** Any theme (built-in or custom) as a draft: overrides dropped, id reset. */
export function seedFromTheme(def: ThemeDef, name: string): CustomThemeDef {
  return {
    id: DRAFT_THEME_ID,
    name: name.slice(0, MAX_THEME_NAME),
    colorScheme: def.colorScheme,
    colors: { ...def.colors },
    radius: normalizeRadius(def.radius),
    border: def.border,
    depth: def.depth,
  };
}

/** Muted note for a seed source whose `overrides` a custom theme cannot carry. */
export function seedNoteFor(def: ThemeDef): string | undefined {
  return def.overrides && Object.keys(def.overrides).length > 0
    ? `Seeded from ${def.name}; exact surface tweaks aren't carried over.`
    : undefined;
}

/**
 * Switch a `-content` color between Auto (key removed, the compiler derives it)
 * and manual (key seeded with the derived value so nothing visibly changes).
 */
export function setContentAuto(
  draft: CustomThemeDef,
  key: ContentColorKey,
  auto: boolean,
  derivedHex: string
): CustomThemeDef {
  const colors = { ...draft.colors };
  if (auto) delete colors[key];
  else colors[key] = derivedHex;
  return { ...draft, colors };
}

/** Compiled var holding the derived value of a `-content` key (`error` compiles as `danger`). */
export function derivedContentVar(key: ContentColorKey): string {
  const role = key.slice(0, -'-content'.length);
  return `${role === 'error' ? 'danger' : role}-foreground`;
}

/** Why a color string is unusable, or undefined when valid. */
export function colorError(value: string): string | undefined {
  const parsed = CssColorSchema.safeParse(value);
  if (!parsed.success) return 'Enter a hex, rgb(), hsl(), oklch(), lab(), lch() or color() value';
  try {
    parseColor(parsed.data);
  } catch {
    return 'This color cannot be parsed';
  }
  return undefined;
}

export type HeldColors = Partial<Record<string, string>>;

/**
 * Per-key color problems. A held (typed but invalid) value takes precedence
 * over the draft value; an absent content color is Auto and always valid.
 */
export function colorErrorsFor(
  colors: Readonly<Record<string, string | undefined>>,
  held: HeldColors,
  keys: readonly string[]
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of keys) {
    const value = held[key] ?? colors[key];
    if (value === undefined) continue;
    const message = colorError(value);
    if (message) errors[key] = message;
  }
  return errors;
}

/** Toggle Auto on a `-content` key and drop any held invalid text for it. */
export function applyContentAuto(
  draft: CustomThemeDef,
  held: HeldColors,
  key: ContentColorKey,
  auto: boolean,
  derivedHex: string
): { draft: CustomThemeDef; held: HeldColors } {
  const nextHeld = { ...held };
  delete nextHeld[key];
  return { draft: setContentAuto(draft, key, auto, derivedHex), held: nextHeld };
}

/** Segmented options for a tier: the presets, plus the current value when it is not one. */
export function withCurrentOption(
  presets: readonly string[],
  value: string
): { value: string; label: string }[] {
  const opts = presets.map((p) => ({ value: p, label: p }));
  return presets.includes(value) ? opts : [{ value, label: `Current (${value})` }, ...opts];
}

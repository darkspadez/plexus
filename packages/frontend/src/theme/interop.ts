/**
 * Theme import / export. Reads a daisyUI theme (the CSS block from
 * daisyui.com/theme-generator, a `[data-theme]` / `:root` rule, a daisyUI
 * `theme/object.js` entry, or a Plexus theme JSON) into a draft, and writes a
 * draft back out as daisyUI CSS or JSON.
 *
 * Pasted text is only ever parsed into plain values that then pass
 * `CustomThemeDefSchema`; it is never evaluated or injected anywhere.
 * No React, no `window`.
 */
import {
  CustomThemeDefSchema,
  THEME_CONTENT_COLOR_KEYS,
  THEME_REQUIRED_COLOR_KEYS,
  type CustomThemeDef,
  type ThemeColorKey,
} from '@plexus/shared';
import { parseColor } from './color';
import {
  BORDER_PRESETS,
  MAX_THEME_NAME,
  colorError,
  normalizeRadius,
  slugifyThemeName,
} from './editor';

export type ImportResult =
  | {
      ok: true;
      draft: Omit<CustomThemeDef, 'id'>;
      /** False when the input carried no name and the default was used. */
      nameFromInput: boolean;
      warnings: string[];
    }
  | { ok: false; error: string };

const COLOR_KEYS: readonly ThemeColorKey[] = [
  ...THEME_REQUIRED_COLOR_KEYS,
  ...THEME_CONTENT_COLOR_KEYS,
];
const COLOR_KEY_SET: ReadonlySet<string> = new Set(COLOR_KEYS);
const RADIUS_KEYS = ['box', 'field', 'selector'] as const;
type RadiusKey = (typeof RADIUS_KEYS)[number];

const DEFAULT_RADIUS: Record<RadiusKey, string> = {
  box: '0.5rem',
  field: '0.25rem',
  selector: '0.5rem',
};
const DEFAULT_BORDER = '1px';
/** Name given to an import that carries none. */
export const DEFAULT_IMPORT_NAME = 'Imported theme';

/** daisyUI keys that carry nothing Plexus uses; dropped without a warning. */
const SILENT_KEYS: ReadonlySet<string> = new Set(['default', 'prefersdark', '--noise']);

/** Loosely typed values collected from either format, before normalization. */
interface Raw {
  name?: unknown;
  colorScheme?: unknown;
  colors: Record<string, unknown>;
  radius: Partial<Record<RadiusKey, unknown>>;
  border?: unknown;
  depth?: unknown;
  warnings: string[];
}

function emptyRaw(): Raw {
  return { colors: {}, radius: {}, warnings: [] };
}

/** Cap a pasted key echoed in a warning. */
function clip(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) {
    return v.slice(1, -1).trim();
  }
  return v;
}

/** Apply one daisyUI-vocabulary declaration (`--color-primary`, `color-scheme`, ...). */
function applyDeclaration(raw: Raw, rawKey: string, value: unknown): void {
  const key = rawKey.trim().toLowerCase();
  const str = typeof value === 'string' ? value : value === undefined ? '' : String(value);
  if (SILENT_KEYS.has(key) || key.startsWith('--size-')) return;
  if (key === 'name') raw.name = unquote(str);
  else if (key === 'color-scheme') raw.colorScheme = unquote(str).toLowerCase();
  else if (key === '--border') raw.border = str.trim();
  else if (key === '--depth') raw.depth = str.trim();
  else if (
    key.startsWith('--radius-') &&
    (RADIUS_KEYS as readonly string[]).includes(key.slice(9))
  ) {
    raw.radius[key.slice(9) as RadiusKey] = str.trim();
  } else if (key.startsWith('--color-') && COLOR_KEY_SET.has(key.slice(8))) {
    raw.colors[key.slice(8)] = typeof value === 'string' ? value.trim() : value;
  } else {
    raw.warnings.push(`Ignored ${clip(rawKey.trim())}`);
  }
}

function parseCss(text: string): Raw | string {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const open = stripped.indexOf('{');
  if (open === -1) return 'No theme block found. Paste a CSS block or JSON.';
  const close = stripped.indexOf('}', open + 1);
  if (close === -1) return 'The theme block is missing its closing brace';
  const raw = emptyRaw();
  for (const decl of stripped.slice(open + 1, close).split(';')) {
    if (!decl.trim()) continue;
    const colon = decl.indexOf(':');
    if (colon === -1) {
      raw.warnings.push(`Ignored "${clip(decl.trim())}"`);
      continue;
    }
    applyDeclaration(raw, decl.slice(0, colon), decl.slice(colon + 1));
  }
  // The generator writes a slug (`gate-dark`); show it as a title.
  if (typeof raw.name === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.name)) {
    raw.name = raw.name
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  if (stripped.slice(close + 1).trim()) {
    raw.warnings.push('Ignored text after the first block');
  }
  return raw;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A Plexus theme object (`colors`, `radius`, ...) or a daisyUI object entry. */
function rawFromObject(obj: Record<string, unknown>, wrapperName?: string): Raw {
  const raw = emptyRaw();
  const daisyStyle =
    !('colors' in obj) && Object.keys(obj).some((k) => k.startsWith('--') || k === 'color-scheme');
  if (daisyStyle) {
    for (const [k, v] of Object.entries(obj)) applyDeclaration(raw, k, v);
  } else {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'id') continue;
      else if (k === 'name') raw.name = v;
      else if (k === 'colorScheme') raw.colorScheme = v;
      else if (k === 'border') raw.border = v;
      else if (k === 'depth') raw.depth = v;
      else if (k === 'colors' && isRecord(v)) {
        for (const [ck, cv] of Object.entries(v)) {
          if (COLOR_KEY_SET.has(ck)) raw.colors[ck] = cv;
          else raw.warnings.push(`Ignored colors.${clip(ck)}`);
        }
      } else if (k === 'radius' && isRecord(v)) {
        for (const [rk, rv] of Object.entries(v)) {
          if ((RADIUS_KEYS as readonly string[]).includes(rk)) raw.radius[rk as RadiusKey] = rv;
          else raw.warnings.push(`Ignored radius.${clip(rk)}`);
        }
      } else raw.warnings.push(`Ignored ${clip(k)}`);
    }
  }
  if (raw.name === undefined && wrapperName !== undefined) raw.name = wrapperName;
  return raw;
}

function parseJson(text: string): Raw | string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    return `Not valid JSON: ${err instanceof Error ? err.message : 'parse error'}`;
  }
  if (!isRecord(value)) return 'Expected a JSON object';
  const direct =
    'colors' in value || Object.keys(value).some((k) => k.startsWith('--') || k === 'color-scheme');
  if (!direct) {
    const entries = Object.entries(value);
    if (entries.length === 1 && isRecord(entries[0][1])) {
      return rawFromObject(entries[0][1], entries[0][0]);
    }
  }
  return rawFromObject(value);
}

function inferScheme(base100: unknown): 'light' | 'dark' | undefined {
  if (typeof base100 !== 'string') return undefined;
  try {
    return parseColor(base100).l < 0.5 ? 'dark' : 'light';
  } catch {
    return undefined;
  }
}

function snapBorder(value: unknown, warnings: string[]): string {
  const m = /^\s*(\d*\.?\d+)\s*(px)?\s*$/i.exec(String(value));
  if (!m) {
    warnings.push(
      `Ignored invalid --border "${String(value).slice(0, 20)}"; using ${DEFAULT_BORDER}`
    );
    return DEFAULT_BORDER;
  }
  const n = Number(m[1]);
  let best: string = BORDER_PRESETS[0];
  for (const preset of BORDER_PRESETS) {
    if (Math.abs(parseFloat(preset) - n) < Math.abs(parseFloat(best) - n)) best = preset;
  }
  const given = String(value).trim();
  if (given !== best) warnings.push(`Border ${given} snapped to ${best}`);
  return best;
}

function snapDepth(value: unknown, warnings: string[]): 0 | 1 {
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) {
    warnings.push('Ignored invalid --depth; using 0');
    return 0;
  }
  const snapped = n > 0 ? 1 : 0;
  if (n !== 0 && n !== 1) warnings.push(`Depth ${n} snapped to ${snapped}`);
  return snapped;
}

function describeIssue(path: PropertyKey[], message: string): string {
  const where = path.map(String).join('.');
  if (path[0] === 'colors') return `${where}: not a valid CSS color`;
  if (path[0] === 'radius') return `${where}: must be 0 or a rem value such as 0.5rem`;
  return where ? `${where}: ${message}` : message;
}

/**
 * Parse pasted theme text (daisyUI CSS block or JSON) into a draft. Ignored
 * and defaulted values are listed in `warnings`.
 */
export function importTheme(text: string): ImportResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Paste a theme first' };

  const parsed = trimmed.startsWith('{') ? parseJson(trimmed) : parseCss(trimmed);
  if (typeof parsed === 'string') return { ok: false, error: parsed };
  const raw = parsed;
  const warnings = [...raw.warnings];

  // Collapse newlines/tabs inside values (`oklch(\n 50% ...)`); the schema still validates.
  for (const k of Object.keys(raw.colors)) {
    const v = raw.colors[k];
    if (typeof v === 'string') raw.colors[k] = v.replace(/\s+/g, ' ').trim();
  }

  for (const key of THEME_REQUIRED_COLOR_KEYS) {
    if (raw.colors[key] === undefined) return { ok: false, error: `Missing --color-${key}` };
  }

  let colorScheme: unknown = raw.colorScheme;
  if (colorScheme !== 'light' && colorScheme !== 'dark') {
    const given = colorScheme !== undefined && colorScheme !== '';
    colorScheme = inferScheme(raw.colors['base-100']) ?? 'light';
    warnings.push(
      given
        ? `Unsupported color-scheme "${clip(String(raw.colorScheme))}"; inferred ${String(colorScheme)} from base-100`
        : `No color-scheme; inferred ${String(colorScheme)} from --color-base-100`
    );
  }

  const radius = {} as Record<RadiusKey, unknown>;
  for (const key of RADIUS_KEYS) {
    const v = raw.radius[key];
    if (v === undefined || v === '') {
      radius[key] = DEFAULT_RADIUS[key];
      warnings.push(`No --radius-${key}; using ${DEFAULT_RADIUS[key]}`);
    } else {
      radius[key] = typeof v === 'string' ? v.trim() : v;
    }
  }

  let border: unknown;
  if (raw.border === undefined || raw.border === '') {
    border = DEFAULT_BORDER;
    warnings.push(`No --border; using ${DEFAULT_BORDER}`);
  } else {
    border = snapBorder(raw.border, warnings);
  }

  let depth: unknown;
  if (raw.depth === undefined || raw.depth === '') {
    depth = 0;
    warnings.push('No --depth; using 0');
  } else {
    depth = snapDepth(raw.depth, warnings);
  }

  let name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const nameFromInput = name.length > 0;
  if (!name) {
    name = DEFAULT_IMPORT_NAME;
    warnings.push(`No name; using "${DEFAULT_IMPORT_NAME}"`);
  } else if (name.length > MAX_THEME_NAME) {
    name = name.slice(0, MAX_THEME_NAME).trim();
    warnings.push(`Name shortened to ${MAX_THEME_NAME} characters`);
  }

  const result = CustomThemeDefSchema.omit({ id: true }).safeParse({
    name,
    colorScheme,
    colors: raw.colors,
    radius,
    border,
    depth,
  });
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, error: describeIssue(issue.path, issue.message) };
  }
  // The schema regex is a character allowlist; also make sure the browser can parse each color.
  for (const key of COLOR_KEYS) {
    const value = result.data.colors[key];
    if (value !== undefined && colorError(value) !== undefined) {
      return { ok: false, error: `colors.${key}: not a valid CSS color` };
    }
  }
  return {
    ok: true,
    draft: { ...result.data, radius: normalizeRadius(result.data.radius) },
    nameFromInput,
    warnings,
  };
}

export function exportThemeJson(def: CustomThemeDef): string {
  return `${JSON.stringify(def, null, 2)}\n`;
}

export function exportThemeDaisyCss(def: CustomThemeDef): string {
  const lines = [
    `name: "${slugifyThemeName(def.name)}";`,
    'default: false;',
    'prefersdark: false;',
    `color-scheme: "${def.colorScheme}";`,
  ];
  for (const key of COLOR_KEYS) {
    const value = def.colors[key];
    if (value !== undefined) lines.push(`--color-${key}: ${value};`);
  }
  lines.push(
    `--radius-selector: ${def.radius.selector};`,
    `--radius-field: ${def.radius.field};`,
    `--radius-box: ${def.radius.box};`,
    '--size-selector: 0.25rem;',
    '--size-field: 0.25rem;',
    `--border: ${def.border};`,
    `--depth: ${def.depth};`,
    '--noise: 0;'
  );
  return `@plugin "daisyui/theme" {\n${lines.map((l) => `  ${l}`).join('\n')}\n}\n`;
}

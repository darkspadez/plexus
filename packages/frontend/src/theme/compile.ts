import type { Oklch } from 'culori';
import type { ThemeDef } from '@plexus/shared';
import {
  composite,
  contrast,
  deltaE,
  ensureContrast,
  mix,
  oklchInGamut,
  parseColor,
  toCssWithAlpha,
  toHex,
} from './color';

export interface ContrastIssue {
  token: string;
  /** Worst-case ratio the input color achieved before adjustment. */
  ratio: number;
  min: number;
  /** Ratio of the color actually emitted; below `min` when the floor is unreachable. */
  outputRatio: number;
}

export interface CompiledTheme {
  id: string;
  /** CSS custom properties, keyed by name without the leading `--`. */
  vars: Record<string, string>;
  css: string;
  diagnostics: ContrastIssue[];
}

/** Minimum oklab distance between chart series colors. */
export const CHART_MIN_DELTA_E = 0.08;

const TEXT_MIN = 4.5;
const SUBTLE_TEXT_MIN = 3.0;
const CHART_MIN_CONTRAST = 3.0;
const CHART_COUNT = 5;
/** Below this ratio against the surface a role's tint is effectively invisible. */
const SUBTLE_BASE_MIN_CONTRAST = 1.5;
const SUBTLE_BASE_FIT = 3.0;
const FOCUS_MIN = 3.0;
const HUE_STEP = 72;
const SYNTH_MIN_CHROMA = 0.1;

const ROLES = [
  'primary',
  'secondary',
  'accent',
  'neutral',
  'info',
  'success',
  'warning',
  'danger',
  'critical',
] as const;
type Role = (typeof ROLES)[number];

export const COMPILED_TOKENS: readonly string[] = [
  'surface',
  'background',
  'surface-sunken',
  'surface-elevated',
  'surface-hover',
  'border',
  'border-strong',
  'foreground',
  'foreground-muted',
  'foreground-subtle',
  ...ROLES.flatMap((r) => [r, `${r}-foreground`, `${r}-subtle`, `${r}-text`]),
  'focus',
  'theme-radius-box',
  'theme-radius-field',
  'theme-radius-selector',
  'theme-border-width',
  'elevation-sm',
  'elevation-md',
  'elevation-lg',
  ...Array.from({ length: CHART_COUNT }, (_, i) => `chart-${i + 1}`),
];

const ELEVATION = {
  light: {
    sm: '0 1px 2px rgb(20 18 14 / 0.06), 0 1px 3px rgb(20 18 14 / 0.04)',
    md: '0 4px 12px rgb(20 18 14 / 0.08), 0 2px 4px rgb(20 18 14 / 0.04)',
    lg: '0 20px 60px rgb(20 18 14 / 0.18)',
  },
  dark: {
    sm: '0 1px 2px rgb(0 0 0 / 0.4)',
    md: '0 4px 12px rgb(0 0 0 / 0.5)',
    lg: '0 20px 60px rgb(0 0 0 / 0.5)',
  },
} as const;

const BLACK = parseColor('#000000');
const WHITE = parseColor('#ffffff');

export function compileTheme(def: ThemeDef, opts: { selector?: string } = {}): CompiledTheme {
  const selector = opts.selector ?? `[data-theme="${def.id}"]`;
  const scheme = def.colorScheme;
  const colors = def.colors;
  const vars: Record<string, string> = {};
  const diagnostics: ContrastIssue[] = [];

  const get = (key: string, value: string): Oklch => {
    try {
      return parseColor(value);
    } catch {
      throw new Error(`Unparseable color "${value}" for ${key}`);
    }
  };

  /** ensureContrast that records a diagnostic when it had to adjust. */
  const fit = (token: string, input: Oklch, bgs: Oklch[], min: number): Oklch => {
    const res = ensureContrast(input, bgs, min);
    if (res.adjusted) {
      diagnostics.push({ token, ratio: res.inputRatio, min, outputRatio: res.ratio });
    }
    return res.color;
  };

  const bases = [
    get('base-100', colors['base-100']),
    get('base-200', colors['base-200']),
    get('base-300', colors['base-300']),
  ];
  const bc = get('base-content', colors['base-content']);
  // Array.prototype.sort is stable, so ties keep base-100, 200, 300 order.
  const [surface, background, sunken] = [...bases].sort((a, b) => (b.l ?? 0) - (a.l ?? 0));

  vars['surface'] = toHex(surface);
  vars['background'] = toHex(background);
  vars['surface-sunken'] = toHex(sunken);
  vars['surface-elevated'] = toHex(mix(surface, bc, 0.04));
  vars['surface-hover'] = toHex(mix(surface, bc, 0.09));
  vars['border'] = toHex(mix(surface, bc, 0.12));
  vars['border-strong'] = toHex(mix(surface, bc, 0.25));

  // Pinned surfaces win over derived ones, and text must fit the FINAL values.
  const pinned = (token: 'surface-elevated' | 'surface-hover' | 'surface-sunken'): Oklch => {
    const o = def.overrides?.[token];
    return o !== undefined ? get(token, o) : parseColor(vars[token] as string);
  };
  const elevated = pinned('surface-elevated');
  const hover = pinned('surface-hover');
  const sunkenFinal = pinned('surface-sunken');
  const textBgs = [surface, background, sunkenFinal, elevated, hover];
  const foreground = fit('foreground', bc, textBgs, TEXT_MIN);
  const foregroundMuted = fit('foreground-muted', mix(bc, surface, 0.35), textBgs, TEXT_MIN);
  const foregroundSubtle = fit(
    'foreground-subtle',
    mix(bc, surface, 0.55),
    textBgs,
    SUBTLE_TEXT_MIN
  );
  vars['foreground'] = toHex(foreground);
  vars['foreground-muted'] = toHex(foregroundMuted);
  vars['foreground-subtle'] = toHex(foregroundSubtle);

  const inputs: Record<Role, { color: Oklch; content?: Oklch }> = {
    primary: roleInput('primary', 'primary-content'),
    secondary: roleInput('secondary', 'secondary-content'),
    accent: roleInput('accent', 'accent-content'),
    neutral: roleInput('neutral', 'neutral-content'),
    info: roleInput('info', 'info-content'),
    success: roleInput('success', 'success-content'),
    warning: roleInput('warning', 'warning-content'),
    danger: roleInput('error', 'error-content'),
    critical: { color: mix(get('warning', colors.warning), get('error', colors.error), 0.5) },
  };
  // An overridden role base is the role's input for every derived token.
  for (const role of ROLES) {
    const o = def.overrides?.[role];
    if (o !== undefined) inputs[role] = { ...inputs[role], color: get(role, o) };
  }

  function roleInput(key: keyof typeof colors, contentKey: keyof typeof colors) {
    const content = colors[contentKey];
    return {
      color: get(key, colors[key] as string),
      content: content === undefined ? undefined : get(contentKey, content),
    };
  }

  const subtleAlpha = scheme === 'light' ? 0.12 : 0.18;
  for (const role of ROLES) {
    const { color: c, content } = inputs[role];
    vars[role] = toHex(c);

    let fgInput = content;
    if (!fgInput) {
      const dark = mix(c, BLACK, 0.85);
      const light = mix(c, WHITE, 0.9);
      fgInput = contrast(dark, c) >= contrast(light, c) ? dark : light;
    }
    vars[`${role}-foreground`] = toHex(fit(`${role}-foreground`, fgInput, [c], TEXT_MIN));
    // A role that sits too close to the surface would give an invisible tint.
    const subtleBase =
      contrast(c, surface) < SUBTLE_BASE_MIN_CONTRAST
        ? ensureContrast(c, [surface], SUBTLE_BASE_FIT).color
        : c;
    vars[`${role}-subtle`] = toCssWithAlpha(subtleBase, subtleAlpha);
    // Text lands on every surface (including elevated and hovered rows) and on the
    // role's own tint over surface, background, sunken, elevated and hover.
    const tinted = [surface, background, sunkenFinal, elevated, hover].map((bg) =>
      composite(subtleBase, subtleAlpha, bg)
    );
    vars[`${role}-text`] = toHex(fit(`${role}-text`, c, [...textBgs, ...tinted], TEXT_MIN));
  }

  // Focus indicators are not text: 3:1 (WCAG 1.4.11) on every surface.
  vars['focus'] = toHex(fit('focus', inputs.accent.color, textBgs, FOCUS_MIN));

  // A unitless 0 is invalid inside min()/calc(); emit a length instead.
  const radiusValue = (v: string) => (v === '0' ? '0rem' : v);
  vars['theme-radius-box'] = radiusValue(def.radius.box);
  vars['theme-radius-field'] = radiusValue(def.radius.field);
  vars['theme-radius-selector'] = radiusValue(def.radius.selector);
  vars['theme-border-width'] = def.border;

  const elevation = ELEVATION[scheme];
  vars['elevation-sm'] = def.depth === 0 ? '0 0 #0000' : elevation.sm;
  vars['elevation-md'] = def.depth === 0 ? '0 0 #0000' : elevation.md;
  vars['elevation-lg'] = def.depth === 0 ? '0 0 #0000' : elevation.lg;

  // Distinctness must be measured on the same hex colors the browser renders.
  const chartFit = (c: Oklch) =>
    parseColor(toHex(ensureContrast(c, [surface], CHART_MIN_CONTRAST).color));
  const preferred = [
    inputs.primary.color,
    inputs.secondary.color,
    inputs.accent.color,
    inputs.info.color,
    inputs.neutral.color,
  ].map(chartFit);
  const fallback = [
    inputs.success.color,
    inputs.warning.color,
    inputs.danger.color,
    foregroundSubtle,
  ].map(chartFit);
  const usedFallback = new Set<number>();
  const chosen: Oklch[] = [];
  const distinct = (c: Oklch) => chosen.every((o) => deltaE(c, o) >= CHART_MIN_DELTA_E);
  /** Try chart-1's lightness first, then alternatives when gamut fitting collapses hues. */
  const synthesize = (): Oklch => {
    const base = chosen[0];
    const chroma = Math.max(base.c, SYNTH_MIN_CHROMA);
    for (const lightness of [base.l, 0.5, 0.35, 0.65, 0.2, 0.8]) {
      // Past one full turn the same hues repeat, so nudge each further lap.
      for (let k = 1; k <= HUE_STEP; k++) {
        const lap = Math.floor((k - 1) / (360 / HUE_STEP));
        const hue = (base.h ?? 0) + HUE_STEP * k + lap * 17;
        const cand = chartFit(oklchInGamut(lightness, chroma, hue));
        if (distinct(cand)) return cand;
      }
    }
    return chartFit(base);
  };
  for (let i = 0; i < CHART_COUNT; i++) {
    let pick = preferred[i];
    if (!distinct(pick)) {
      const fb = fallback.findIndex((c, j) => !usedFallback.has(j) && distinct(c));
      if (fb !== -1) {
        usedFallback.add(fb);
        pick = fallback[fb];
      } else {
        pick = synthesize();
      }
    }
    chosen.push(pick);
    vars[`chart-${i + 1}`] = toHex(pick);
  }

  const overridden: string[] = [];
  for (const [k, v] of Object.entries(def.overrides ?? {})) {
    if (!COMPILED_TOKENS.includes(k)) throw new Error(`Unknown theme override token: ${k}`);
    vars[k] = v;
    overridden.push(k);
  }
  const keptDiagnostics = diagnostics.filter((d) => !overridden.includes(d.token));

  const ordered: Record<string, string> = {};
  for (const token of COMPILED_TOKENS) ordered[token] = vars[token];

  const body = COMPILED_TOKENS.map((t) => `  --${t}: ${ordered[t]};`).join('\n');
  const css = `${selector} {\n  color-scheme: ${scheme};\n${body}\n}\n`;

  return { id: def.id, vars: ordered, css, diagnostics: keptDiagnostics };
}

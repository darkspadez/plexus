import {
  clampChroma,
  converter,
  differenceEuclidean,
  formatHex,
  formatHex8,
  interpolate,
  parse,
  toGamut,
  wcagContrast,
  type Color,
  type Oklch,
} from 'culori';

// Plain `culori` (not `culori/fn`) so every color mode is registered.

const toOklch = converter('oklch');
const toRgbConverter = converter('rgb');
const gamutMapToRgb = toGamut('rgb', 'oklch');
const oklabDistance = differenceEuclidean('oklab');

export function parseColor(css: string): Oklch {
  const parsed = parse(css);
  if (!parsed) throw new Error(`Unparseable color "${css}"`);
  const c = toOklch(parsed);
  // `none` channels come through as undefined; normalize l/c (hue may stay undefined).
  return { ...c, l: c.l ?? 0, c: c.c ?? 0 };
}

/** Gamut-mapped lowercase `#rrggbb`. */
export function toHex(c: Color): string {
  return formatHex(gamutMapToRgb(c));
}

/**
 * Monaco-safe color: `#rrggbb` when opaque, `#rrggbbaa` when translucent.
 * Accepts any CSS color string, including `rgb(r g b / a)` compiler output.
 */
export function toMonacoColor(css: string): string {
  const c = parseColor(css);
  const alpha = c.alpha ?? 1;
  return alpha < 1 ? formatHex8(gamutMapToRgb(c)) : toHex(c);
}

/** `rgb(r g b / a)` with integer channels and alpha to 2 decimals. */
export function toCssWithAlpha(c: Color, alpha: number): string {
  const rgb = toRgbConverter(gamutMapToRgb(c));
  const ch = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${ch(rgb.r)} ${ch(rgb.g)} ${ch(rgb.b)} / ${Number(alpha.toFixed(2))})`;
}

/**
 * Alpha-blend `fg` at `alpha` over the opaque `bg` in sRGB. Both inputs are
 * hex-quantized first, so the result matches what the browser composites from
 * the shipped values.
 */
export function composite(fg: Color, alpha: number, bg: Color): Oklch {
  const f = toRgbConverter(parse(toHex(fg)) as Color);
  const b = toRgbConverter(parse(toHex(bg)) as Color);
  // Browsers store alpha in 8 bits, so blend with the quantized value.
  const a = Math.round(alpha * 255) / 255;
  const blend = (x: number, y: number) => x * a + y * (1 - a);
  return toOklch(
    parse(
      formatHex({ mode: 'rgb', r: blend(f.r, b.r), g: blend(f.g, b.g), b: blend(f.b, b.b) })
    ) as Color
  );
}

/** Build an in-gamut OKLCH color (chroma clamped, hue kept). */
export function oklchInGamut(l: number, c: number, h: number): Oklch {
  return toOklch(clampChroma({ mode: 'oklch', l, c, h }, 'oklch'));
}

export function contrast(a: Color, b: Color): number {
  return wcagContrast(a, b);
}

/** Interpolate in oklab; `t` is the share of `b`. */
export function mix(a: Color, b: Color, t: number): Oklch {
  return toOklch(interpolate([a, b], 'oklab')(t));
}

export function deltaE(a: Color, b: Color): number {
  return oklabDistance(a, b);
}

export interface EnsureContrastResult {
  color: Oklch;
  adjusted: boolean;
  /** Worst-case ratio of the returned color against the backgrounds. */
  ratio: number;
  /** Worst-case ratio of the input, measured on the same (quantized) basis as `adjusted`. */
  inputRatio: number;
}

// Ratios are measured on the hex-quantized color, because that is what ships.
const quantize = (c: Color): Oklch => toOklch(parse(toHex(c)) as Color);

const worstRatio = (fg: Color, bgs: Color[]): number =>
  Math.min(...bgs.map((bg) => contrast(quantize(fg), quantize(bg))));

const SEARCH_ITERATIONS = 20;

/**
 * Return `fg` unchanged if it meets `min` against every bg. Otherwise move OKLCH
 * lightness (hue kept, chroma clamped into gamut) the smallest distance that does.
 */
export function ensureContrast(fg: Color, bgs: Color[], min: number): EnsureContrastResult {
  const start = toOklch(fg);
  const startRatio = worstRatio(start, bgs);
  if (startRatio >= min)
    return { color: start, adjusted: false, ratio: startRatio, inputRatio: startRatio };

  const l0 = start.l;
  const candidates: Oklch[] = [];
  for (const target of [0, 1]) {
    const at = (l: number): Oklch => quantize(clampChroma({ ...start, l }, 'oklch'));
    if (worstRatio(at(target), bgs) < min) continue;
    // lo always fails, hi always passes
    let lo = l0;
    let hi = target;
    for (let i = 0; i < SEARCH_ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      if (worstRatio(at(mid), bgs) >= min) hi = mid;
      else lo = mid;
    }
    candidates.push(at(hi));
  }

  if (candidates.length > 0) {
    const best = candidates.reduce((a, b) => (Math.abs(a.l - l0) <= Math.abs(b.l - l0) ? a : b));
    return { color: best, adjusted: true, ratio: worstRatio(best, bgs), inputRatio: startRatio };
  }

  const black = parseColor('#000000');
  const white = parseColor('#ffffff');
  const blackRatio = worstRatio(black, bgs);
  const whiteRatio = worstRatio(white, bgs);
  return blackRatio >= whiteRatio
    ? { color: black, adjusted: true, ratio: blackRatio, inputRatio: startRatio }
    : { color: white, adjusted: true, ratio: whiteRatio, inputRatio: startRatio };
}

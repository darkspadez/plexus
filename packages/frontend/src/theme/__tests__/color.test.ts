import { describe, expect, it } from 'vitest';
import {
  composite,
  contrast,
  deltaE,
  ensureContrast,
  mix,
  parseColor,
  toCssWithAlpha,
  toHex,
} from '../color';

describe('color helpers', () => {
  it('parses colors and rejects garbage', () => {
    expect(toHex(parseColor('#d97706'))).toBe('#d97706');
    expect(() => parseColor('not-a-color')).toThrow('not-a-color');
  });

  it('computes WCAG contrast', () => {
    expect(contrast(parseColor('#000000'), parseColor('#ffffff'))).toBeCloseTo(21, 5);
  });

  it('formats translucent colors', () => {
    expect(toCssWithAlpha(parseColor('#d97706'), 0.12)).toBe('rgb(217 119 6 / 0.12)');
  });

  it('gamut-maps out-of-gamut colors instead of clipping', () => {
    expect(toHex(parseColor('color(display-p3 1 0 0)'))).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('mixes with endpoints at t=0 and t=1', () => {
    const a = parseColor('#112233');
    const b = parseColor('#ddeeff');
    expect(toHex(mix(a, b, 0))).toBe('#112233');
    expect(toHex(mix(a, b, 1))).toBe('#ddeeff');
  });

  it('measures distance', () => {
    const a = parseColor('#112233');
    expect(deltaE(a, a)).toBe(0);
    expect(deltaE(parseColor('#000000'), parseColor('#ffffff'))).toBeGreaterThan(0.9);
  });
});

describe('parseColor normalization', () => {
  it('turns missing channels (none) into 0 for l and c', () => {
    const c = parseColor('oklch(none none 120)');
    expect(c.l).toBe(0);
    expect(c.c).toBe(0);
    const gray = parseColor('oklch(0.5 none none)');
    expect(gray.l).toBe(0.5);
    expect(gray.c).toBe(0);
    expect(gray.h).toBeUndefined();
  });
});

describe('composite', () => {
  it('alpha-blends in sRGB', () => {
    expect(toHex(composite(parseColor('#ff0000'), 0.5, parseColor('#000000')))).toBe('#800000');
    expect(toHex(composite(parseColor('#112233'), 1, parseColor('#ffffff')))).toBe('#112233');
    expect(toHex(composite(parseColor('#112233'), 0, parseColor('#ffffff')))).toBe('#ffffff');
  });
});

describe('ensureContrast', () => {
  const white = parseColor('#ffffff');
  const cream = parseColor('#f5efe0');

  it('leaves a passing color untouched', () => {
    const fg = parseColor('#111111');
    const res = ensureContrast(fg, [white, cream], 4.5);
    expect(res.adjusted).toBe(false);
    expect(toHex(res.color)).toBe('#111111');
    expect(res.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('fixes a failing color against every background', () => {
    const res = ensureContrast(parseColor('#f5d90a'), [white, cream], 4.5);
    expect(res.adjusted).toBe(true);
    expect(contrast(parseColor(toHex(res.color)), white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseColor(toHex(res.color)), cream)).toBeGreaterThanOrEqual(4.5);
    expect(res.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('moves toward light on a dark background', () => {
    const dark = parseColor('#101418');
    const res = ensureContrast(parseColor('#2a3038'), [dark], 4.5);
    expect(res.adjusted).toBe(true);
    expect(res.color.l).toBeGreaterThan(parseColor('#2a3038').l);
    expect(contrast(res.color, dark)).toBeGreaterThanOrEqual(4.5);
  });

  it('falls back to black or white when the minimum is unreachable', () => {
    const mid = parseColor('#777777');
    const res = ensureContrast(parseColor('#777777'), [mid], 21);
    expect(res.adjusted).toBe(true);
    expect(['#000000', '#ffffff']).toContain(toHex(res.color));
  });
});

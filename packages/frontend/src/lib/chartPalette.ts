/**
 * Chart palette helpers — reads CSS token values at call time so colors
 * respond to theme/accent changes without a page reload.
 *
 * chart-1 = accent (primary series)
 * chart-2..5 = fixed secondary palette from tokens.css
 */

/** Read a CSS custom property from :root at runtime */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Returns the 5-color ordered chart palette from CSS tokens */
export function getChartPalette(): string[] {
  return [
    cssVar('--chart-1') || '#D97706',
    cssVar('--chart-2') || '#7C5CFC',
    cssVar('--chart-3') || '#16A34A',
    cssVar('--chart-4') || '#0891B2',
    cssVar('--chart-5') || '#71717A',
  ];
}

/** Get a single chart color by 1-based index (wraps after 5) */
export function chartColor(index: number): string {
  const palette = getChartPalette();
  return palette[(index - 1) % palette.length];
}

/** Shared tooltip content style — surface-elevated bg, border, rounded-lg */
export const TOOLTIP_STYLE = {
  backgroundColor: 'var(--surface-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--foreground)',
  fontSize: '12px',
} as const;

/** Shared axis tick style — foreground-subtle, xs text */
export const AXIS_TICK_STYLE = {
  fill: 'var(--foreground-subtle)',
  fontSize: 11,
};

/** Shared grid props — horizontal only, dashed, border color */
export const GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: 'var(--border)',
  strokeOpacity: 0.5,
  vertical: false,
} as const;

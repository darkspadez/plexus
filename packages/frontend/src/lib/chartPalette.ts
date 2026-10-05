/**
 * Chart palette helpers. Return `var(--chart-N)` references so charts recolor
 * live when the theme changes, with no reload and no stale computed values.
 *
 * chart-1..5 = primary, secondary, accent, info, neutral, contrast-adjusted
 * and de-duplicated per theme by the theme compiler.
 */

const CHART_COUNT = 5;

/** Get a single chart color by 1-based index (wraps after 5) */
export function chartColor(index: number): string {
  const n = ((((index - 1) % CHART_COUNT) + CHART_COUNT) % CHART_COUNT) + 1;
  return `var(--chart-${n})`;
}

/** Shared tooltip content style — surface-elevated bg, border, rounded-lg */
export const TOOLTIP_STYLE = {
  backgroundColor: 'var(--surface-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'min(var(--theme-radius-field), 0.5rem)',
  color: 'var(--foreground)',
  fontSize: '0.75rem',
} as const;

/** Shared axis tick style — foreground-subtle, xs text */
export const AXIS_TICK_STYLE = {
  fill: 'var(--foreground-subtle)',
  fontSize: '0.6875rem',
};

/** Shared grid props — horizontal only, dashed, border color */
export const GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: 'var(--border)',
  strokeOpacity: 0.5,
  vertical: false,
} as const;

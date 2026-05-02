/**
 * Chart palette — DESIGN_SYSTEM.md §7.9. Series colors are read from CSS
 * variables so they follow theme + accent + the violet→rose collision swap.
 */
export const CHART_COLORS = {
  primary: 'var(--chart-1)',
  secondary: 'var(--chart-2)',
  tertiary: 'var(--chart-3)',
  quaternary: 'var(--chart-4)',
  muted: 'var(--chart-5)',
} as const;

export const CHART_SERIES = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.tertiary,
  CHART_COLORS.quaternary,
  CHART_COLORS.muted,
] as const;

export const seriesColor = (index: number): string => {
  return CHART_SERIES[index % CHART_SERIES.length]!;
};

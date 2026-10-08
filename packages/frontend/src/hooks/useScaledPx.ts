import { useAppearance } from '../contexts/AppearanceContext';

/** A px size multiplied by the UI scale, rounded; for APIs that take pixels (Monaco). */
export function useScaledPx(px: number): number {
  const { appearance } = useAppearance();
  return Math.round(px * appearance.scale);
}

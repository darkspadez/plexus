import React from 'react';

/**
 * Arrow-key focus movement across the buttons of a CSS grid. Left/right step
 * by one; up/down step by the rendered column count. Returns an onKeyDown
 * handler for the grid element.
 */
export function useGridKeyboardNav(gridRef: React.RefObject<HTMLElement | null>) {
  return React.useCallback(
    (e: React.KeyboardEvent) => {
      const grid = gridRef.current;
      if (!grid || e.altKey || e.metaKey || e.ctrlKey) return;
      const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
      let delta = steps[e.key];
      if (delta === undefined) {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
        delta = e.key === 'ArrowUp' ? -cols : cols;
      }
      const items = Array.from(grid.querySelectorAll<HTMLElement>('button'));
      const current = items.indexOf(document.activeElement as HTMLElement);
      if (current === -1) return;
      const next = items[current + delta];
      e.preventDefault();
      next?.focus();
    },
    [gridRef]
  );
}

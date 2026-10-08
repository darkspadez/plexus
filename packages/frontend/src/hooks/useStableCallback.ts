import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Returns a callback with a permanent identity that always calls the latest `fn`.
 * Use it for event handlers captured by memoized DataTable `columns`: a handler
 * that changes every render would rebuild the columns, and flexRender would
 * remount every cell (dropping focus from the buttons inside them). Only call
 * the result from event handlers, never during render (the latest `fn` is written in
 * a layout effect, so a render-time call can see the previous one).
 */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R
): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}

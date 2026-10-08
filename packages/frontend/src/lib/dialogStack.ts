/**
 * Module-level stack of open dialog ids. Only the top entry may react to
 * Escape or trap Tab, so nested dialogs close one at a time.
 */
const stack: string[] = [];

export function push(id: string): void {
  remove(id);
  stack.push(id);
}

export function remove(id: string): void {
  const at = stack.lastIndexOf(id);
  if (at !== -1) stack.splice(at, 1);
}

export function isTop(id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

export function size(): number {
  return stack.length;
}

/** Test helper: empties the stack. */
export function clear(): void {
  stack.length = 0;
}

/** A candidate element reduced to the facts the focusable filter needs. */
export interface FocusableCandidate {
  disabled: boolean;
  hidden: boolean;
  tabIndex: number;
}

export function isTabbable(c: FocusableCandidate): boolean {
  return !c.disabled && !c.hidden && c.tabIndex >= 0;
}

export type TabDecision =
  | { kind: 'native' }
  | { kind: 'container' }
  | { kind: 'focus'; index: number };

/**
 * Decides what Tab/Shift+Tab does inside a dialog with `count` tabbable elements.
 * - `activeIndex >= 0`: the active element is tabbable; only the edges wrap
 *   (last -> first, first -> last), everything else stays native.
 * - `activeIndex === -1`: the active element is not in the list (roving
 *   `tabindex=-1` item, or focus on body). `after[i]` says whether tabbable i
 *   follows it in document order; pick the next/previous by position, wrapping.
 */
export function decideTab(
  count: number,
  activeIndex: number,
  after: readonly boolean[],
  shift: boolean
): TabDecision {
  if (count === 0) return { kind: 'container' };
  if (activeIndex >= 0) {
    if (!shift && activeIndex === count - 1) return { kind: 'focus', index: 0 };
    if (shift && activeIndex === 0) return { kind: 'focus', index: count - 1 };
    return { kind: 'native' };
  }
  if (!shift) {
    const next = after.findIndex((a) => a);
    return { kind: 'focus', index: next === -1 ? 0 : next };
  }
  let prev = -1;
  for (let i = 0; i < count; i++) if (!after[i]) prev = i;
  return { kind: 'focus', index: prev === -1 ? count - 1 : prev };
}

/**
 * Picks the element a dialog should restore focus to. `active` is
 * document.activeElement (null for body); `recent` is the control just pressed.
 * WebKit focuses the nearest focusable ancestor of a pressed button that doesn't
 * take focus on click, so when that ancestor contains the pressed control (e.g. a
 * lower dialog's container) the pressed control is the real opener.
 */
export function chooseOpener<T extends { contains(other: T): boolean }>(
  active: T | null,
  recent: T | null
): T | null {
  if (active && recent && active !== recent && active.contains(recent)) return recent;
  return active ?? recent;
}

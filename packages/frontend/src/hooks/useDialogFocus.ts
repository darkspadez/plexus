import { useEffect, useId, useRef, type RefObject } from 'react';
import { chooseOpener, decideTab, isTabbable, isTop, push, remove } from '../lib/dialogStack';

const CANDIDATES =
  'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]';
const ACTIVATABLE =
  'button, a[href], [role="button"], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const RECENT_MS = 1000;

/**
 * The control most recently pressed (pointerdown, or Enter/Space keydown), held
 * for a moment only. Safari and Firefox on macOS don't focus buttons on click, and
 * a trigger inside a table cell may be re-mounted before a dialog's open effect
 * runs, so `document.activeElement` can be body when the dialog opens.
 */
let pressed: { el: HTMLElement; at: number } | null = null;
let pressedTimer: ReturnType<typeof setTimeout> | undefined;
function notePress(target: EventTarget | null) {
  clearTimeout(pressedTimer);
  const el = target instanceof Element ? target.closest<HTMLElement>(ACTIVATABLE) : null;
  pressed = el ? { el, at: Date.now() } : null;
  // Don't pin the node: forget it once it can no longer count as the same activation.
  if (pressed) {
    pressedTimer = setTimeout(() => {
      pressed = null;
    }, RECENT_MS);
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => notePress(e.target), true);
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') notePress(e.target);
    },
    true
  );
}

function takeOpener(container: HTMLElement | null): HTMLElement | null {
  const active = document.activeElement;
  const recent = pressed && Date.now() - pressed.at < RECENT_MS ? pressed.el : null;
  pressed = null;
  clearTimeout(pressedTimer);
  const candidate = chooseOpener(
    active instanceof HTMLElement && active !== document.body ? active : null,
    recent
  );
  return candidate && !container?.contains(candidate) ? candidate : null;
}

function restore(opener: HTMLElement | null) {
  if (!opener) return;
  if (opener.isConnected) {
    opener.focus({ preventScroll: true });
    return;
  }
  // Detached (its table cell re-mounted): re-resolve only when unambiguous.
  const label = opener.getAttribute('aria-label');
  if (!label) return;
  const twins = Array.from(document.querySelectorAll<HTMLElement>('[aria-label]')).filter(
    (el) => el.tagName === opener.tagName && el.getAttribute('aria-label') === label
  );
  if (twins.length === 1) twins[0].focus({ preventScroll: true });
}

export interface DialogFocusOptions {
  /** Called when Escape is pressed while this dialog is on top. */
  onClose: () => void;
  /** Preferred element to focus on open; falls back to data-autofocus, then the first non-close control. */
  initialFocus?: (container: HTMLElement) => HTMLElement | null;
}

function tabbables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(CANDIDATES)).filter((el) =>
    isTabbable({
      disabled: el.matches(':disabled'),
      hidden: el.closest('[hidden], [inert]') !== null || el.getClientRects().length === 0,
      tabIndex: el.tabIndex,
    })
  );
}

/**
 * Shared dialog focus management: moves focus in on open, traps Tab, handles
 * Escape for the top dialog only, pulls back focus that escapes behind the
 * overlay, and restores focus to the opener on close. The container must be
 * rendered (and carry tabIndex={-1}) while `isOpen`. Mark the close button with
 * `data-dialog-close` so initial focus skips it.
 */
export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  options: DialogFocusOptions
): void {
  const id = useId();
  const onCloseRef = useRef(options.onClose);
  const initialFocusRef = useRef(options.initialFocus);
  // Written in an effect (not render) so the compiler and StrictMode stay happy.
  useEffect(() => {
    onCloseRef.current = options.onClose;
    initialFocusRef.current = options.initialFocus;
  });
  // Opener survives the StrictMode effect re-run.
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    push(id);
    openerRef.current = takeOpener(containerRef.current) ?? openerRef.current;

    const frame = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el || el.contains(document.activeElement)) return;
      const target =
        initialFocusRef.current?.(el) ??
        el.querySelector<HTMLElement>('[data-autofocus]') ??
        tabbables(el).find((i) => !i.hasAttribute('data-dialog-close')) ??
        el;
      target.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTop(id) || e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const el = containerRef.current;
      if (!el) return;
      const current = document.activeElement;
      const inside = current !== null && el.contains(current);
      if (!inside && current !== null && current !== document.body) return;
      const items = tabbables(el);
      const activeIndex = inside ? items.indexOf(current as HTMLElement) : -1;
      const after = items.map(
        (item) =>
          !inside ||
          ((current as HTMLElement).compareDocumentPosition(item) &
            Node.DOCUMENT_POSITION_FOLLOWING) !==
            0
      );
      const decision = decideTab(items.length, activeIndex, after, e.shiftKey);
      if (decision.kind === 'native') return;
      e.preventDefault();
      if (decision.kind === 'container') el.focus();
      else items[decision.index].focus();
    };

    // Focus that lands in the app behind the overlay goes back into the dialog.
    // Body-level portals (e.g. a date picker popup) live outside #root and are left alone.
    const onFocusIn = (e: FocusEvent) => {
      if (!isTop(id)) return;
      const el = containerRef.current;
      const target = e.target;
      if (!el || !(target instanceof Node) || el.contains(target)) return;
      if (!document.getElementById('root')?.contains(target)) return;
      (tabbables(el)[0] ?? el).focus();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      remove(id);
      // Also runs on StrictMode's simulated unmount; the re-run re-remembers the
      // opener because it is the active element again.
      const opener = openerRef.current;
      openerRef.current = null;
      restore(opener);
    };
  }, [isOpen, id, containerRef]);
}

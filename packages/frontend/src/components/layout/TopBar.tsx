/**
 * TopBar — desktop sticky header (md+), 48px.
 *
 * Contains:
 *  - Left: section name / breadcrumb (derived from current route)
 *  - Right: AppearanceButton (opens the theme picker) · divider · UserMenu
 *
 * Hidden on mobile (`hidden md:flex`). Mobile users access these controls via
 * the AppBar or the mobile Drawer header (see AppBar.tsx / Sidebar.tsx).
 *
 * Semantic tokens only — no hardcoded hex.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Palette, LogOut, UserCircle2, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { useAuth } from '../../contexts/AuthContext';
import { AppearanceModal } from '../appearance/AppearanceModal';
import { SECTION_NAMES } from '../../lib/nav';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Click-outside hook for dropdown popovers. */
function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

/** Escape-key hook — closes the popover and returns focus to `triggerRef`. */
function useEscapeClose(
  open: boolean,
  onClose: () => void,
  triggerRef: React.RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, triggerRef]);
}

/* -------------------------------------------------------------------------- */
/* AppearanceButton — Palette icon + current-theme dots, opens the picker     */
/* -------------------------------------------------------------------------- */

export const AppearanceButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  // The dialog's focus hook restores focus to this button on close.
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Appearance"
        title="Appearance"
        className="inline-flex h-7 items-center gap-1.5 rounded-field px-2 text-foreground-muted transition-colors hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Palette className="size-4" strokeWidth={1.75} />
        <span className="flex items-center gap-0.5" aria-hidden="true">
          <span className="size-2 rounded-full bg-primary" />
          <span className="size-2 rounded-full bg-accent" />
        </span>
      </button>
      <AppearanceModal isOpen={open} onClose={close} />
    </>
  );
};

/* -------------------------------------------------------------------------- */
/* UserMenu — user avatar / name → logout                                     */
/* -------------------------------------------------------------------------- */

const UserMenu: React.FC = () => {
  const { principal, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);
  useEscapeClose(open, close, triggerRef);

  if (!principal) return null;

  const label = principal.role === 'admin' ? 'Admin' : (principal.keyName ?? 'User');
  const roleTag = principal.role === 'admin' ? 'admin' : 'limited';

  const handleLogout = () => {
    logout();
    window.location.href = '/ui/login';
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="User menu"
        aria-expanded={open}
        className={cn(
          'inline-flex h-7 items-center gap-2 rounded-md px-2 text-sm transition-colors',
          'text-foreground-muted hover:bg-surface-elevated hover:text-foreground'
        )}
      >
        <UserCircle2 className="size-4" strokeWidth={1.75} />
        <span className="text-xs">{label}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="User options"
          className={cn(
            'absolute right-0 top-full z-[100] mt-1 min-w-[11.25rem] rounded-lg border border-border',
            'bg-surface p-1 shadow-md'
          )}
        >
          <div className="px-2 pb-1.5 pt-0.5">
            <div className="text-label font-medium uppercase tracking-wider text-foreground-subtle">
              Signed in
            </div>
            <div className="mt-0.5 text-xs text-foreground-muted">
              {label}
              <span className="ml-2 text-label uppercase tracking-wide text-foreground-subtle">
                {roleTag}
              </span>
            </div>
          </div>
          <div className="-mx-1 my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
              'text-danger-text hover:bg-danger-subtle'
            )}
          >
            <LogOut className="size-3.5" strokeWidth={1.75} />
            Logout
          </button>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* TopBar                                                                     */
/* -------------------------------------------------------------------------- */

export const TopBar: React.FC = () => {
  const { pathname } = useLocation();
  const isRoot = pathname === '/';
  const section = SECTION_NAMES[pathname];

  return (
    <header className="sticky top-0 z-40 hidden h-12 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-sm md:flex">
      {/* Left: breadcrumb (Home > Page) */}
      <nav aria-label="Breadcrumb" className="flex flex-1 items-center gap-1.5 text-sm">
        {isRoot ? (
          <span className="font-medium text-foreground">Home</span>
        ) : (
          <>
            <Link
              to="/"
              className="font-medium text-foreground-muted no-underline transition-colors hover:text-foreground"
            >
              Home
            </Link>
            {section && (
              <>
                <ChevronRight
                  className="size-3.5 text-foreground-subtle"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span aria-current="page" className="font-medium text-foreground">
                  {section}
                </span>
              </>
            )}
          </>
        )}
      </nav>

      {/* Right: controls */}
      <div className="flex items-center gap-1.5">
        <AppearanceButton />
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <UserMenu />
      </div>
    </header>
  );
};

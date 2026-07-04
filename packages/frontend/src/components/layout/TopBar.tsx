/**
 * TopBar — desktop sticky header (md+), 48px.
 *
 * Contains:
 *  - Left: section name / breadcrumb (derived from current route)
 *  - Right: AccentPicker · ThemeToggle · divider · UserMenu
 *
 * Hidden on mobile (`hidden md:flex`). Mobile users access these controls via
 * the AppBar or the mobile Drawer header (see AppBar.tsx / Sidebar.tsx).
 *
 * Semantic tokens only — no hardcoded hex.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Palette,
  Check,
  LogOut,
  UserCircle2,
  ChevronRight,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { useTheme, type ThemeMode } from '../../contexts/ThemeContext';
import { useAccent, ACCENTS, type Accent } from '../../contexts/AccentContext';
import { useAuth } from '../../contexts/AuthContext';
import { SECTION_NAMES } from '../../lib/nav';

/* -------------------------------------------------------------------------- */
/* Accent swatch map — uses Layer-1 primitive vars from tokens.css            */
/* -------------------------------------------------------------------------- */

const ACCENT_SWATCH: Record<Accent, string> = {
  blue: 'var(--hue-blue-500)',
  green: 'var(--hue-green-500)',
  orange: 'var(--hue-orange-500)',
  violet: 'var(--hue-violet-500)',
  rose: 'var(--hue-rose-500)',
  amber: 'var(--hue-amber-500)',
};

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
/* ThemeToggle — segmented Sun / Moon / Monitor                               */
/* -------------------------------------------------------------------------- */

const THEME_OPTIONS: { mode: ThemeMode; icon: React.ReactNode; label: string }[] = [
  { mode: 'light', icon: <Sun className="size-3.5" strokeWidth={1.75} />, label: 'Light theme' },
  { mode: 'dark', icon: <Moon className="size-3.5" strokeWidth={1.75} />, label: 'Dark theme' },
  {
    mode: 'system',
    icon: <Monitor className="size-3.5" strokeWidth={1.75} />,
    label: 'System theme',
  },
];

const ThemeToggle: React.FC = () => {
  const { mode, setMode } = useTheme();
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-border p-0.5"
      role="group"
      aria-label="Theme"
    >
      {THEME_OPTIONS.map(({ mode: m, icon, label }) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          aria-label={label}
          aria-pressed={mode === m}
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
            mode === m
              ? 'bg-accent-subtle text-accent'
              : 'text-foreground-muted hover:bg-surface-elevated hover:text-foreground'
          )}
        >
          {icon}
        </button>
      ))}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* AccentPicker — Palette icon → dropdown of 6 swatches                      */
/* -------------------------------------------------------------------------- */

const AccentPicker: React.FC = () => {
  const { accent, setAccent } = useAccent();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);
  useEscapeClose(open, close, triggerRef);

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change accent color"
        aria-expanded={open}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-sm transition-colors',
          'text-foreground-muted hover:bg-surface-elevated hover:text-foreground'
        )}
      >
        <Palette className="size-3.5" strokeWidth={1.75} />
        <span
          aria-hidden
          className="size-3 rounded-full ring-1 ring-border"
          style={{ background: ACCENT_SWATCH[accent] }}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Accent color options"
          className={cn(
            'absolute right-0 top-full z-[100] mt-1 min-w-[160px] rounded-lg border border-border',
            'bg-surface py-1 shadow-[var(--shadow-md)]'
          )}
        >
          <div className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground-subtle">
            Accent
          </div>
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              role="menuitem"
              onClick={() => {
                setAccent(a);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 px-2 py-1.5 text-sm capitalize transition-colors',
                'text-foreground-muted hover:bg-surface-elevated hover:text-foreground'
              )}
            >
              <span
                className="size-4 shrink-0 rounded-full ring-1 ring-border"
                style={{ background: ACCENT_SWATCH[a] }}
              />
              <span className="flex-1 text-left">{a}</span>
              {accent === a && (
                <Check className="size-3.5 text-accent" strokeWidth={2} aria-hidden />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
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
            'absolute right-0 top-full z-[100] mt-1 min-w-[180px] rounded-lg border border-border',
            'bg-surface py-1 shadow-[var(--shadow-md)]'
          )}
        >
          <div className="px-2 pb-1.5 pt-0.5">
            <div className="text-[10px] font-medium uppercase tracking-wider text-foreground-subtle">
              Signed in
            </div>
            <div className="mt-0.5 text-xs text-foreground-muted">
              {label}
              <span className="ml-2 text-[10px] uppercase tracking-wide text-foreground-subtle">
                {roleTag}
              </span>
            </div>
          </div>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className={cn(
              'flex w-full items-center gap-2 px-2 py-1.5 text-sm transition-colors',
              'text-danger hover:bg-danger-subtle hover:text-danger'
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
        <AccentPicker />
        <ThemeToggle />
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <UserMenu />
      </div>
    </header>
  );
};

/* -------------------------------------------------------------------------- */
/* MobileThemeAccentControls — used by AppBar / Drawer header on mobile      */
/* -------------------------------------------------------------------------- */

export const MobileThemeAccentControls: React.FC = () => {
  return (
    <div className="flex items-center gap-1.5">
      <AccentPicker />
      <ThemeToggle />
    </div>
  );
};

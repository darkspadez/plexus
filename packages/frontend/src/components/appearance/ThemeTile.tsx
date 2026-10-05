import React from 'react';
import { AlertTriangle, Check, Moon, MoreHorizontal, Sun } from 'lucide-react';
import type { ThemeDef } from '@plexus/shared';
import { cn } from '../../lib/cn';

export interface ThemeTileMenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

interface ThemeTileProps {
  theme: Pick<ThemeDef, 'id' | 'name'> & Partial<Pick<ThemeDef, 'colorScheme'>>;
  active: boolean;
  /** System mode only: which slot this theme fills. */
  slotBadge?: 'light' | 'dark';
  /** Show the theme's Sun/Moon color scheme icon. */
  showScheme: boolean;
  onSelect: () => void;
  /** A custom theme that failed to compile: shown, but not selectable. */
  broken?: boolean;
  /** Admin actions. Omit for no menu. */
  menuItems?: ThemeTileMenuItem[];
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}

const TILE_BASE =
  'flex w-full items-center justify-between gap-2 bg-surface text-foreground border-(length:--theme-border-width) rounded-box shadow-sm py-2.5 text-left';

/**
 * The theme name, wrapping only at spaces (two lines at most). Each word is its
 * own inline block capped at the line width, so a single word too long for the
 * line ellipsizes instead of splitting mid-word or being clipped bare.
 */
const ThemeName: React.FC<{ name: string }> = ({ name }) => (
  <span className="line-clamp-2 text-sm font-medium">
    {name.split(' ').map((word, i) => (
      <React.Fragment key={i}>
        {i > 0 && ' '}
        <span className="inline-block max-w-full truncate align-bottom">{word}</span>
      </React.Fragment>
    ))}
  </span>
);

/**
 * A theme swatch button. It carries its own `data-theme`, so it renders in that
 * theme. The actions menu is a sibling of the select button (a button cannot
 * contain a button), absolutely positioned over its right edge.
 */
export const ThemeTile: React.FC<ThemeTileProps> = ({
  theme,
  active,
  slotBadge,
  showScheme,
  onSelect,
  broken,
  menuItems,
  menuOpen = false,
  onMenuOpenChange,
}) => {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const SchemeIcon = theme.colorScheme === 'dark' ? Moon : Sun;
  const hasMenu = !!menuItems && menuItems.length > 0 && !!onMenuOpenChange;
  const padding = hasMenu ? 'pl-3 pr-9' : 'px-3';

  // Close on outside click.
  React.useEffect(() => {
    if (!menuOpen || !onMenuOpenChange) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) onMenuOpenChange(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen, onMenuOpenChange]);

  // Move focus into the menu when it opens.
  React.useEffect(() => {
    if (menuOpen) wrapperRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menuOpen]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!menuOpen || !onMenuOpenChange) return;
    if (e.key === 'Escape') {
      // Stop the dialog's document-level Escape handler from also firing.
      e.stopPropagation();
      e.preventDefault();
      onMenuOpenChange(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = Array.from(
        wrapperRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
      );
      const at = items.indexOf(e.target as HTMLElement);
      if (at === -1) return;
      e.preventDefault();
      e.stopPropagation();
      items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    }
  };

  const dots = (
    <span className="mt-1.5 flex items-center gap-1" aria-hidden="true">
      <span className="size-2.5 rounded-full bg-primary" />
      <span className="size-2.5 rounded-full bg-secondary" />
      <span className="size-2.5 rounded-full bg-accent" />
      <span className="size-2.5 rounded-full bg-neutral" />
    </span>
  );

  return (
    <div ref={wrapperRef} className="relative" onKeyDown={onKeyDown}>
      {broken ? (
        <div
          title={`${theme.name}: invalid theme`}
          className={cn(TILE_BASE, padding, 'border-danger/40')}
        >
          <span className="min-w-0 flex-[1_1_4rem]">
            <ThemeName name={theme.name} />
            <span className="mt-1 flex items-center gap-1 text-xs text-danger-text">
              <AlertTriangle size="0.75rem" className="flex-shrink-0" aria-hidden="true" />
              Invalid theme — edit or delete
            </span>
          </span>
        </div>
      ) : (
        <button
          type="button"
          data-theme={theme.id}
          data-tile-id={theme.id}
          aria-pressed={active}
          title={theme.name}
          onClick={onSelect}
          className={cn(
            TILE_BASE,
            padding,
            'flex-wrap border-border cursor-pointer transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background'
          )}
        >
          <span className="min-w-0 flex-[1_1_4rem]">
            <ThemeName name={theme.name} />
            {dots}
          </span>
          <span className="ml-auto flex flex-shrink-0 items-center gap-1">
            {active && <Check size="0.875rem" className="text-primary-text" aria-hidden="true" />}
            {slotBadge && (
              <span className="text-2xs uppercase text-foreground-muted">
                {slotBadge === 'light' ? 'Light' : 'Dark'}
              </span>
            )}
            {showScheme && theme.colorScheme && (
              <SchemeIcon size="0.75rem" className="text-foreground-muted" aria-hidden="true" />
            )}
          </span>
        </button>
      )}

      {hasMenu && (
        <>
          <button
            ref={triggerRef}
            type="button"
            data-theme={broken ? undefined : theme.id}
            aria-label={`Theme actions for ${theme.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => onMenuOpenChange(!menuOpen)}
            className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent text-foreground-muted transition-colors duration-150 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <MoreHorizontal size="0.875rem" aria-hidden="true" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              aria-label={`Actions for ${theme.name}`}
              className="absolute right-0 top-full z-10 mt-1 min-w-[8.75rem] rounded-box border border-border bg-surface p-1 shadow-md"
            >
              {menuItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    // The menu item unmounts; park focus on the trigger so a dialog
                    // opened by onSelect remembers it (not body) as its opener.
                    triggerRef.current?.focus();
                    onMenuOpenChange(false);
                    item.onSelect();
                  }}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-field border-0 bg-transparent px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    item.danger
                      ? 'text-danger-text hover:bg-danger-subtle'
                      : 'text-foreground hover:bg-surface-elevated'
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

import React from 'react';
import { Check, Moon, Sun } from 'lucide-react';
import type { ThemeDef } from '@plexus/shared';

interface ThemeTileProps {
  theme: ThemeDef;
  active: boolean;
  /** System mode only: which slot this theme fills. */
  slotBadge?: 'light' | 'dark';
  /** Show the theme's Sun/Moon color scheme icon. */
  showScheme: boolean;
  onSelect: () => void;
}

/** A theme swatch button. It carries its own `data-theme`, so it renders in that theme. */
export const ThemeTile: React.FC<ThemeTileProps> = ({
  theme,
  active,
  slotBadge,
  showScheme,
  onSelect,
}) => {
  const SchemeIcon = theme.colorScheme === 'dark' ? Moon : Sun;
  return (
    <button
      type="button"
      data-theme={theme.id}
      aria-pressed={active}
      title={theme.name}
      onClick={onSelect}
      className="flex items-center justify-between gap-2 bg-surface text-foreground border-(length:--theme-border-width) border-border rounded-box shadow-sm px-3 py-2.5 text-left cursor-pointer transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-sm font-medium">{theme.name}</span>
        <span className="mt-1.5 flex items-center gap-1" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-primary" />
          <span className="size-2.5 rounded-full bg-secondary" />
          <span className="size-2.5 rounded-full bg-accent" />
          <span className="size-2.5 rounded-full bg-neutral" />
        </span>
      </span>
      <span className="flex flex-shrink-0 items-center gap-1">
        {active && <Check size={14} className="text-primary-text" aria-hidden="true" />}
        {slotBadge && (
          <span className="text-[10px] uppercase text-foreground-muted">
            {slotBadge === 'light' ? 'Light' : 'Dark'}
          </span>
        )}
        {showScheme && (
          <SchemeIcon size={12} className="text-foreground-muted" aria-hidden="true" />
        )}
      </span>
    </button>
  );
};

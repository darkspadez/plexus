/**
 * AppBar — mobile-only sticky header (hidden on md+).
 *
 * Contains:
 *  - Left: hamburger → opens Drawer nav
 *  - Center: Plexus logo + wordmark
 *  - Right: Appearance button (theme picker, so mobile users can switch without the TopBar)
 *
 * Semantic tokens only — no hardcoded hex.
 */
import React from 'react';
import { Menu } from 'lucide-react';
import { useSidebar } from '../../contexts/SidebarContext';
import { PlexusMark } from './PlexusMark';
import { AppearanceButton } from './TopBar';

export const AppBar: React.FC = () => {
  const { openMobile } = useSidebar();

  return (
    <header className="sticky top-0 z-[200] flex h-12 items-center gap-3 border-b border-border bg-surface px-3 md:hidden">
      {/* Hamburger */}
      <button
        type="button"
        onClick={openMobile}
        aria-label="Open navigation"
        className="-ml-1 rounded-md p-2 text-foreground-muted hover:bg-surface-elevated hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline focus-visible:outline-focus focus-visible:outline-offset-2"
      >
        <Menu size="1.25rem" />
      </button>

      {/* Logo */}
      <div className="flex flex-1 items-center gap-2">
        <PlexusMark size="1.25rem" />
        <span className="font-sans text-sm font-semibold brand-grad-text">Plexus</span>
      </div>

      {/* Appearance (theme picker) — exposed on mobile here */}
      <AppearanceButton />
    </header>
  );
};

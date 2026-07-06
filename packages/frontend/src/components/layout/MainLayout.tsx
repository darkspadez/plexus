/**
 * MainLayout — root shell.
 *
 * Desktop (md+):
 *   - Fixed sidebar on left (220px expanded / 64px collapsed)
 *   - Content column: sticky TopBar (48px) + scrolling <main>
 *   - Per-page PageHeader sticks below TopBar (top-12 on md+)
 *
 * Mobile (< md):
 *   - Sticky AppBar (48px, hamburger + logo + theme/accent controls)
 *   - No sidebar visible; Drawer overlay on hamburger press
 *   - Per-page PageHeader sticks below AppBar (top-12, same offset)
 *
 * Footer behavior (deliberate "classic sticky footer", not always-pinned):
 * the content column is min-h-screen (not h-screen) and <main> is flex-1
 * with no scroll of its own — so on a SHORT page, <main> is stretched to
 * fill the remaining height and Footer naturally lands at the viewport
 * bottom, next to Sidebar's own fixed Collapse row (see Footer.tsx's
 * matching height/padding). On a TALL page, the whole column grows past
 * one viewport height and the document itself scrolls — Footer trails
 * after the real content instead of staying pinned, and will no longer
 * line up with Sidebar's Collapse row while scrolling. Both are intended:
 * Footer should only look "pinned" when there's nothing to scroll past.
 * overflow-x-clip on <main> (not overflow-x-hidden) so position:sticky
 * inside <main> still works; no clip on the outer wrapper so the sticky
 * AppBar is not broken on mobile.
 */
import React from 'react';
import { cn } from '../../lib/cn';
import { Sidebar } from './Sidebar';
import { AppBar } from './AppBar';
import { TopBar } from './TopBar';
import { Footer } from './Footer';
import { Drawer } from '../ui/Drawer';
import { useSidebar } from '../../contexts/SidebarContext';

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header — hidden on md+ */}
      <AppBar />

      {/* Desktop fixed sidebar — hidden below md */}
      <Sidebar mode="desktop" />

      {/* Mobile drawer — overlay on hamburger */}
      <Drawer open={isMobileOpen} onClose={closeMobile} aria-label="Main navigation">
        <Sidebar mode="drawer" />
      </Drawer>

      {/* Content column — shifts right on desktop to clear the sidebar */}
      <div
        className={cn(
          'flex min-h-screen flex-col transition-[margin] duration-300',
          isCollapsed ? 'md:ml-[64px]' : 'md:ml-[220px]'
        )}
      >
        {/* Desktop TopBar — hidden on mobile (md:flex in TopBar itself) */}
        <TopBar />

        {/*
          overflow-x-clip (NOT hidden): prevents wide children from blowing out
          the viewport without turning <main> into a scroll container — which
          would break every position:sticky PageHeader inside (defaults to
          false today, but the option should keep working) and would make
          Footer always-pinned regardless of content length, which is not
          the desired "classic sticky footer" behavior here (see file header).
          flex-1 so the footer is pushed to the bottom on short pages.
        */}
        <main className="min-w-0 flex-1 overflow-x-clip">{children}</main>

        {/* App-wide footer (version moved here from the sidebar) */}
        <Footer />
      </div>
    </div>
  );
};

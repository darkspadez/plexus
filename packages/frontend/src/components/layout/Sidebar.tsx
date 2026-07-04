/**
 * Sidebar — shared between desktop (fixed rail) and mobile (Drawer overlay).
 *
 * Nav structure (see nav.ts for the source of truth):
 *   Observability: Dashboard · Requests · Quotas · My Key (limited)
 *   Routing:       Providers · Models
 *   Access:        API Keys · User Quotas
 *   Integrations:  MCP Servers
 *   Diagnostics:   Traces · Errors · Playground · System Logs
 *   System:        Settings
 *
 * Semantic tokens only (bg-surface, border-border, text-foreground*, accent
 * vars) so light + dark + all 6 accents render correctly.
 */
import React, { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { PanelLeftClose, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useAuth } from '../../contexts/AuthContext';
import { useSidebar } from '../../contexts/SidebarContext';
import { Tooltip } from '../ui/Tooltip';
import { PlexusMark } from './PlexusMark';
import { NAV_GROUPS, type NavItemDef } from '../../lib/nav';

/* -------------------------------------------------------------------------- */
/* NavItem — single nav link row                                               */
/* -------------------------------------------------------------------------- */

const NavItem: React.FC<{ item: NavItemDef; collapsed: boolean }> = ({ item, collapsed }) => {
  const Icon = item.icon;
  const location = useLocation();
  const isActive =
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);

  const inner = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={cn(
        'group relative flex w-full items-center rounded-md py-1.5 text-sm font-medium no-underline transition-colors',
        collapsed ? 'justify-center px-0' : 'gap-2.5 px-2',
        isActive
          ? 'bg-accent-subtle text-foreground'
          : 'text-foreground-muted hover:bg-surface-elevated hover:text-foreground'
      )}
    >
      {/* Active left-bar indicator (shown in both expanded and collapsed rails) */}
      {isActive && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r bg-accent"
        />
      )}
      <Icon size={16} className="shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );

  if (collapsed) {
    return (
      <Tooltip content={item.label} position="right">
        {inner}
      </Tooltip>
    );
  }
  return inner;
};

/* -------------------------------------------------------------------------- */
/* NavGroup section label                                                      */
/* -------------------------------------------------------------------------- */

const GroupLabel: React.FC<{ label: string; collapsed: boolean }> = ({ label, collapsed }) => {
  if (collapsed) return null;
  return (
    <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
      {label}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Sidebar props                                                               */
/* -------------------------------------------------------------------------- */

interface SidebarProps {
  mode?: 'desktop' | 'drawer';
}

/* -------------------------------------------------------------------------- */
/* Sidebar                                                                     */
/* -------------------------------------------------------------------------- */

export const Sidebar: React.FC<SidebarProps> = ({ mode = 'desktop' }) => {
  const { isAdmin, isLimited } = useAuth();
  const { isCollapsed, toggleSidebar, isMobileOpen, closeMobile } = useSidebar();
  const location = useLocation();

  const isDrawer = mode === 'drawer';
  const collapsed = mode === 'desktop' && isCollapsed;

  /* Auto-close drawer on route change */
  const lastPathnameRef = useRef(location.pathname);
  useEffect(() => {
    const pathChanged = lastPathnameRef.current !== location.pathname;
    lastPathnameRef.current = location.pathname;
    if (pathChanged && isDrawer && isMobileOpen) {
      closeMobile();
    }
  }, [location.pathname, isDrawer, isMobileOpen, closeMobile]);

  /* Filter nav groups by role */
  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (i.adminOnly && !isAdmin) return false;
      if (i.limitedOnly && !isLimited) return false;
      return true;
    }),
  })).filter((g) => g.items.length > 0);

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'flex flex-col overflow-y-auto overflow-x-hidden border-border bg-surface',
        isDrawer
          ? 'h-full w-full'
          : 'fixed inset-y-0 left-0 z-[200] hidden h-screen border-r transition-[width] duration-300 md:flex',
        !isDrawer && (collapsed ? 'w-[64px]' : 'w-[220px]')
      )}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Brand header — matches TopBar height (48px / h-12)                  */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={cn(
          'flex h-12 shrink-0 items-center border-b border-border',
          collapsed ? 'justify-center px-0' : 'gap-2.5 px-4'
        )}
      >
        {/* Collapsed: just the mark */}
        {collapsed ? (
          <PlexusMark size={28} />
        ) : (
          <>
            <PlexusMark size={24} />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-sans text-lg font-semibold tracking-tight text-foreground truncate accent-grad-text">
                Plexus
              </span>
            </div>
          </>
        )}

        {/* Close button (drawer only) — desktop collapse lives at the bottom */}
        {isDrawer && (
          <button
            type="button"
            onClick={closeMobile}
            aria-label="Close navigation"
            className="ml-auto p-1.5 rounded-md text-foreground-muted hover:bg-surface-elevated hover:text-foreground transition-colors"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Main nav — grouped                                                   */}
      {/* ------------------------------------------------------------------ */}
      <nav className="flex-1 overflow-y-auto px-2 pt-2 pb-2">
        {visibleGroups.map((group, idx) => (
          <div key={group.label} className={cn(idx > 0 && 'mt-1.5 border-t border-border pt-1.5')}>
            <GroupLabel label={group.label} collapsed={collapsed} />
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavItem key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom: collapse toggle                                             */}
      {/* (Settings lives in the System nav group; user identity + logout in  */}
      {/*  the TopBar user menu)                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex shrink-0 flex-col gap-1 border-t border-border px-2 py-2">
        {/* Collapse toggle (desktop, expanded state) */}
        {!isDrawer && !collapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Collapse sidebar"
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md py-1.5 px-2 text-sm font-medium',
              'text-foreground-muted hover:bg-surface-elevated hover:text-foreground transition-colors'
            )}
          >
            <ChevronsLeft className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="truncate">Collapse</span>
          </button>
        )}

        {/* Expand toggle (desktop, collapsed state) */}
        {!isDrawer && collapsed && (
          <Tooltip content="Expand sidebar" position="right">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
              className={cn(
                'flex w-full items-center justify-center rounded-md py-1.5',
                'text-foreground-muted hover:bg-surface-elevated hover:text-foreground transition-colors'
              )}
            >
              <ChevronsRight className="size-4 shrink-0" strokeWidth={1.75} />
            </button>
          </Tooltip>
        )}
      </div>
    </aside>
  );
};

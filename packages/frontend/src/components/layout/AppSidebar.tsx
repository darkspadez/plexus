import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  AlertTriangle,
  Bug,
  ChevronsLeft,
  ChevronsRight,
  Database,
  FileText,
  Key,
  LayoutDashboard,
  Network,
  PieChart,
  Plug,
  Server,
  Settings,
  UserCircle2,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { useAuth } from '../../contexts/AuthContext';
import { useSidebar } from '../../contexts/SidebarContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui-v2/tooltip';
import logo from '../../assets/plexus_logo_transparent.png';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  adminOnly?: boolean;
  limitedOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Observability',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/logs', label: 'Request Logs', icon: FileText },
      { to: '/me', label: 'My Key', icon: UserCircle2, limitedOnly: true },
    ],
  },
  {
    label: 'Routing',
    items: [
      { to: '/models', label: 'Model Aliases', icon: Network, adminOnly: true },
      { to: '/providers', label: 'Providers', icon: Server, adminOnly: true },
    ],
  },
  {
    label: 'Access',
    items: [
      { to: '/keys', label: 'API Keys', icon: Key, adminOnly: true },
      { to: '/quotas', label: 'Quotas', icon: PieChart, adminOnly: true },
    ],
  },
  {
    label: 'Integrations',
    items: [{ to: '/mcp', label: 'MCP Servers', icon: Plug, adminOnly: true }],
  },
  {
    label: 'Diagnostics',
    items: [
      { to: '/debug', label: 'Traces', icon: Database },
      { to: '/errors', label: 'Errors', icon: AlertTriangle },
      { to: '/system-logs', label: 'System Logs', icon: Bug, adminOnly: true },
    ],
  },
];

const SettingsItem: NavItem = {
  to: '/config',
  label: 'Settings',
  icon: Settings,
  adminOnly: true,
};

const NavLinkRow: React.FC<{
  item: NavItem;
  collapsed: boolean;
}> = ({ item, collapsed }) => {
  const Icon = item.icon;
  const inner = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium text-foreground-muted no-underline transition-colors',
          'hover:bg-surface-elevated hover:text-foreground',
          collapsed && 'justify-center px-1.5',
          isActive &&
            'bg-accent-subtle text-foreground before:absolute before:-left-1 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r before:bg-accent before:content-[""]'
        )
      }
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
  if (!collapsed) return inner;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
};

export const AppSidebar: React.FC = () => {
  const { isAdmin, isLimited } = useAuth();
  const { isCollapsed, toggleSidebar } = useSidebar();

  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (i.adminOnly && !isAdmin) return false;
      if (i.limitedOnly && !isLimited) return false;
      return true;
    }),
  })).filter((g) => g.items.length > 0);

  const showSettings = isAdmin;

  return (
    <TooltipProvider>
      <aside
        data-collapsed={isCollapsed}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-border bg-surface transition-[width] duration-200',
          isCollapsed ? 'w-14' : 'w-56'
        )}
      >
        {/* Logo column header — same height as TopBar (48px) */}
        <div
          className={cn(
            'flex h-12 shrink-0 items-center gap-2 border-b border-border px-3',
            isCollapsed && 'justify-center px-2'
          )}
        >
          <img
            src={logo}
            alt=""
            className={cn(
              'size-6 shrink-0 [filter:grayscale(1)_brightness(1.1)]',
              '[data-theme=light]_&:[filter:grayscale(1)_brightness(0.4)]'
            )}
          />
          {!isCollapsed && (
            <span className="font-sans text-sm font-semibold tracking-tight text-foreground">
              Plexus
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {visibleGroups.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              {!isCollapsed && (
                <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-foreground-subtle">
                  {group.label}
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLinkRow key={item.to} item={item} collapsed={isCollapsed} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Settings + collapse toggle pinned to bottom */}
        <div className="shrink-0 border-t border-border px-2 py-2">
          {showSettings && <NavLinkRow item={SettingsItem} collapsed={isCollapsed} />}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'mt-1 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground-muted transition-colors hover:bg-surface-elevated hover:text-foreground',
              isCollapsed && 'justify-center px-1.5'
            )}
          >
            {isCollapsed ? (
              <ChevronsRight className="size-4" strokeWidth={1.75} />
            ) : (
              <>
                <ChevronsLeft className="size-4" strokeWidth={1.75} />
                <span className="truncate text-xs">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
};

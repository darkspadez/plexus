import React from 'react';
import { NavLink, useMatch } from 'react-router-dom';
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
  Shield,
  UserCircle2,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { useAuth } from '../../contexts/AuthContext';
import { useSidebar } from '../../contexts/SidebarContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui-v2/tooltip';
import { PlexusMark } from '../brand/PlexusMark';

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
      { to: '/logs', label: 'Requests', icon: FileText },
      { to: '/me', label: 'My Key', icon: UserCircle2, limitedOnly: true },
    ],
  },
  {
    label: 'Routing',
    items: [
      { to: '/providers', label: 'Providers', icon: Server, adminOnly: true },
      { to: '/models', label: 'Models', icon: Network, adminOnly: true },
      { to: '/quotas', label: 'Quotas', icon: PieChart, adminOnly: true },
    ],
  },
  {
    label: 'Access',
    items: [
      { to: '/keys', label: 'API Keys', icon: Key, adminOnly: true },
      {
        to: '/user-quotas',
        label: 'User Quotas',
        icon: Shield,
        adminOnly: true,
      },
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
  const isActive = !!useMatch({ path: item.to, end: item.to === '/' });
  const className = cn(
    'group relative flex w-full items-center rounded-md py-1.5 text-sm font-medium text-foreground-muted no-underline transition-colors',
    'hover:bg-surface-elevated hover:text-foreground',
    collapsed ? 'justify-center px-0' : 'gap-2.5 px-2',
    isActive && 'bg-accent-subtle text-foreground'
  );
  const inner = (
    <NavLink to={item.to} end={item.to === '/'} className={className}>
      {isActive && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r bg-accent"
        />
      )}
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
            'flex h-12 shrink-0 items-center border-b border-border',
            isCollapsed ? 'justify-center px-0' : 'gap-2 px-3'
          )}
        >
          <PlexusMark
            className={cn('shrink-0 text-foreground', isCollapsed ? 'size-7' : 'size-6')}
          />
          {!isCollapsed && (
            <span className="font-sans text-sm font-semibold tracking-tight text-foreground">
              Plexus
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {visibleGroups.map((group, groupIdx) => (
            <div
              key={group.label}
              className={cn('pt-2 pb-1 last:pb-0', groupIdx > 0 && 'border-t border-border')}
            >
              {!isCollapsed && (
                <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
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
              'mt-1 flex w-full items-center rounded-md py-1.5 text-sm font-medium text-foreground-muted transition-colors hover:bg-surface-elevated hover:text-foreground',
              isCollapsed ? 'justify-center px-0' : 'gap-2.5 px-2'
            )}
          >
            {isCollapsed ? (
              <ChevronsRight className="size-4 shrink-0" strokeWidth={1.75} />
            ) : (
              <>
                <ChevronsLeft className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
};

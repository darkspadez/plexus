/**
 * nav.ts — single source of truth for the sidebar nav structure and route
 * display names.
 *
 * `Sidebar` renders `NAV_GROUPS` directly; `TopBar` derives its breadcrumb
 * labels from `SECTION_NAMES` below, so the two can never drift out of sync.
 * Pages should use `SECTION_NAMES['/route']` for their `PageHeader` titles.
 */
import type { ComponentType } from 'react';
import {
  LayoutDashboard,
  Settings,
  Server,
  Boxes,
  FileText,
  AlertTriangle,
  Key,
  Gauge,
  PlugZap,
  UserCircle2,
  Route,
  Terminal,
  Shield,
  FlaskConical,
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* Nav data types                                                              */
/* -------------------------------------------------------------------------- */

export interface NavItemDef {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  adminOnly?: boolean;
  limitedOnly?: boolean;
}

export interface NavGroupDef {
  label: string;
  items: NavItemDef[];
}

/* -------------------------------------------------------------------------- */
/* 6-group nav structure: Observability, Routing, Access, Integrations,       */
/* Diagnostics, System — 14 items total. "User Quotas" lives in Access.       */
/* -------------------------------------------------------------------------- */

export const NAV_GROUPS: NavGroupDef[] = [
  {
    label: 'Observability',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/logs', label: 'Requests', icon: FileText },
      { to: '/quotas', label: 'Quotas', icon: Gauge, adminOnly: true },
      { to: '/me', label: 'My Key', icon: UserCircle2, limitedOnly: true },
    ],
  },
  {
    label: 'Routing',
    items: [
      { to: '/providers', label: 'Providers', icon: Server, adminOnly: true },
      { to: '/models', label: 'Models', icon: Boxes, adminOnly: true },
    ],
  },
  {
    label: 'Access',
    items: [
      { to: '/keys', label: 'API Keys', icon: Key, adminOnly: true },
      { to: '/user-quotas', label: 'User Quotas', icon: Shield, adminOnly: true },
    ],
  },
  {
    label: 'Integrations',
    items: [{ to: '/mcp', label: 'MCP Servers', icon: PlugZap, adminOnly: true }],
  },
  {
    label: 'Diagnostics',
    items: [
      { to: '/debug', label: 'Traces', icon: Route },
      { to: '/errors', label: 'Errors', icon: AlertTriangle },
      { to: '/playground', label: 'Playground', icon: FlaskConical, adminOnly: true },
      { to: '/system-logs', label: 'System Logs', icon: Terminal, adminOnly: true },
    ],
  },
  {
    label: 'System',
    items: [{ to: '/config', label: 'Settings', icon: Settings, adminOnly: true }],
  },
];

/** Route → display name; derived from NAV_GROUPS so breadcrumbs can never drift from the sidebar. */
export const SECTION_NAMES: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.to, i.label])
);

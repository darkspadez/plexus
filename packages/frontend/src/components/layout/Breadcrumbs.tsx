import React from 'react';
import { Link, useLocation } from 'react-router-dom';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../ui-v2/breadcrumb';
import { NAV_GROUPS, SettingsItem, type NavItem } from './AppSidebar';

const ROUTE_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const visit = (item: NavItem) => {
    map[item.to] = item.label;
  };
  NAV_GROUPS.forEach((group) => group.items.forEach(visit));
  visit(SettingsItem);
  return map;
})();

const titlecaseSegment = (segment: string): string =>
  segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

interface Crumb {
  label: string;
  to?: string;
}

const resolveCrumbs = (pathname: string): Crumb[] => {
  if (pathname === '/' || pathname === '') {
    return [{ label: ROUTE_LABELS['/'] ?? 'Dashboard' }];
  }

  const home: Crumb = { label: 'Home', to: '/' };

  const exact = ROUTE_LABELS[pathname];
  if (exact) return [home, { label: exact }];

  // Detail routes — currently only /logs/:id, kept generic for future nesting.
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const parentPath = `/${segments[0]}`;
    const parentLabel = ROUTE_LABELS[parentPath];
    if (parentLabel) {
      return [home, { label: parentLabel, to: parentPath }, { label: 'Detail' }];
    }
  }

  // Defensive fallback.
  return [home, { label: titlecaseSegment(segments[segments.length - 1] ?? '') }];
};

export const Breadcrumbs: React.FC = () => {
  const { pathname } = useLocation();
  const crumbs = resolveCrumbs(pathname);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <React.Fragment key={`${crumb.label}-${index}`}>
              <BreadcrumbItem>
                {isLast || !crumb.to ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.to}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

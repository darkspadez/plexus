import React from 'react';
import { cn } from '../../lib/cn';
import { AppSidebar } from './AppSidebar';
import { TopBar } from './TopBar';
import { useSidebar } from '../../contexts/SidebarContext';

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isCollapsed } = useSidebar();
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div
        className={cn(
          'min-h-screen transition-[margin] duration-200',
          isCollapsed ? 'md:ml-14' : 'md:ml-56'
        )}
      >
        <TopBar />
        <main>{children}</main>
      </div>
    </div>
  );
};

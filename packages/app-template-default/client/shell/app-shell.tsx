import { useState, type ReactElement } from 'react';
import { Outlet } from 'react-router';

import { AppHeader } from './app-header.js';
import { AppSidebar } from './app-sidebar.js';

export function AppShell(): ReactElement {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

  return (
    <div className='flex min-h-svh bg-background'>
      <AppSidebar
        desktopCollapsed={desktopSidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <div className='flex min-w-0 flex-1 flex-col'>
        <AppHeader
          desktopSidebarCollapsed={desktopSidebarCollapsed}
          onOpenSidebar={() => setMobileSidebarOpen(true)}
          onToggleDesktopSidebar={() =>
            setDesktopSidebarCollapsed((collapsed) => !collapsed)
          }
        />
        <main className='min-w-0 flex-1'>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

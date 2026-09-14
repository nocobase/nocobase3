import { useSyncServerLocale } from '@nocobase/app-plugin-i18n/client';
import { useState, type ReactElement } from 'react';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { Outlet } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';

import { AppHeader } from './app-header.js';
import { AppSidebar } from './app-sidebar.js';

export function AppShell({
  routes,
}: {
  readonly routes: readonly AppClientRegisteredRoute[];
}): ReactElement {
  // The browser decides what it renders; this tells the server the same language so its messages match.
  useSyncServerLocale();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

  return (
    <div className='flex min-h-svh bg-background'>
      <AppSidebar
        routes={routes}
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
          {/* The trail is a function of the route, so the shell owns it rather than every page repeating it. The
              container matches what the pages use, so the trail lines up with the heading below it. */}
          <Breadcrumbs className='mx-auto w-full max-w-6xl px-6 pt-6 md:px-8 md:pt-8' />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

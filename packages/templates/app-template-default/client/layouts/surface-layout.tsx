import { useTranslation } from '@nocobase/i18n/client';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { ArrowLeft, PanelLeft, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, Navigate, Routes, useLocation, useNavigate } from 'react-router';

import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';

import { renderRouteTree } from '../routing/route-tree.js';
import {
  routeKey,
  matchRouteTree,
  navigationPages,
  selectedNavigationId,
  useRouteNavigation,
} from '../routing/route-navigation.js';
import { NavigationTree } from '../shell/app-sidebar.js';
import { AppBrand, HeaderActions, type HeaderSurface } from '../shell/index.js';

/** What distinguishes one surface from another. Everything else about the two is identical. */
export interface SurfaceCopy {
  /** Which surface this is. The header drops this surface's own entry, since it is already the destination. */
  readonly surface: HeaderSurface;
  /** Labels the navigation landmark and the loading state, such as `Settings` or `Dev tools`. */
  readonly title: string;
  /** The path this surface mounts at, used to strip the prefix from nested route paths. */
  readonly pathPrefix: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
}

export interface SurfaceLayoutProps {
  readonly copy: SurfaceCopy;
  readonly routeTree: readonly AppClientRegisteredRoute[];
  /** Authenticated plugin routes nested below a page, such as a record detail page. */
  readonly routes?: readonly AppClientRegisteredRoute[];
}

/**
 * A navigable surface: a left rail of every page the user may open, and the selected page on the right. It replaces
 * the application shell rather than nesting inside it, so a surface is a place you enter and leave rather than
 * another branch of the product navigation.
 *
 * The settings centre and the dev tools are the same component with different copy, which is what keeps the two
 * feeling like one product rather than two.
 */
export function SurfaceLayout({
  copy,
  routeTree,
  routes = [],
}: SurfaceLayoutProps): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const {
    items: navEntries,
    loading,
    denied,
  } = useRouteNavigation(routeTree, true);
  const selectedKey = selectedNavigationId(
    routeTree,
    location.pathname,
    denied,
  );
  const visible = navigationPages(navEntries);
  const allRoutes = [...routeTree, ...routes];
  const matches = matchRouteTree(allRoutes, location.pathname);
  if (loading)
    return <Loading className='min-h-svh' label={`Loading ${copy.title}`} />;
  if (
    matches
      ?.filter(({ route }) => route.componentLoader)
      .slice(0, 1)
      .some(({ route }) => denied.has(routeKey(route))) ||
    !matches?.some(({ route }) => route.componentLoader)
  ) {
    return visible[0] ? (
      <Navigate to={visible[0].path} replace />
    ) : (
      <SurfaceEmpty copy={copy} />
    );
  }

  return (
    <div className='flex min-h-svh bg-background'>
      {mobileSidebarOpen ? (
        <button
          aria-label='Close navigation'
          className='fixed inset-0 z-40 bg-black/30 md:hidden'
          onClick={() => setMobileSidebarOpen(false)}
          type='button'
        />
      ) : null}
      <aside
        aria-label={`${copy.title} navigation`}
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 md:sticky md:top-0 md:bottom-auto md:h-svh md:z-auto md:flex md:translate-x-0 ${desktopSidebarCollapsed ? 'md:w-16' : 'md:w-64'} ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div
          className={`flex h-16 shrink-0 items-center justify-between overflow-hidden border-b border-sidebar-border/70 px-5 ${desktopSidebarCollapsed ? 'md:justify-center md:px-0' : ''}`}
        >
          <div className='md:hidden'>
            <AppBrand />
          </div>
          <div className='hidden md:block'>
            <AppBrand compact={desktopSidebarCollapsed} />
          </div>
          <Button
            aria-label='Close navigation'
            className='md:hidden hover:bg-sidebar-accent dark:hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:border-sidebar-ring focus-visible:ring-sidebar-ring'
            onClick={() => setMobileSidebarOpen(false)}
            size='icon'
            variant='ghost'
          >
            <X />
          </Button>
        </div>
        <nav
          aria-label={copy.title}
          className={`flex-1 min-h-0 space-y-1 overflow-x-hidden overflow-y-auto py-4 ${desktopSidebarCollapsed ? 'px-3 md:px-2' : 'px-3'}`}
        >
          {navEntries.map((entry) => (
            <NavigationTree
              key={routeKey(entry.route)}
              item={entry}
              collapsed={desktopSidebarCollapsed}
              selectedKey={selectedKey}
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          ))}
        </nav>
      </aside>
      <div className='flex min-w-0 flex-1 flex-col'>
        <header className='sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-border/70 bg-background/85 px-3 backdrop-blur-xl md:px-4'>
          <div className='flex min-w-0 items-center gap-3'>
            <Button
              aria-label='Open navigation'
              className='size-9 rounded-xl text-muted-foreground md:hidden'
              onClick={() => setMobileSidebarOpen(true)}
              size='icon'
              variant='ghost'
            >
              <PanelLeft />
            </Button>
            <Button
              aria-label={
                desktopSidebarCollapsed
                  ? 'Expand navigation'
                  : 'Collapse navigation'
              }
              aria-pressed={desktopSidebarCollapsed}
              className='hidden size-9 rounded-xl text-muted-foreground hover:text-foreground md:inline-flex'
              onClick={() =>
                setDesktopSidebarCollapsed((collapsed) => !collapsed)
              }
              size='icon'
              variant='ghost'
            >
              <PanelLeft />
            </Button>
            <div className='hidden h-5 w-px bg-border md:block' />
            <Link
              className='inline-flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground'
              to='/'
            >
              <ArrowLeft className='size-4 shrink-0' />
              <span className='truncate'>Back to app</span>
            </Link>
          </div>
          <HeaderActions surface={copy.surface} />
        </header>
        <main className='min-w-0 flex-1'>
          <label className='sr-only' htmlFor='surface-page'>
            {copy.title} page
          </label>
          <select
            id='surface-page'
            className='m-3 h-9 w-[calc(100%-1.5rem)] min-w-0 rounded-xl border border-border/70 bg-background px-3 text-sm md:hidden'
            value={
              visible.find((route) => routeKey(route) === selectedKey)?.path ??
              ''
            }
            onChange={(event) => {
              void navigate(event.target.value);
            }}
          >
            {visible.map((route) => (
              <option key={routeKey(route)} value={route.path}>
                {t(route.navigation!.title, {
                  ns: route.packageName,
                  defaultValue: route.navigation!.title,
                })}
              </option>
            ))}
          </select>
          <Routes>
            {renderRouteTree(routeTree, copy.pathPrefix, false, true)}
            {renderRouteTree(routes, copy.pathPrefix)}
          </Routes>
        </main>
      </div>
    </div>
  );
}

function SurfaceEmpty({ copy }: { readonly copy: SurfaceCopy }): ReactElement {
  return (
    <main className='grid min-h-svh place-items-center px-6'>
      <section className='w-full max-w-lg space-y-3 text-center'>
        <h1 className='text-xl font-semibold'>{copy.emptyTitle}</h1>
        <p className='text-sm text-muted-foreground'>{copy.emptyDescription}</p>
        <Link
          className='inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline'
          to='/'
        >
          <ArrowLeft className='size-4' />
          Back to app
        </Link>
      </section>
    </main>
  );
}

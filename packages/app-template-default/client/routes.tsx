import { Button, Loading } from '@nocobase/app-client/ui';
import { Authenticated } from '@refinedev/core';
import { Suspense, type ReactElement } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Navigate, Outlet, Route, Routes } from 'react-router';

import { HomePage } from './pages/home';
import {
  groupRenderablePluginRoutes,
  type AppClientRenderableRoute,
} from './plugin-routes';
import { AppShell } from './shell/index.js';
import { ThemeSettings } from './theme/index.js';

export interface AppRoutesProps {
  pluginRoutes: readonly AppClientRenderableRoute[];
}

export function AppRoutes({ pluginRoutes }: AppRoutesProps): ReactElement {
  const routeGroups = groupRenderablePluginRoutes(pluginRoutes);

  return (
    <Routes>
      <Route
        element={
          <Authenticated
            key='authenticated-inner'
            fallback={<Navigate to='/login' replace />}
          >
            <Outlet />
          </Authenticated>
        }
      >
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          {routeGroups.required.map((route) => (
            <Route
              key={route.id}
              path={route.path}
              element={<PluginRoute route={route} />}
            />
          ))}
        </Route>
      </Route>

      <Route
        element={
          <Authenticated key='authenticated-outer' fallback={<Outlet />}>
            <Navigate to='/' replace />
          </Authenticated>
        }
      >
        <Route element={<StandalonePageLayout />}>
          {routeGroups.guest.map((route) => (
            <Route
              key={route.id}
              path={route.path}
              element={<PluginRoute route={route} />}
            />
          ))}
        </Route>
      </Route>

      <Route element={<StandalonePageLayout />}>
        {routeGroups.optional.map((route) => (
          <Route
            key={route.id}
            path={route.path}
            element={<PluginRoute route={route} />}
          />
        ))}
      </Route>

      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  );
}

function StandalonePageLayout(): ReactElement {
  return (
    <div className='relative min-h-svh'>
      <div className='fixed top-4 right-4 z-50'>
        <ThemeSettings />
      </div>
      <Outlet />
    </div>
  );
}

interface PluginRouteProps {
  route: AppClientRenderableRoute;
}

function PluginRoute({ route }: PluginRouteProps): ReactElement {
  const { Component } = route;

  return (
    <ErrorBoundary fallback={<PluginRouteError route={route} />}>
      <Suspense fallback={<PluginRouteLoading />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}

function PluginRouteLoading(): ReactElement {
  return <Loading className='min-h-[calc(100svh-4rem)]' label='Loading page' />;
}

function PluginRouteError({ route }: PluginRouteProps): ReactElement {
  return (
    <section className='grid min-h-[calc(100svh-4rem)] place-items-center px-6'>
      <section className='w-full max-w-lg space-y-4 text-center'>
        <h1 className='text-xl font-semibold'>Unable to load page</h1>
        <p className='text-sm text-muted-foreground'>
          Route {route.name} from {route.packageName} could not be loaded.
        </p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </section>
    </section>
  );
}

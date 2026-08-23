import { Button } from '@nocobase/app-client/ui';
import { Authenticated } from '@refinedev/core';
import { Suspense, type ReactElement } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Navigate, Outlet, Route, Routes } from 'react-router';

import { HomePage } from './pages/home';
import { LoginPage } from './pages/login';
import type { AppClientRenderableRoute } from './plugin-routes';

export interface AppRoutesProps {
  pluginRoutes: readonly AppClientRenderableRoute[];
}

export function AppRoutes({ pluginRoutes }: AppRoutesProps): ReactElement {
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
        <Route index element={<HomePage />} />
        {pluginRoutes.map((route) => (
          <Route
            key={route.id}
            path={route.path}
            element={<PluginRoute route={route} />}
          />
        ))}
      </Route>

      <Route
        path='/login'
        element={
          <Authenticated key='authenticated-outer' fallback={<LoginPage />}>
            <Navigate to='/' replace />
          </Authenticated>
        }
      />

      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
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
  return (
    <main
      className='grid min-h-svh place-items-center px-6'
      role='status'
      aria-label='Loading page'
    >
      <p className='text-sm text-muted-foreground'>Loading page…</p>
    </main>
  );
}

function PluginRouteError({ route }: PluginRouteProps): ReactElement {
  return (
    <main className='grid min-h-svh place-items-center px-6'>
      <section className='w-full max-w-lg space-y-4 text-center'>
        <h1 className='text-xl font-semibold'>Unable to load page</h1>
        <p className='text-sm text-muted-foreground'>
          Route {route.name} from {route.packageName} could not be loaded.
        </p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </section>
    </main>
  );
}

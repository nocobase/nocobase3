import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { Authenticated } from '@refinedev/core';
import {
  Suspense,
  createElement,
  useEffect,
  useState,
  type ComponentType,
  type ReactElement,
} from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';

import { ServiceDeskShell } from './shell.js';

export function ServiceDeskRouter({
  routes,
}: {
  routes: readonly AppClientRegisteredRoute[];
}): ReactElement {
  const guest = routes.filter((route) => route.auth === 'guest');
  const application = routes.filter(
    (route) => route.auth === 'required' && route.surface === 'application',
  );
  const standalone = routes.filter(
    (route) => route.auth === 'required' && route.surface === 'standalone',
  );
  return (
    <Routes>
      <Route
        element={
          <Authenticated
            key='service-desk-authenticated'
            fallback={<Navigate replace to='/login' />}
          >
            <Outlet />
          </Authenticated>
        }
      >
        <Route element={<ServiceDeskShell />}>
          {application.map((route) => (
            <Route
              key={route.id}
              path={route.path}
              element={<LazyRoute route={route} />}
            />
          ))}
        </Route>
        {standalone.map((route) => (
          <Route
            key={route.id}
            path={route.path}
            element={<LazyRoute route={route} />}
          />
        ))}
      </Route>
      <Route
        element={
          <Authenticated key='service-desk-guest' fallback={<Outlet />}>
            <Navigate replace to='/' />
          </Authenticated>
        }
      >
        {guest.map((route) => (
          <Route
            key={route.id}
            path={route.path}
            element={<LazyRoute route={route} />}
          />
        ))}
      </Route>
      <Route path='*' element={<Navigate replace to='/' />} />
    </Routes>
  );
}

function LazyRoute({
  route,
}: {
  route: AppClientRegisteredRoute;
}): ReactElement {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  useEffect(() => {
    let active = true;
    void route.componentLoader().then((module) => {
      if (active) setComponent(() => module.default);
    });
    return () => {
      active = false;
    };
  }, [route]);
  return (
    <Suspense fallback={<div className='app-loading'>正在加载…</div>}>
      {Component ? (
        createElement(Component)
      ) : (
        <div className='app-loading'>正在加载…</div>
      )}
    </Suspense>
  );
}

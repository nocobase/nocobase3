import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { useLocation } from 'react-router';
import {
  createContext,
  useContext,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import { matchRouteTree } from './route-navigation.js';

/* eslint-disable react-refresh/only-export-components -- provider and hook are intentionally colocated */

const RouteMetadataContext = createContext<readonly AppClientRegisteredRoute[]>(
  [],
);

export interface RouteMetadataProviderProps extends PropsWithChildren {
  readonly routes: readonly AppClientRegisteredRoute[];
}

export function RouteMetadataProvider({
  children,
  routes,
}: RouteMetadataProviderProps): ReactElement {
  return (
    <RouteMetadataContext.Provider value={routes}>
      {children}
    </RouteMetadataContext.Provider>
  );
}

export function useRouteMetadata(): readonly AppClientRegisteredRoute[] {
  return useContext(RouteMetadataContext);
}

export function RouteMetadataBoundary({
  children,
  routes,
}: RouteMetadataProviderProps): ReactElement {
  const { pathname } = useLocation();
  const matches =
    matchRouteTree(routes, pathname)?.map(({ route }) => route) ?? [];

  return (
    <RouteMetadataProvider routes={matches}>{children}</RouteMetadataProvider>
  );
}

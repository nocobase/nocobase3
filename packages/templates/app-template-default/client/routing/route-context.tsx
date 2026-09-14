import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { useLocation } from 'react-router';
import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import { matchRouteTree } from './route-navigation.js';

/* eslint-disable react-refresh/only-export-components -- provider and hooks are intentionally colocated */

/**
 * One level of the trail leading to the current page.
 *
 * `pathname` is the resolved URL rather than the registered pattern, so a level such as `/orders/:id` links to where
 * the user actually is. `title` is absent when the route is structure rather than a destination — a tab, an overlay,
 * or a layer that exists only to share a layout — and consumers skip those levels.
 */
export interface RouteTrailEntry {
  readonly route: AppClientRegisteredRoute;
  readonly pathname: string;
  readonly title?: string;
}

const RouteTrailContext = createContext<readonly RouteTrailEntry[]>([]);
const CurrentRouteContext = createContext<AppClientRegisteredRoute | undefined>(
  undefined,
);

export interface RouteTrailProviderProps extends PropsWithChildren {
  readonly trail: readonly RouteTrailEntry[];
}

/** Supplies a trail directly. `RouteMetadataBoundary` derives one; tests and embedders may state one. */
export function RouteTrailProvider({
  children,
  trail,
}: RouteTrailProviderProps): ReactElement {
  return (
    <RouteTrailContext.Provider value={trail}>
      {children}
    </RouteTrailContext.Provider>
  );
}

export function useRouteTrail(): readonly RouteTrailEntry[] {
  return useContext(RouteTrailContext);
}

export interface RouteMetadataBoundaryProps extends PropsWithChildren {
  readonly routes: readonly AppClientRegisteredRoute[];
}

/**
 * Resolves the current location against a route tree and publishes the resulting trail.
 *
 * Every level is named by its route. A title states what kind of page a level is rather than which record it is
 * showing, so it is known before the page loads anything and the trail never changes while the user waits.
 */
export function RouteMetadataBoundary({
  children,
  routes,
}: RouteMetadataBoundaryProps): ReactElement {
  const { pathname } = useLocation();
  const trail = useMemo(
    () =>
      matchRouteTree(routes, pathname)?.map(
        ({ route, pathname: resolvedPathname }) => ({
          route,
          pathname: resolvedPathname,
          title: route.title,
        }),
      ) ?? [],
    [pathname, routes],
  );

  return <RouteTrailProvider trail={trail}>{children}</RouteTrailProvider>;
}

/**
 * Whether a child *page* has taken over from the page asking.
 *
 * A page and an overlay both render through the same outlet, so a page with children needs to tell them apart: an
 * overlay floats above and leaves the page beneath it on screen, while a child page replaces it. The answer follows
 * from the same rule breadcrumbs use — the deepest titled level is the page the user considers themselves to be on.
 */
export function useChildPageActive(): boolean {
  const route = useContext(CurrentRouteContext);
  const trail = useRouteTrail();
  const deepestPage = trail.filter((entry) => entry.title !== undefined).at(-1);

  return Boolean(route && deepestPage && deepestPage.route.id !== route.id);
}

export interface CurrentRouteProviderProps extends PropsWithChildren {
  readonly route: AppClientRegisteredRoute;
}

/** Tells the page which route rendered it, which is what lets it ask whether a child page has taken over. */
export function CurrentRouteProvider({
  children,
  route,
}: CurrentRouteProviderProps): ReactElement {
  return (
    <CurrentRouteContext.Provider value={route}>
      {children}
    </CurrentRouteContext.Provider>
  );
}

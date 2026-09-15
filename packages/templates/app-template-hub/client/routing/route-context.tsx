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
 * the user actually is. The route names itself: a level with no `title` is structure rather than a destination — a
 * tab, an overlay, or a layer that exists only to share a layout — and consumers skip it.
 */
export interface RouteTrailEntry {
  readonly route: AppClientRegisteredRoute;
  readonly pathname: string;
}

const RouteTreeContext = createContext<readonly AppClientRegisteredRoute[]>([]);
const CurrentRouteContext = createContext<AppClientRegisteredRoute | undefined>(
  undefined,
);

export interface RouteTreeProviderProps extends PropsWithChildren {
  readonly routes: readonly AppClientRegisteredRoute[];
}

/**
 * Publishes the routes a page may be reached through, so anything below can work out where it is.
 *
 * It carries the tree rather than a trail derived from it: deriving is `useRouteTrail`'s job, which keeps the
 * derivation and the memo that guards it in one place. `routes` still has to keep its identity between renders,
 * since a new array re-renders every consumer; callers pass a memoised one.
 */
export function RouteTreeProvider({
  children,
  routes,
}: RouteTreeProviderProps): ReactElement {
  return (
    <RouteTreeContext.Provider value={routes}>
      {children}
    </RouteTreeContext.Provider>
  );
}

/**
 * The trail of route levels leading to the current location.
 *
 * Every level is named by its route. A title states what kind of page a level is rather than which record it is
 * showing, so it is known before the page loads anything and the trail never changes while the user waits.
 */
export function useRouteTrail(): readonly RouteTrailEntry[] {
  const routes = useContext(RouteTreeContext);
  const { pathname } = useLocation();

  return useMemo(
    () =>
      matchRouteTree(routes, pathname)?.map(
        ({ route, pathname: resolvedPathname }) => ({
          route,
          pathname: resolvedPathname,
        }),
      ) ?? [],
    [pathname, routes],
  );
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

  // Only a page that names a destination can be taken over from. An overlay or a tab never joins the titled levels,
  // so without this it would read its own ancestor as a child page and hand its content away.
  if (!route?.title) return false;

  const deepest = trail
    .filter((entry) => entry.route.title !== undefined)
    .at(-1);

  return Boolean(deepest && deepest.route.id !== route.id);
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

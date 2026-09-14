import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { useLocation } from 'react-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import { matchRouteTree } from './route-navigation.js';

/* eslint-disable react-refresh/only-export-components -- provider and hooks are intentionally colocated */

/**
 * One level of the trail leading to the current page.
 *
 * `pathname` is the resolved URL rather than the registered pattern, so a level such as `/orders/edit/:id` links to
 * where the user actually is. `title` is absent when the route is structure rather than a destination — a tab, an
 * overlay, or a layer that exists only to share a layout — and consumers skip those levels.
 */
export interface RouteTrailEntry {
  readonly route: AppClientRegisteredRoute;
  readonly pathname: string;
  readonly title?: string;
}

/** Registers a title for one route and returns the function that withdraws it again. */
type PageTitleRegistry = (routeId: string, title: string) => () => void;

const RouteTrailContext = createContext<readonly RouteTrailEntry[]>([]);
const CurrentRouteContext = createContext<AppClientRegisteredRoute | undefined>(
  undefined,
);
const PageTitleRegistryContext = createContext<PageTitleRegistry | undefined>(
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
 * Titles arrive from two directions. A route declares one statically, which is available immediately; a page may
 * report a better one at runtime through `usePageTitle` once it knows the record it is showing. The static title
 * remains the value shown until then, so the trail never gains a level mid-load and shifts the page beneath it.
 */
export function RouteMetadataBoundary({
  children,
  routes,
}: RouteMetadataBoundaryProps): ReactElement {
  const { pathname } = useLocation();
  const [reportedTitles, setReportedTitles] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());

  const register = useCallback<PageTitleRegistry>((routeId, title) => {
    setReportedTitles((previous) =>
      previous.get(routeId) === title
        ? previous
        : new Map(previous).set(routeId, title),
    );
    return () => {
      setReportedTitles((previous) => {
        if (!previous.has(routeId)) return previous;
        const next = new Map(previous);
        next.delete(routeId);
        return next;
      });
    };
  }, []);

  const trail = useMemo(
    () =>
      matchRouteTree(routes, pathname)?.map(
        ({ route, pathname: resolvedPathname }) => ({
          route,
          pathname: resolvedPathname,
          title: reportedTitles.get(route.id) ?? route.title,
        }),
      ) ?? [],
    [pathname, reportedTitles, routes],
  );

  return (
    <PageTitleRegistryContext.Provider value={register}>
      <RouteTrailProvider trail={trail}>{children}</RouteTrailProvider>
    </PageTitleRegistryContext.Provider>
  );
}

export interface CurrentRouteProviderProps extends PropsWithChildren {
  readonly route: AppClientRegisteredRoute;
}

/** Tells the page which route rendered it, which is what lets `usePageTitle` know the level it is naming. */
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

/**
 * Names the current page from data only it has, such as the record it loaded.
 *
 * Pass `undefined` while the name is not known yet; the route's declared title stays in place until a value arrives.
 * The title is withdrawn when the page unmounts, so a level never outlives the page that named it.
 */
export function usePageTitle(title: string | undefined): void {
  const route = useContext(CurrentRouteContext);
  const register = useContext(PageTitleRegistryContext);

  useEffect(() => {
    if (!route || !register || !title) return;
    return register(route.id, title);
  }, [register, route, title]);
}

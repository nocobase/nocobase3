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
const NavigationRootContext = createContext<string | null>('/');
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

/**
 * Where the navigation space the current page belongs to begins, or `null` when it has no root crumb of its own.
 *
 * A surface such as the settings centre is its own space and already offers a way back to the application, so a
 * Home crumb there leads out of the trail rather than up it. Reading this from context is what lets a page — a
 * plugin's page included — render a trail that is correct in either place without being told which one it is in.
 */
export function useNavigationRoot(): string | null {
  return useContext(NavigationRootContext);
}

export interface RouteMetadataBoundaryProps extends PropsWithChildren {
  readonly routes: readonly AppClientRegisteredRoute[];
  /** The path this navigation space starts at. `null` for a surface that has no root crumb of its own. */
  readonly home?: string | null;
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
  home = '/',
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
      <NavigationRootContext.Provider value={home}>
        <RouteTrailProvider trail={trail}>{children}</RouteTrailProvider>
      </NavigationRootContext.Provider>
    </PageTitleRegistryContext.Provider>
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
  const deepestPage = trail.filter((entry) => entry.title !== undefined).at(-1);

  return Boolean(route && deepestPage && deepestPage.route.id !== route.id);
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

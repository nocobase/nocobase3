import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface AppClientRenderableRoute extends AppClientRegisteredRoute {
  readonly Component: LazyExoticComponent<ComponentType>;
}

export interface AppClientRenderableRouteGroups {
  readonly guest: readonly AppClientRenderableRoute[];
  readonly optional: readonly AppClientRenderableRoute[];
  readonly required: readonly AppClientRenderableRoute[];
}

export function createRenderablePluginRoutes(
  routes: readonly AppClientRegisteredRoute[],
): readonly AppClientRenderableRoute[] {
  return Object.freeze(
    routes.map((route) =>
      Object.freeze({
        ...route,
        Component: lazy(route.componentLoader),
      }),
    ),
  );
}

export function groupRenderablePluginRoutes(
  routes: readonly AppClientRenderableRoute[],
): AppClientRenderableRouteGroups {
  return Object.freeze({
    guest: Object.freeze(routes.filter((route) => route.auth === 'guest')),
    optional: Object.freeze(
      routes.filter((route) => route.auth === 'optional'),
    ),
    required: Object.freeze(
      routes.filter((route) => route.auth === 'required'),
    ),
  });
}

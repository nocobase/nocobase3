import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface AppClientRenderableRoute extends AppClientRegisteredRoute {
  readonly Component: LazyExoticComponent<ComponentType>;
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

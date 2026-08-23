import { defineAppClient, type AppClientConfig } from '@nocobase/app-client';
import { createElement } from 'react';

import { createRenderablePluginRoutes } from './plugin-routes';
import { AppRoutes } from './routes';
import type { AppClientRuntime } from './runtime';

export function createApp(runtime: AppClientRuntime): AppClientConfig {
  return defineAppClient({
    basename: runtime.basename,
    providers: runtime.providers.map((provider) => provider.component),
    refine: runtime.refine,
    routes: createElement(AppRoutes, {
      pluginRoutes: createRenderablePluginRoutes(runtime.routes),
    }),
  });
}

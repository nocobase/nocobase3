import { defineAppClient, type AppClientConfig } from '@nocobase/app-client';
import { createElement } from 'react';

import { createRenderablePluginRoutes } from './plugin-routes';
import { AppRoutes } from './routes';
import type { AppClientRuntime } from './runtime';

export function createApp(runtime: AppClientRuntime): AppClientConfig {
  return defineAppClient({
    basename: runtime.basename,
    refine: {
      authProvider: runtime.authProvider,
      dataProvider: runtime.dataProvider,
      options: {
        title: {
          text: 'NocoBase',
        },
      },
    },
    routes: createElement(AppRoutes, {
      pluginRoutes: createRenderablePluginRoutes(runtime.routes),
    }),
  });
}

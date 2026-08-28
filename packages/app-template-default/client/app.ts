import { defineAppClient, type AppClientConfig } from '@nocobase/app-client';
import { createElement } from 'react';

import { AppRouter } from './routing/app-router.js';
import type { AppClientRuntime } from './runtime';

export function createApp(runtime: AppClientRuntime): AppClientConfig {
  return defineAppClient({
    basename: runtime.basename,
    providers: runtime.providers.map((provider) => provider.component),
    refine: runtime.refine,
    routes: createElement(AppRouter, {
      clientRoutes: runtime.routes,
      clientSettings: runtime.settings,
      clientSettingGroups: runtime.settingGroups,
    }),
  });
}

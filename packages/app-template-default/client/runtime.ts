import { defineAppRuntime } from '@nocobase/app-client/runtime';
import { getPortalBase } from '@nocobase/app-portal-sdk/runtime';

import clientPlugins from './plugins.js';
import routeComponentOverrides from './route-overrides.js';
import sourceExtensions from './source-extensions.js';

const appRuntime = defineAppRuntime({
  packageName: '@nocobase/app-template-default',
  basename: getPortalBase(),
  bootstrap: () => import('./bootstrap.js'),
  locales: () => import('./locales/index.js'),
  providers: () => import('./providers.js'),
  routes: () => import('./routes.js'),
  plugins: clientPlugins.plugins,
  routeComponentOverrides: [
    ...clientPlugins.routeComponentOverrides,
    ...routeComponentOverrides,
  ],
  sourceExtensions,
  validate(runtime) {
    if (!runtime.refine.authProvider) {
      throw new Error(
        'Default App requires an enabled client plugin that registers an auth provider.',
      );
    }
    if (!runtime.refine.dataProvider) {
      throw new Error(
        'Default App requires an enabled client plugin that registers a data provider.',
      );
    }
    if (
      !runtime.routes.some(
        (route) =>
          route.path.toLowerCase() === '/login' && route.auth === 'guest',
      )
    ) {
      throw new Error(
        'Default App requires an enabled client plugin that registers a guest /login route.',
      );
    }
  },
});

export default appRuntime;

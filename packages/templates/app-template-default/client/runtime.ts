import { createAppClientConfig } from '@nocobase/app-client';
import { defineAppRuntime } from '@nocobase/app-client/runtime';
import { getPortalBase } from '@nocobase/app-portal-sdk/runtime';

import clientPlugins from './plugins.js';
import reactProviders from './react-providers.js';
import routeComponentOverrides from './route-overrides.js';
import routes from './routes.js';
import serviceProviders from './service-provider.js';
import sourceExtensions from './source-extensions.js';

const appRuntime = defineAppRuntime({
  packageName: '@nocobase/app-template-default',
  basename: getPortalBase(),
  config: createAppClientConfig,
  serviceProviders,
  locales: {
    'en-US': () => import('./locales/en-US.js'),
    'zh-CN': () => import('./locales/zh-CN.js'),
  },
  reactProviders,
  routes,
  plugins: clientPlugins.plugins,
  routeComponentOverrides: [
    ...clientPlugins.routeComponentOverrides,
    ...routeComponentOverrides,
  ],
  sourceExtensions,
  validate(app) {
    if (!app.refineConfig.authProvider) {
      throw new Error(
        'Default App requires an enabled client plugin that registers an auth provider.',
      );
    }
    if (!app.refineConfig.dataProvider) {
      throw new Error(
        'Default App requires an enabled client plugin that registers a data provider.',
      );
    }
    if (
      !app.runtime.routes.some(
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

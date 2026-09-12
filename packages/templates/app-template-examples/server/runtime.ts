import {
  defineAppRuntime,
  type AppRuntimeDefinition,
} from '@nocobase/app-server/runtime';

import { createAppConfig } from './config/index.js';
import plugins from './plugins.js';
import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const appRuntime: AppRuntimeDefinition = defineAppRuntime({
  config: createAppConfig,
  plugins,
  serviceProviders,
  routes,
  // The application's own server locale files, which are what decides the languages the server offers.
  locales: () => import('./locales/index.js'),
});

export default appRuntime;

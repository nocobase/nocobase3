import {
  defineAppRuntime,
  type AppRuntimeDefinition,
} from '@nocobase/app-server/runtime';

import { stableHubStorageRoot } from './storage.js';

import defaultConfigs from './config/index.js';
import { createAppConfig } from './config.js';
import plugins from './plugins.js';
import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const appRuntime: AppRuntimeDefinition = defineAppRuntime({
  resolvePaths: (runtime) =>
    runtime.mode === 'standalone'
      ? {
          ...runtime.paths,
          storageDir: stableHubStorageRoot(
            runtime.paths.rootDir,
            runtime.paths.storageDir,
            runtime.env.HUB_STORAGE_DIR,
          ),
        }
      : runtime.paths,
  createAppConfig,
  defaultConfigs,
  plugins,
  serviceProviders,
  routes,
  // The application's own server locale files, which are what decides the languages the server offers.
  locales: () => import('./locales/index.js'),
});

export default appRuntime;

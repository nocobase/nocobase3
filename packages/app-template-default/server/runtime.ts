import {
  defineAppRuntime,
  type AppRuntimeDefinition,
} from '@nocobase/app-server-kit/runtime';

import { createAppConfig } from './config/index.js';
import plugins from './plugins.js';
import providers from './providers/index.js';
import routes from './routes/index.js';

const appRuntime: AppRuntimeDefinition = defineAppRuntime({
  config: createAppConfig,
  plugins,
  serviceProviders: providers,
  routes,
});

export default appRuntime;

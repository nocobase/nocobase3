import {
  defineAppRuntime,
  type AppRuntimeDefinition,
} from '@nocobase/app-server-kit/runtime';

import { createAppConfig } from './config/index.js';
import plugins from './plugins.js';
import providers from './providers/index.js';
import apiRoutes from './routes/api/index.js';
import rootRoutes from './routes/index.js';

const appRuntime: AppRuntimeDefinition = defineAppRuntime({
  config: createAppConfig,
  plugins,
  providers,
  apiRoutes,
  rootRoutes,
});

export default appRuntime;

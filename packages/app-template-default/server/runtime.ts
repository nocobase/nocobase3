import {
  defineAppRuntime,
  type AppRuntimeDefinition,
} from '@nocobase/app-server-kit/runtime';

import config from './config/index.js';
import type { AppConfig, DefaultAppScopeConfig } from './config/types.js';
import plugins from './plugins.js';
import providers from './providers/index.js';
import routes from './routes/index.js';

const appRuntime: AppRuntimeDefinition<AppConfig, DefaultAppScopeConfig> =
  defineAppRuntime<AppConfig, DefaultAppScopeConfig>({
    config,
    plugins,
    providers,
    routes,
  });

export default appRuntime;

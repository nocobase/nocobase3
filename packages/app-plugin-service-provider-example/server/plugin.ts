import {
  defineServerPlugin,
  type AppPluginApplication,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRoutes,
} from '@nocobase/app-server-kit/router';

import ServiceProviderExampleProvider from './provider.js';
import { heartbeatConfig } from './config.js';
import registerServiceProviderExampleRoutes from './routes/index.js';

const serviceProviderExampleApiRoutes: AppApiRoutes<AppPluginApplication> =
  defineApiRoutes({
    name: '@nocobase/app-plugin-service-provider-example/api',
    register(router, app): void {
      registerServiceProviderExampleRoutes(app, router);
    },
  });

const serviceProviderExamplePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-service-provider-example',
  config: heartbeatConfig,
  providers: [ServiceProviderExampleProvider],
  apiRoutes: [serviceProviderExampleApiRoutes],
});

export default serviceProviderExamplePlugin;

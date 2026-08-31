import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const serviceProviderExamplePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-service-provider-example',
  serviceProviders,
  routes,
});

export default serviceProviderExamplePlugin;

import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const realtimeExamplePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-realtime-example',
  serviceProviders,
  routes,
});

export default realtimeExamplePlugin;

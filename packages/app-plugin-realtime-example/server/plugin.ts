import {
  defineServerPlugin,
  type AppPluginApplication,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';
import {
  defineRootRoutes,
  type AppRootRoutes,
} from '@nocobase/app-server-kit/router';

import RealtimeExampleProvider from './provider.js';
import registerRealtimeExampleRoutes from './routes/index.js';

const realtimeExampleRootRoutes: AppRootRoutes<AppPluginApplication> =
  defineRootRoutes({
    name: '@nocobase/app-plugin-realtime-example/root',
    register(router): void {
      registerRealtimeExampleRoutes(router);
    },
  });

const realtimeExamplePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-realtime-example',
  providers: [RealtimeExampleProvider],
  rootRoutes: [realtimeExampleRootRoutes],
});

export default realtimeExamplePlugin;

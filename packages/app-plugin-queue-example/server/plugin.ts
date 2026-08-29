import {
  defineServerPlugin,
  type AppPluginApplication,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRoutes,
} from '@nocobase/app-server-kit/router';

import registerQueueExampleRoutes from './routes/index.js';

const queueExampleApiRoutes: AppApiRoutes<AppPluginApplication> =
  defineApiRoutes({
    name: '@nocobase/app-plugin-queue-example/api',
    register(router, app): void {
      registerQueueExampleRoutes(app, router);
    },
  });

const queueExamplePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-queue-example',
  apiRoutes: [queueExampleApiRoutes],
  queue: {
    jobs: ['./server/jobs'],
  },
});

export default queueExamplePlugin;

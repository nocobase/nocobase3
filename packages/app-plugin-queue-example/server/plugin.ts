import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import routes from './routes/index.js';

const queueExamplePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-queue-example',
  routes,
  queue: {
    jobs: ['./server/jobs'],
  },
});

export default queueExamplePlugin;

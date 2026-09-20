import path from 'node:path';

import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const auditExamplePlugin: AppServerPlugin = defineServerPlugin({
  baseDir: path.resolve(import.meta.dirname, '..'),
  packageName: '@nocobase/app-plugin-audit-example',
  serviceProviders,
  routes,
  database: {
    migrations: './database/migrations',
  },
  queue: { jobs: ['./server/jobs'] },
});

export default auditExamplePlugin;

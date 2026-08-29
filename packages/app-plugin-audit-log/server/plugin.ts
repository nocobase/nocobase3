import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import providers from './providers/index.js';
import routes from './routes/index.js';

const auditLogPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-audit-log',
  providers,
  routes,
  database: {
    migrations: './database/migrations',
    seeds: './database/seeds',
  },
  queue: {
    jobs: ['./server/jobs'],
  },
});

export default auditLogPlugin;

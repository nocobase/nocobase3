import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/plugin.js';

const aiKnowledgeBasePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-ai-knowledge-base',
  serviceProviders,
  routes,
  queue: {
    jobs: ['./server/jobs'],
  },
  database: {
    migrations: './database/migrations',
  },
});

export default aiKnowledgeBasePlugin;

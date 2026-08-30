import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import providers from './providers/index.js';
import routes from './routes/plugin.js';

const aiKnowledgeBasePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-ai-knowledge-base',
  providers,
  routes,
  database: {
    migrations: './database/migrations',
  },
});

export default aiKnowledgeBasePlugin;

import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import { defineApiRoutes } from '@nocobase/app-server/router';
import { auditConfig } from './config.js';
import { auditCompositionToken } from './providers/composition.js';
import { createAuditApiRoutes } from './routes/index.js';
import serviceProviders from './providers/index.js';

const auditPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-audit',
  serviceProviders,
  config: auditConfig,
  routes: [
    defineApiRoutes((app) =>
      createAuditApiRoutes(
        app.container.resolve(auditCompositionToken).routes(),
      ).createRouter(app),
    ),
  ],
  database: { migrations: './server/database/migrations' },
});

export default auditPlugin;

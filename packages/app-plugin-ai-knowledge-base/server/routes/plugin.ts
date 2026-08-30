import { databaseManagerToken } from '@nocobase/app-database';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server/tokens';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { queueManagerToken } from '@nocobase/queue';
import { Hono } from 'hono';

import registerRoutes from './index.js';

export const knowledgeBaseApiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = registerRoutes(
      {
        app: router,
        config: app.config,
        deps: {
          ai: app.container.resolve(aiManagerToken),
          auth: app.container.resolve(authenticationToken),
          database: app.container.resolve(databaseManagerToken),
          queueManager: app.container.resolve(queueManagerToken),
        },
        paths: app.paths,
        services: {},
      },
      false,
    );
    router.route('/', routes);
    return router;
  });

export default [knowledgeBaseApiRoutes] as const;

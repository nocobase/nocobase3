import { databaseManagerToken } from '@nocobase/db';
import {
  aiConfig,
  resolveAIKnowledgeBaseStorageDisks,
} from '@nocobase/app-plugin-ai-employee/server/config';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server/tokens';
import { fileStorageFactoryToken } from '@nocobase/ai-employee';
import { driveConfig } from '@nocobase/app-server/drive';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { queueManagerToken } from '@nocobase/app-server/queue';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
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
          database: app.container.resolve(databaseManagerToken),
          queueManager: app.container.resolve(queueManagerToken),
          fileStorageFactory: app.container.resolve(fileStorageFactoryToken),
          allowedStorageDisks: resolveAIKnowledgeBaseStorageDisks(
            app.config.get(aiConfig),
            app.config.get(driveConfig).default,
          ),
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

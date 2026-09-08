import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { serviceFactoryToken } from '../factories/service-factory.js';
import { createKnowledgeBaseRouter } from './router.js';

export const knowledgeBaseApiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    router.route(
      '/ai',
      createKnowledgeBaseRouter({
        authentication: container.resolve(authenticationToken),
        services: container.resolve(serviceFactoryToken),
      }),
    );
    return router;
  });

export default [knowledgeBaseApiRoutes] as const;

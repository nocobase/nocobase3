import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { serviceFactoryToken } from '../factories/service-factory.js';
import { createKnowledgeBaseRouter } from './router.js';
export const knowledgeBaseApiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    router.route(
      '/',
      createKnowledgeBaseRouter({
        authentication: container.resolve(authenticationToken),
        services: container.resolve(serviceFactoryToken),
      }),
    );
    return router;
  });

export const knowledgeBaseLegacyRoutes: AppRootRouteContribution<AppPluginApplication> =
  defineRootRoutes(({ container }) => {
    const router = new Hono();
    router.route(
      '/v2/api',
      createKnowledgeBaseRouter({
        authentication: container.resolve(authenticationToken),
        services: container.resolve(serviceFactoryToken),
      }),
    );
    return router;
  });

const routes: readonly AppRouteContribution<AppPluginApplication>[] = [
  knowledgeBaseApiRoutes,
  knowledgeBaseLegacyRoutes,
];

export default routes;

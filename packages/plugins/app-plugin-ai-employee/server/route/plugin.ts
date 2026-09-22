import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { loggingToken } from '@nocobase/app-server/logging';
import { Hono } from 'hono';

import { serviceFactoryToken } from '../factory/service-factory.js';
import { createAIEmployeeRoutes } from './index.js';

export const aiEmployeeApiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    router.route(
      '/ai',
      createAIEmployeeRoutes({
        authentication: container.resolve(authenticationToken),
        authorization: container.resolve(authorizationToken),
        services: container.resolve(serviceFactoryToken),
        logger: container.resolve(loggingToken).getLogger('ai-employee'),
      }),
    );
    return router;
  });

export default [aiEmployeeApiRoutes] as const;

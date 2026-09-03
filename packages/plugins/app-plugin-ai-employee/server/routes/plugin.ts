import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { createPluginContextMiddleware } from '../runtime.js';
import { aiEmployeeRuntimeToken } from '../tokens.js';
import { registerAIEmployeeRoutes } from './index.js';
import { registerAIListLLMServicesCompatibilityRoute } from './ai.js';
import { createAICurrentUserMiddleware } from './utils.js';

export const aiEmployeeApiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    const runtime = container.resolve(aiEmployeeRuntimeToken);
    const auth = container.resolve(authenticationToken);
    const routes = new Hono();
    registerAIEmployeeRoutes(
      routes,
      createAICurrentUserMiddleware(auth),
      createPluginContextMiddleware(runtime),
    );
    router.route('/ai', routes);
    registerAIListLLMServicesCompatibilityRoute(
      router,
      createAICurrentUserMiddleware(auth),
      createPluginContextMiddleware(runtime),
    );
    return router;
  });

export default [aiEmployeeApiRoutes] as const;

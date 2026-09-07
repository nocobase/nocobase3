import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { aiEmployeeAuditToken } from '../audit.js';
import { aiAuditDeclaration, aiAuditIdentity } from '../audit-http.js';

import { createPluginContextMiddleware } from '../runtime.js';
import { aiEmployeeRuntimeToken } from '../tokens.js';
import { registerAIEmployeeRoutes } from './index.js';
import { createAICurrentUserMiddleware } from './utils.js';

export const aiEmployeeApiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    const runtime = container.resolve(aiEmployeeRuntimeToken);
    const auth = container.resolve(authenticationToken);
    const routes = new Hono();
    const bridge = container.has(aiEmployeeAuditToken)
      ? container.resolve(aiEmployeeAuditToken)
      : undefined;
    const declarations = new Map<string, string>();
    if (bridge) routes.use('*', aiAuditDeclaration(bridge, declarations));
    registerAIEmployeeRoutes(
      routes,
      createAICurrentUserMiddleware(auth),
      createPluginContextMiddleware(runtime),
      ...(bridge ? [aiAuditIdentity(bridge)] : []),
    );
    for (const route of routes.routes) {
      if (route.method !== 'ALL' && route.path !== '*') {
        const name = route.path.slice(1);
        declarations.set(
          `${route.method}:${name}`,
          `ai.${name.replace(':', '.')}`,
        );
      }
    }
    router.route('/ai', routes);
    return router;
  });

export default [aiEmployeeApiRoutes] as const;

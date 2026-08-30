import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

import { systemInfoServiceToken, type SystemInfoService } from '../tokens.js';

export interface SystemInfoRouteAuthentication {
  required(): ReturnType<Auth['required']>;
}

export function registerSystemInfoRoutes(
  router: Hono,
  authentication: SystemInfoRouteAuthentication,
  service: SystemInfoService,
): void {
  router.use('*', authentication.required());
  router.get('/system-info', (context) => context.json(service.getInfo()));
}

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    registerSystemInfoRoutes(
      router,
      container.resolve(authenticationToken),
      container.resolve(systemInfoServiceToken),
    );

    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;

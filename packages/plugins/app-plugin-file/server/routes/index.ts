import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { createFileDemoRoutes } from './attachments.js';
import { appConfig } from '@nocobase/app-server/config';
import { driveConfig } from '@nocobase/app-server/drive';
import { sessionConfig } from '@nocobase/app-server/session';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ config, container }) => {
    const router = new Hono();
    router.route(
      '/attachments',
      createFileDemoRoutes({
        config: {
          app: config.get(appConfig),
          drive: config.get(driveConfig),
          session: config.get(sessionConfig),
        },
        container,
      }),
    );
    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export { createFileDemoRoutes } from './attachments.js';
export default routes;

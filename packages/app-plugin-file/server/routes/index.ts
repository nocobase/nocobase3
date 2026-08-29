import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

import type { FilePluginConfig } from '../plugin-runtime.js';
import { createFileDemoRoutes } from './attachments.js';

export const apiRoutes: AppApiRouteContribution<
  AppPluginApplication<FilePluginConfig>
> = defineApiRoutes(({ config, container }) => {
  const router = new Hono();
  router.route('/attachments', createFileDemoRoutes({ config, container }));
  return router;
});

const routes: readonly AppApiRouteContribution<
  AppPluginApplication<FilePluginConfig>
>[] = [apiRoutes];

export { createFileDemoRoutes } from './attachments.js';
export default routes;

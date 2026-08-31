import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineRootRoutes,
  type AppRootRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

import { renderRealtimePage } from '../realtime-page.js';

export const rootRoutes: AppRootRouteContribution<AppPluginApplication> =
  defineRootRoutes(() => {
    const router = new Hono();
    router.get('/realtime', (context) => context.html(renderRealtimePage()));
    return router;
  });

const routes: readonly AppRootRouteContribution<AppPluginApplication>[] = [
  rootRoutes,
];

export default routes;

import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRouteContribution,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { appExampleServiceToken } from '../providers/index.js';

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();

    router.get('/example', (context) => {
      const exampleService = app.container.resolve(appExampleServiceToken);

      return context.json({
        scope: 'api',
        message: exampleService.getMessage(),
      });
    });

    return router;
  },
);

export const rootRoutes: AppRootRouteContribution<Application> =
  defineRootRoutes((app) => {
    const router = new Hono();

    router.get('/example', (context) => {
      const exampleService = app.container.resolve(appExampleServiceToken);

      return context.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Application Route Example</title>
  </head>
  <body>
    <main>
      <h1>Application Route Example</h1>
      <p>${exampleService.getMessage()}</p>
    </main>
  </body>
</html>`);
    });

    return router;
  });

const routes: readonly AppRouteContribution<Application>[] = [
  apiRoutes,
  rootRoutes,
];

export default routes;

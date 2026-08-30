import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { queueManagerToken } from '@nocobase/queue';
import { Hono } from 'hono';

import QueueExampleJob, {
  queueExampleExecutions,
} from '../jobs/queue-example.js';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    const authentication = container.resolve(authenticationToken);
    const queueManager = container.resolve(queueManagerToken);

    router.use('/queue-example', authentication.required());
    router.get('/queue-example', async (context) => {
      const result = await queueManager.dispatch(QueueExampleJob, {
        message: 'Hello from the Queue example plugin',
        requestedAt: new Date().toISOString(),
      });

      return context.json({
        ...result,
        job: QueueExampleJob.options.name,
        queue: QueueExampleJob.options.queue,
        syncExecutions: queueExampleExecutions.length,
      });
    });

    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;

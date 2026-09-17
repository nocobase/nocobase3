import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { queueServiceToken } from '@nocobase/app-server/queue';
import { Hono } from 'hono';

import {
  queueExampleChannel,
  queueExampleQueue,
  type QueueExamplePayload,
} from '../jobs/queue-example.js';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    const authentication = container.resolve(authenticationToken);
    const producer = container
      .resolve(queueServiceToken)
      .producer(queueExampleQueue);

    router.use('/queue-example', authentication.required());
    router.get('/queue-example', async (context) => {
      const payload: QueueExamplePayload = {
        message: 'Hello from the Queue example plugin',
        requestedAt: new Date().toISOString(),
      };
      const result = await producer.publish(queueExampleChannel, payload);

      return context.json({
        ...result,
        channel: queueExampleChannel,
        queue: queueExampleQueue,
      });
    });

    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;

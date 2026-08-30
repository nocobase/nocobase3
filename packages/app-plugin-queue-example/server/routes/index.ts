import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { queueManagerToken, type NocoBaseQueueManager } from '@nocobase/queue';
import { Hono } from 'hono';

import QueueExampleJob, {
  queueExampleExecutions,
} from '../jobs/queue-example.js';

export interface QueueExampleAuthentication {
  required(): ReturnType<Auth['required']>;
}

export type QueueExampleDispatcher = Pick<NocoBaseQueueManager, 'dispatch'>;

export function registerQueueExampleRoutes(
  router: Hono,
  authentication: QueueExampleAuthentication,
  dispatcher: QueueExampleDispatcher,
): void {
  router.use('/queue-example', authentication.required());
  router.get('/queue-example', async (context) => {
    const result = await dispatcher.dispatch(QueueExampleJob, {
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
}

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const queueManager = container.resolve(queueManagerToken);
    const router = new Hono();
    registerQueueExampleRoutes(
      router,
      container.resolve(authenticationToken),
      queueManager,
    );

    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;

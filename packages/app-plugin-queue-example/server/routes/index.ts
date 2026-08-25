import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import { Hono } from 'hono';

import QueueExampleJob, {
  queueExampleExecutions,
} from '../jobs/queue-example.js';

export interface QueueExamplePluginRoutesDeps {
  queueManager: NocoBaseQueueManager;
}

export type QueueExamplePluginRoutesContext = AppPluginRoutesContext<
  QueueExamplePluginRoutesDeps,
  unknown
>;

export default ({ app, deps }: QueueExamplePluginRoutesContext): void => {
  const routes = new Hono();

  routes.get('/', async (context) => {
    const result = await deps.queueManager.dispatch(QueueExampleJob, {
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

  app.route('/queue-example', routes);
};

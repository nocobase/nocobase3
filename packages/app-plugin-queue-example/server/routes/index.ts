import type { AppPluginRoutesApplication } from '@nocobase/app-server-kit/plugins';
import { queueManagerToken } from '@nocobase/queue';
import { Hono } from 'hono';

import QueueExampleJob, {
  queueExampleExecutions,
} from '../jobs/queue-example.js';

export type QueueExamplePluginRoutesApplication = AppPluginRoutesApplication;

export default ({
  router,
  container,
}: QueueExamplePluginRoutesApplication): void => {
  const queueManager = container.resolve(queueManagerToken);
  const routes = new Hono();

  routes.get('/', async (context) => {
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

  router.route('/queue-example', routes);
};

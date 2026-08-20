import { Hono } from 'hono';

import type { NocoBaseQueueManager } from '@nocobase/queue';
import QueueDemoJob, { queueDemoExecutions } from '../../jobs/queue-demo.js';

export interface CreateQueueRoutesOptions {
  queueManager: NocoBaseQueueManager;
}

export function createQueueRoutes(options: CreateQueueRoutesOptions): Hono {
  const queue = new Hono();

  queue.post('/demo', async (context) => {
    const result = await options.queueManager.dispatch(QueueDemoJob, {
      message: 'Hello from NocoBase queue',
      requestedAt: new Date().toISOString(),
    });

    return context.json({
      ...result,
      job: QueueDemoJob.options.name,
      queue: QueueDemoJob.options.queue,
      syncExecutions: queueDemoExecutions.length,
    });
  });

  return queue;
}

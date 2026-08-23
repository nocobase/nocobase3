import { createQueueManager, createSyncQueueConfig } from '@nocobase/queue';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import { queueExampleExecutions } from '../server/jobs/queue-example.js';
import registerRoutes from '../server/routes/index.js';

describe('queue example plugin routes', () => {
  const managers: Array<ReturnType<typeof createQueueManager>> = [];

  afterEach(async () => {
    queueExampleExecutions.length = 0;
    await Promise.all(managers.splice(0).map((manager) => manager.close()));
  });

  it('dispatches and executes the example job', async () => {
    const queueManager = createQueueManager(createSyncQueueConfig(), {
      jobFactory: (JobClass) =>
        new JobClass({
          logger: {
            info: () => undefined,
          },
        }),
    });
    managers.push(queueManager);
    const app = new Hono();

    registerRoutes({
      app,
      deps: { queueManager },
      services: undefined,
    });

    const response = await app.request('/queue-example');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jobId: expect.any(String),
      job: 'QueueExample',
      queue: 'default',
      syncExecutions: 1,
    });
    expect(queueExampleExecutions).toEqual([
      {
        message: 'Hello from the Queue example plugin',
        requestedAt: expect.any(String),
        executedAt: expect.any(String),
      },
    ]);
  });
});

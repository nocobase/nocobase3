import { createConfigPaths } from '@nocobase/app-server-kit/config';
import { createQueueManager, createSyncQueueConfig } from '@nocobase/queue';
import { Hono, type MiddlewareHandler } from 'hono';
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
      config: undefined,
      deps: { auth: { required: () => authenticatedOnly }, queueManager },
      paths: createConfigPaths({ rootDir: '/missing' }),
      services: undefined,
    });

    const denied = await app.request('/queue-example');
    const response = await app.request('/queue-example', {
      headers: { 'x-test-auth': 'allowed' },
    });

    expect(denied.status).toBe(401);
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

const authenticatedOnly: MiddlewareHandler = async (context, next) => {
  if (context.req.header('x-test-auth') !== 'allowed') {
    return context.json({ code: 'UNAUTHORIZED' }, 401);
  }
  await next();
};

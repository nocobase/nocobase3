import { createQueueManager, createSyncQueueConfig } from '@nocobase/queue';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import { queueExampleExecutions } from '../server/jobs/queue-example.js';
import {
  apiRoutes,
  registerQueueExampleRoutes,
} from '../server/routes/index.js';

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
    const router = new Hono();
    registerQueueExampleRoutes(
      router,
      { required: () => async (_context, next) => next() },
      queueManager,
    );

    const response = await router.request('/queue-example');

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

  it('rejects anonymous dispatch requests', async () => {
    const router = new Hono();
    registerQueueExampleRoutes(
      router,
      {
        required: () => (context) =>
          context.json({ code: 'UNAUTHORIZED' }, 401),
      },
      {
        dispatch: () => {
          throw new Error('Anonymous requests must not dispatch a job.');
        },
      },
    );

    const response = await router.request('/queue-example');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: 'UNAUTHORIZED' });
  });

  it('does not apply authentication to later Route contributions', async () => {
    const application = new Hono();
    const pluginRouter = new Hono();
    registerQueueExampleRoutes(
      pluginRouter,
      {
        required: () => (context) =>
          context.json({ code: 'UNAUTHORIZED' }, 401),
      },
      {
        dispatch: () => {
          throw new Error('Anonymous requests must not dispatch a job.');
        },
      },
    );
    application.route('/api', pluginRouter);
    application.get('/api/later-plugin', (context) => context.text('later'));

    expect((await application.request('/api/queue-example')).status).toBe(401);
    await expect(
      (await application.request('/api/later-plugin')).text(),
    ).resolves.toBe('later');
  });

  it('declares an API Route contribution', () => {
    expect(apiRoutes).toMatchObject({ scope: 'api' });
  });
});

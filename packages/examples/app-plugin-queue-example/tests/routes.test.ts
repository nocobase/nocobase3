import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  createConfigPaths,
  type AppConfigAccessor,
} from '@nocobase/app-server/config';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { queueManagerToken } from '@nocobase/app-server/queue';
import {
  createQueueManager,
  createSyncQueueConfig,
  type NocoBaseQueueManager,
} from '@nocobase/queue';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import { queueExampleExecutions } from '../server/jobs/queue-example.js';
import { apiRoutes } from '../server/routes/index.js';

describe('queue example plugin routes', () => {
  const managers: NocoBaseQueueManager[] = [];

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
    const router = await apiRoutes.createRouter(
      createApplication(
        { required: () => async (_context, next) => next() } as unknown as Auth,
        queueManager,
      ),
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
    const queueManager = createQueueManager(createSyncQueueConfig());
    managers.push(queueManager);
    const router = await apiRoutes.createRouter(
      createApplication(
        {
          required: () => (context) =>
            context.json({ code: 'UNAUTHORIZED' }, 401),
        } as unknown as Auth,
        queueManager,
      ),
    );

    const response = await router.request('/queue-example');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: 'UNAUTHORIZED' });
  });

  it('does not apply authentication to later Route contributions', async () => {
    const queueManager = createQueueManager(createSyncQueueConfig());
    managers.push(queueManager);
    const application = new Hono();
    const pluginRouter = await apiRoutes.createRouter(
      createApplication(
        {
          required: () => (context) =>
            context.json({ code: 'UNAUTHORIZED' }, 401),
        } as unknown as Auth,
        queueManager,
      ),
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

function createApplication(
  authentication: Auth,
  queueManager: NocoBaseQueueManager,
): AppPluginApplication {
  const container = new ServiceContainer();
  container.instance(authenticationToken, authentication);
  container.instance(queueManagerToken, queueManager);
  return {
    appName: 'main',
    publicBasePath: '',
    config: createEmptyConfigAccessor(),
    paths: createConfigPaths({ rootDir: '/missing' }),
    router: new Hono(),
    container,
  };
}

function createEmptyConfigAccessor(): AppConfigAccessor {
  return {
    get: () => undefined,
    raw: () => ({}),
    reload: async () => ({ changedNamespaces: [] }),
    subscribe: () => () => undefined,
  } as AppConfigAccessor;
}

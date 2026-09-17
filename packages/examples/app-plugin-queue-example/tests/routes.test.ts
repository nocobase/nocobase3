import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  createConfigPaths,
  type AppConfigAccessor,
} from '@nocobase/app-server/config';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { queueServiceToken } from '@nocobase/app-server/queue';
import { createQueueService, type QueueService } from '@nocobase/queue';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QueueExampleProvider } from '../server/provider.js';
import { apiRoutes } from '../server/routes/index.js';
import { queueExampleServiceToken } from '../server/service.js';

const payload = {
  message: 'Hello from the Queue example plugin',
  requestedAt: '2026-09-16T00:00:00.000Z',
};

const allowAuthentication = {
  required: () => async (_context, next) => next(),
} as unknown as Auth;
const denyAuthentication = {
  required: () => (context) => context.json({ code: 'UNAUTHORIZED' }, 401),
} as unknown as Auth;

describe('queue example plugin routes and lifecycle', () => {
  const cleanup: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const close of cleanup.splice(0).reverse()) await close();
    vi.restoreAllMocks();
  });

  function createFixture(authentication: Auth = allowAuthentication) {
    const queue = createQueueService({ namespace: 'main' });
    const app = createApplication(authentication, queue);
    const provider = new QueueExampleProvider(app);
    provider.register();
    cleanup.push(async () => {
      await provider.shutdown();
      await queue.shutdown();
    });
    const service = app.container.resolve(queueExampleServiceToken);
    return { app, queue, provider, service };
  }

  it('registers during boot but leaves shared queue setup to the App', async () => {
    const { queue, provider, service } = createFixture();
    const consumer = queue.consumer('default');
    const consume = vi.spyOn(consumer, 'consume');
    const setup = vi.spyOn(queue, 'setup');

    expect(consume).not.toHaveBeenCalled();
    await provider.boot();
    await provider.start();
    expect(consume).toHaveBeenCalledOnce();
    expect(setup).not.toHaveBeenCalled();
    await expect(
      queue.producer('default').publish('QueueExample', payload),
    ).rejects.toThrow('Queue is not ready');
    expect(service.listExecutions()).toEqual([]);

    await queue.setup();
    await queue.producer('default').publish('QueueExample', payload);
    await expect
      .poll(() => service.listExecutions())
      .toEqual([{ ...payload, executedAt: expect.any(String) }]);
  });

  it('returns an HTTP receipt before the asynchronous execution finishes', async () => {
    const { app, queue, provider, service } = createFixture();
    const gate = deferred();
    const execute = service.execute.bind(service);
    vi.spyOn(service, 'execute').mockImplementation(async (message, signal) => {
      await gate.promise;
      await execute(message, signal);
    });
    cleanup.push(async () => {
      gate.resolve();
    });
    await provider.boot();
    const router = await apiRoutes.createRouter(app);
    await queue.setup();

    const response = await router.request('/queue-example');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId: expect.any(String),
      channel: 'QueueExample',
      queue: 'default',
    });
    expect(service.listExecutions()).toEqual([]);
    gate.resolve();
    await expect
      .poll(() => service.listExecutions())
      .toEqual([
        {
          message: payload.message,
          requestedAt: expect.any(String),
          executedAt: expect.any(String),
        },
      ]);
  });

  it('filters unrelated channels on the shared queue', async () => {
    const { queue, provider, service } = createFixture();
    await provider.boot();
    await queue.setup();
    await queue.producer('default').publish('OtherPlugin', payload);
    await queue.producer('default').publish('QueueExample', payload);

    await expect
      .poll(() => service.listExecutions())
      .toEqual([{ ...payload, executedAt: expect.any(String) }]);
  });

  it('isolates execution state between Apps with the same queue and namespace', async () => {
    const first = createFixture();
    const second = createFixture();
    await first.provider.boot();
    await second.provider.boot();
    await first.queue.setup();
    await second.queue.setup();
    await first.queue.producer('default').publish('QueueExample', payload);
    await second.queue.producer('default').publish('QueueExample', {
      ...payload,
      message: 'Second App',
    });

    await expect
      .poll(() => first.service.listExecutions())
      .toEqual([{ ...payload, executedAt: expect.any(String) }]);
    await expect
      .poll(() => second.service.listExecutions())
      .toEqual([
        { ...payload, message: 'Second App', executedAt: expect.any(String) },
      ]);
    first.service.listExecutions().length = 0;
    expect(first.service.listExecutions()).toHaveLength(1);
  });

  it('awaits in-flight unregistration without closing the shared service', async () => {
    const { queue, provider, service } = createFixture();
    const gate = deferred();
    const execute = service.execute.bind(service);
    const invocation = vi
      .spyOn(service, 'execute')
      .mockImplementation(async (message, signal) => {
        await gate.promise;
        await execute(message, signal);
      });
    cleanup.push(async () => {
      gate.resolve();
    });
    await provider.boot();
    const otherMessages: string[] = [];
    const unregisterOther = queue
      .consumer('default')
      .consume(async (channel) => {
        otherMessages.push(channel);
      });
    cleanup.push(unregisterOther);
    await queue.setup();
    await queue.producer('default').publish('QueueExample', payload);
    await expect.poll(() => invocation.mock.calls.length).toBe(1);

    let stopped = false;
    const stopping = provider.shutdown().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(stopped).toBe(false);
    gate.resolve();
    await stopping;
    expect(service.listExecutions()).toHaveLength(1);
    await provider.shutdown();

    await queue.producer('default').publish('QueueExample', payload);
    await queue.producer('default').publish('AfterUnload', {});
    await expect
      .poll(() => otherMessages)
      .toEqual(['QueueExample', 'QueueExample', 'AfterUnload']);
    expect(invocation).toHaveBeenCalledOnce();
  });

  it('can shut down before boot without initializing queue resources', async () => {
    const { provider, queue } = createFixture();
    const consumer = vi.spyOn(queue, 'consumer');
    await provider.shutdown();
    expect(consumer).not.toHaveBeenCalled();
  });

  it('rejects anonymous requests without publishing', async () => {
    const { app, queue, provider, service } = createFixture(denyAuthentication);
    await provider.boot();
    const router = await apiRoutes.createRouter(app);
    const publish = vi.spyOn(queue.producer('default'), 'publish');
    await queue.setup();

    const response = await router.request('/queue-example');
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: 'UNAUTHORIZED' });
    expect(publish).not.toHaveBeenCalled();
    expect(service.listExecutions()).toEqual([]);
  });

  it('does not apply authentication to later Route contributions', async () => {
    const { app, provider } = createFixture(denyAuthentication);
    await provider.boot();
    const application = new Hono();
    application.route('/api', await apiRoutes.createRouter(app));
    application.get('/api/later-plugin', (context) => context.text('later'));

    expect((await application.request('/api/queue-example')).status).toBe(401);
    await expect(
      (await application.request('/api/later-plugin')).text(),
    ).resolves.toBe('later');
  });

  it('declares Provider and API contributions instead of retired queue jobs', async () => {
    const { default: plugin } = await import('../server/index.js');
    expect(plugin.queue).toBeUndefined();
    expect(plugin.serviceProviders).toEqual([QueueExampleProvider]);
    expect(plugin.routes).toEqual([apiRoutes]);
    expect(apiRoutes).toMatchObject({ scope: 'api' });
  });
});

function deferred() {
  let resolve = (): void => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createApplication(
  authentication: Auth,
  queue: QueueService,
): AppPluginApplication {
  const container = new ServiceContainer();
  container.instance(authenticationToken, authentication);
  container.instance(queueServiceToken, queue);
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

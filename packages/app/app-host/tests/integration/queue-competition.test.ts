import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { Application } from '@nocobase/app-server';
import { AppConfig, createConfigPaths } from '@nocobase/app-server/config';
import { LoggingProvider } from '@nocobase/app-server/logging';
import {
  QueueServiceProvider,
  queueServiceToken,
  type AppQueueServiceConfig,
} from '@nocobase/app-server/queue';
import { AppRuntimeRegistry } from '../../dist/app-registry.js';

const backend = process.env.QUEUE_TEST_BACKEND;
if (backend !== 'redis') {
  throw new Error(
    'Select redis through tests/run-persistent-queue.mjs; memory is not persistent competition evidence',
  );
}
const portVariable = 'QUEUE_TEST_REDIS_PORT';
const port = Number(process.env[portVariable]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(
    `Supply an isolated external ${portVariable} in the range 1..65535`,
  );
}

function barrier(): { promise: Promise<void>; release: () => void } {
  const { promise, resolve } = Promise.withResolvers<void>();
  return { promise, release: resolve };
}

it(`competes across actual Host applications on the same ${backend} target and preserves the surviving owner`, async () => {
  const queueName = 'shared-jobs';
  const configuration: AppQueueServiceConfig = {
    namespace: `host-competition-${randomUUID()}`,
    queueBackend: backend,
    connection: {
      host: '127.0.0.1',
      port,
      db: 0,
      connectTimeout: 1000,
      maxRetriesPerRequest: null,
    },
    concurrency: 1,
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
    setupTimeoutMs: 10_000,
    shutdownTimeoutMs: 10_000,
  };
  const gates = new Map([
    ['first', barrier()],
    ['second', barrier()],
  ]);
  const apps = new Map<string, Application>();
  const claims: {
    app: string;
    channel: string;
    message: string;
    signal: AbortSignal;
  }[] = [];
  const completed: string[] = [];
  const disposed: string[] = [];
  const registry = new AppRuntimeRegistry({
    startEvictionLoop: false,
    resolveFactory: () => async (scope) => {
      const config = new AppConfig();
      await config.loadAll();
      config.mergeDefaults({
        app: { name: scope.id, publicBasePath: scope.basePath },
        logging: { default: 'system', enabled: false, level: 'silent' },
        queue: configuration,
      });
      const app = new Application({
        config,
        paths: createConfigPaths({ rootDir: process.cwd() }),
      });
      app.addServiceProvider(LoggingProvider);
      app.addServiceProvider(QueueServiceProvider, { nodeEnv: 'develop' });
      // Register cleanup before activation so partially started applications are owned too.
      scope.registerDisposer('application providers', async () => {
        await app.shutdown();
        disposed.push(scope.id);
      });
      app.registerProviders();
      app.container
        .resolve(queueServiceToken)
        .consumer(queueName)
        .consume<string>(async (channel, message, signal) => {
          claims.push({ app: scope.id, channel, message, signal });
          // With concurrency one, a blocked claim cannot be followed by a second claim
          // in the same App. Both Apps must acquire distinct jobs to reach the assertion.
          if (message !== 'after-destroy') await gates.get(scope.id)!.promise;
          completed.push(message);
        });
      apps.set(scope.id, app);
      await app.start();
      return { fetch: app.fetch, config };
    },
  });

  try {
    await registry.create('first');
    await registry.create('second');
    const firstApp = apps.get('first')!;
    const secondApp = apps.get('second')!;
    const first = firstApp.container.resolve(queueServiceToken);
    const second = secondApp.container.resolve(queueServiceToken);
    const secondVersion = registry.requireSnapshot('second').version;
    expect(firstApp).not.toBe(secondApp);
    expect(firstApp.container).not.toBe(secondApp.container);
    expect(first).not.toBe(second);
    expect(firstApp.appName).toBe('first');
    expect(secondApp.appName).toBe('second');
    for (const app of apps.values()) {
      expect(app.config.get('queue')).toEqual(configuration);
    }

    // Publish through only one App: separate per-App targets cannot pass.
    await first.producer(queueName).publishMany([
      { channel: 'work', message: 'job-a' },
      { channel: 'work', message: 'job-b' },
    ]);
    await expect.poll(() => claims.length, { timeout: 10_000 }).toBe(2);
    expect(claims.map((claim) => claim.app).sort()).toEqual([
      'first',
      'second',
    ]);
    expect(claims.map((claim) => claim.message).sort()).toEqual([
      'job-a',
      'job-b',
    ]);
    expect(claims.map((claim) => claim.channel)).toEqual(['work', 'work']);
    expect(completed).toEqual([]);
    expect(claims.every((claim) => !claim.signal.aborted)).toBe(true);

    const firstClaim = claims.find((claim) => claim.app === 'first')!;
    const secondClaim = claims.find((claim) => claim.app === 'second')!;
    gates.get('first')!.release();
    await registry.destroy('first');
    expect(completed).toEqual([firstClaim.message]);
    expect(disposed).toEqual(['first']);
    expect(registry.isActive('first')).toBe(false);
    expect(registry.isActive('second')).toBe(true);
    expect(registry.requireSnapshot('second').version).toBe(secondVersion);
    expect(secondApp.container.resolve(queueServiceToken)).toBe(second);
    expect(secondClaim.signal.aborted).toBe(false);
    expect(() => first.producer(queueName)).toThrow('shutting down');

    // Destroying the first App must leave both the second App's producer and its
    // currently claimed job alive, rather than closing a process-global owner.
    await second.producer(queueName).publish('work', 'after-destroy');
    expect(claims).toHaveLength(2);
    expect(completed).toEqual([firstClaim.message]);
    expect(secondClaim.signal.aborted).toBe(false);
    gates.get('second')!.release();
    await expect.poll(() => completed.length, { timeout: 10_000 }).toBe(3);
    await registry.destroy('second');
    expect(disposed).toEqual(['first', 'second']);
    expect(claims.map((claim) => claim.message).sort()).toEqual([
      'after-destroy',
      'job-a',
      'job-b',
    ]);
    expect(completed.toSorted()).toEqual(['after-destroy', 'job-a', 'job-b']);
    expect(
      claims
        .filter((claim) => claim.message === 'after-destroy')
        .map((claim) => claim.app),
    ).toEqual(['second']);
    expect(claims.filter((claim) => claim.app === 'first')).toHaveLength(1);
    expect(() => second.producer(queueName)).toThrow('shutting down');
  } finally {
    for (const gate of gates.values()) gate.release();
    await registry.destroyAll('persistent queue acceptance cleanup');
  }
});

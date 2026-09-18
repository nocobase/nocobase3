import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as queue from '../src/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const compiler = require.resolve('typescript/bin/tsc');
let fixture: string;
let output: string;

function compile(args: string[]): string {
  try {
    return execFileSync(process.execPath, [compiler, ...args], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60000,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'stdout' in error)
      throw new Error(String(error.stdout), { cause: error });
    throw error;
  }
}

beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'nocobase-queue-exports-'));
  output = join(fixture, 'node_modules/@nocobase/queue');
  await mkdir(output, { recursive: true });
  const manifest = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8'),
  ) as {
    name: string;
    version: string;
    dependencies: Record<string, string>;
    publishConfig: { exports: Record<string, unknown> };
  };
  await writeFile(
    join(fixture, 'package.json'),
    JSON.stringify({ type: 'module' }),
  );
  await writeFile(
    join(output, 'package.json'),
    JSON.stringify({
      name: manifest.name,
      version: manifest.version,
      type: 'module',
      exports: manifest.publishConfig.exports,
    }),
  );
  // Link only published runtime dependencies, never this package's workspace sources.
  for (const dependency of Object.keys(manifest.dependencies)) {
    const target = join(output, 'node_modules', dependency);
    await mkdir(dirname(target), { recursive: true });
    await symlink(join(root, 'node_modules', dependency), target, 'dir');
  }
  // The independent TypeScript consumer provides declaration-only dependencies.
  for (const dependency of ['@types/node']) {
    const target = join(fixture, 'node_modules', dependency);
    await mkdir(dirname(target), { recursive: true });
    await symlink(join(root, 'node_modules', dependency), target, 'dir');
  }
  compile([
    '-p',
    'tsconfig.json',
    '--outDir',
    join(output, 'dist'),
    '--incremental',
    'false',
  ]);
}, 60000);

afterAll(async () => {
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

describe('final queue package exports', () => {
  it('exports only the planned runtime entry points', () => {
    expect(Object.keys(queue).sort()).toEqual([
      'createQueueService',
      'withChannel',
    ]);
  });

  it('has no legacy runtime dependencies', async () => {
    const manifest = JSON.parse(
      await readFile(join(root, 'package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
    };
    for (const dependency of [
      '@boringnode/queue',
      '@nocobase/db',
      '@nocobase/logging',
      'knex',
    ])
      expect(manifest.dependencies).not.toHaveProperty(dependency);
  });

  it('imports Redis and runs memory queues without the optional pg driver or legacy engine', async () => {
    const script = join(fixture, 'without-pg.mjs');
    await writeFile(
      script,
      `
      import assert from 'node:assert/strict';
      import { registerHooks } from 'node:module';
      registerHooks({ resolve(specifier, context, next) {
        if (['pg', 'pg-pool', '@boringnode/queue'].some(name => specifier === name || specifier.startsWith(name + '/'))) {
          const error = new Error('Driver deliberately unavailable: ' + specifier);
          error.code = 'MODULE_NOT_FOUND';
          throw error;
        }
        return next(specifier, context);
      }});
      await assert.rejects(import('pg'), /Driver deliberately unavailable/);
      const { createQueueService } = await import('@nocobase/queue');
      const redis = createQueueService({ namespace: 'exports', queueBackend: 'redis', connection: { host: '127.0.0.1' } });
      redis.producer('messages');
      await redis.shutdown();
      const memory = createQueueService({ namespace: 'exports' });
      await memory.setup();
      assert.equal(typeof (await memory.producer('messages').publish('send', { ok: true })).jobId, 'string');
      await memory.shutdown();
      const postgres = createQueueService({ namespace: 'missing-driver', queueBackend: 'postgres', connection: {} });
      postgres.producer('messages');
      await assert.rejects(postgres.setup(), /pg.*(install|required)|install.*pg/i);
      await postgres.shutdown();
    `,
    );
    expect(
      execFileSync(process.execPath, [script], {
        encoding: 'utf8',
        timeout: 15000,
      }),
    ).toBe('');
  });

  it('compiles an independent consumer against published declarations and final facade names', async () => {
    const consumer = join(fixture, 'consumer.ts');
    await writeFile(
      consumer,
      `
      import {
        createQueueService, withChannel,
        type QueueService, type QueueManager, type QueueProducer, type QueueConsumer,
        type Channel, type JobIdProducer, type RateLimitOptions,
        type QueueBackendConnections, type QueueConnectionOptions, type PostgresConnectionOptions,
        type QueueOptions, type QueueDefaults, type QueueOverrides,
        type QueueLocalRuntimeOptions, type QueueRuntimeOptions,
        type PublishOptions, type PublishReceipt, type ConsumeHandler, type UnregisterHandler,
      } from '@nocobase/queue';
      const options: QueueOptions<'inMemory'> = { namespace: 'consumer' };
      const service: QueueService = createQueueService(options);
      const manager: QueueManager = service.manager('messages');
      const producer: QueueProducer = service.producer('messages');
      const consumer: QueueConsumer = service.consumer('messages');
      const handler: ConsumeHandler<{ id: string }> = async (channel, message, signal) => {
        console.log(channel, message.id, signal.aborted);
      };
      const unregister: UnregisterHandler = consumer.consume(withChannel('send', handler));
      const runtime: QueueRuntimeOptions = { concurrency: 2 };
      await manager.configure(runtime);
      manager.cancelJob('job');
      manager.cancelAllJobs();
      await manager.drain({ delayed: true });
      const receipt: PublishReceipt = await producer.publish('send', { id: 'a' });
      console.log(receipt.jobId);
      await unregister();
      await service.shutdown();
      // @ts-expect-error The transitional name is not a public alias.
      import type { QueueServiceManager } from '@nocobase/queue';
      // @ts-expect-error Legacy configuration is retired.
      import type { AppQueueConfig } from '@nocobase/queue';
      // @ts-expect-error Job inheritance and the process-wide Locator are retired.
      import { Job, Locator, createQueueManager } from '@nocobase/queue';
    `,
    );
    expect(
      compile([
        consumer,
        '--ignoreConfig',
        '--noEmit',
        '--strict',
        '--target',
        'ES2023',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--types',
        'node',
        '--typeRoots',
        join(fixture, 'node_modules/@types'),
      ]),
    ).toBe('');
  }, 60000);
});

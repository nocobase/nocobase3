import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { Application } from '@nocobase/app-server/application';
import { AppConfig, createConfigPaths } from '@nocobase/app-server/config';
import { DatabaseProvider } from '@nocobase/app-server/database';
import { LoggingProvider, loggingToken } from '@nocobase/app-server/logging';
import {
  QueueServiceProvider,
  queueServiceToken,
} from '@nocobase/app-server/queue';
import { databaseManagerToken } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { createSilentLoggingConfig } from '@nocobase/logging';
import { ServiceProvider } from '@nocobase/service-provider';
import { expect, it, vi } from 'vitest';

import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
} from '../server/engine/constants.js';
import { asId, serializeJson } from '../server/engine/utils.js';
import { WorkflowProvider } from '../server/provider.js';
import {
  WORKFLOW_QUEUE_NAME,
  WORKFLOW_TASK_JOB_NAME,
} from '../server/queue.js';
import {
  internalWorkflowServiceToken,
  workflowServiceToken,
} from '../server/tokens.js';
import { defineTestInstruction } from './fixtures/instructions.js';
import {
  createTestWorkflow,
  createWorkflowCollections,
  findRun,
  listNodeRuns,
  readRun,
  testStore,
} from './helpers.js';

it('registers Workflow at boot and drains a real queued instruction before application dependencies close', async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'workflow-provider-lifecycle-'),
  );
  const bootGate = Promise.withResolvers<void>();
  const instructionGate = Promise.withResolvers<void>();
  const events: string[] = [];
  let bootReached = false;
  let instructionEntered = false;
  let shutdownSettled = false;
  let starting: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;
  const workflowKey = 'provider-lifecycle';
  const eventKey = 'queued-before-shutdown';
  const input = { value: 'completed-during-shutdown' };

  const config = new AppConfig();
  await config.loadAll();
  config.mergeDefaults({
    app: { name: 'workflow-provider-lifecycle', publicBasePath: '' },
    logging: createSilentLoggingConfig(),
    database: {
      default: 'main',
      drivers: { sqlite },
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
          migrations: { autoRun: false },
          seeds: { autoRun: false },
        },
      },
    },
    queue: { queueBackend: 'inMemory' },
    drive: {
      default: 'local',
      disks: {
        local: {
          driver: 'fs',
          location: path.join(root, 'artifacts'),
          visibility: 'private',
        },
      },
    },
    workflow: {
      sourceRoot: path.join(root, 'source'),
      distRoot: path.join(root, 'dist'),
      artifactDisk: 'local',
      production: false,
    },
  });
  const app = new Application({
    config,
    paths: createConfigPaths({ rootDir: root }),
  });

  // Only fixture data and phase barriers are test providers. All resource owners
  // and the Workflow handler/engine are the production implementations.
  class WorkflowFixtureProvider extends ServiceProvider<Application> {
    readonly name = 'workflow-lifecycle-fixture';

    override async boot(): Promise<void> {
      const database = this.app.container.resolve(databaseManagerToken);
      await createWorkflowCollections(database.builder());
      await createTestWorkflow(database, {
        key: workflowKey,
        nodes: [
          { key: 'held', type: 'lifecycle-barrier', downstreamKey: 'after' },
          { key: 'after', type: 'lifecycle-after', upstreamKey: 'held' },
        ],
      });
      await testStore(database).workflows.updateMany({
        filter: { key: workflowKey },
        values: {
          inputSchema: serializeJson({
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
          }),
        },
      });
      await mkdir(path.join(root, 'source', workflowKey), { recursive: true });
    }
  }

  class BootBarrierProvider extends ServiceProvider<Application> {
    readonly name = 'workflow-lifecycle-boot-barrier';

    override async boot(): Promise<void> {
      const workflow = this.app.container.resolve(workflowServiceToken);
      workflow.registerInstruction(
        defineTestInstruction('lifecycle-barrier', async (instruction) => {
          instructionEntered = true;
          events.push('instruction:entered');
          await instructionGate.promise;
          // The queued invocation still owns a usable database during shutdown.
          const run = await findRun(
            this.app.container.resolve(databaseManagerToken),
            eventKey,
          );
          expect(run.status).toBe(EXECUTION_STATUS.STARTED);
          expect(instruction.processor.execution.input).toEqual(input);
          events.push('instruction:released');
          return {
            status: NODE_RUN_STATUS.RESOLVED,
            result: instruction.processor.execution.input.value,
          };
        }),
      );
      workflow.registerInstruction(
        defineTestInstruction('lifecycle-after', async () => {
          // Processing a downstream node proves the real engine survived the drain.
          events.push('instruction:after');
          return { status: NODE_RUN_STATUS.RESOLVED, result: input.value };
        }),
      );
      bootReached = true;
      await bootGate.promise;
    }
  }

  app.addServiceProviders([
    LoggingProvider,
    DatabaseProvider,
    WorkflowFixtureProvider,
  ]);
  app.addServiceProvider(QueueServiceProvider, { nodeEnv: 'test' });
  app.addServiceProviders([WorkflowProvider, BootBarrierProvider]);

  try {
    app.registerProviders();
    expect(
      app.container.resolveIfCreated(internalWorkflowServiceToken),
    ).toBeUndefined();
    expect(app.container.resolveIfCreated(queueServiceToken)).toBeUndefined();
    const queue = app.container.resolve(queueServiceToken);
    const database = app.container.resolve(databaseManagerToken);
    const logging = app.container.resolve(loggingToken);
    const setup = vi.spyOn(queue, 'setup');
    const consumer = queue.consumer(WORKFLOW_QUEUE_NAME);
    const consumeOriginal = consumer.consume.bind(consumer);
    const consume = vi
      .spyOn(consumer, 'consume')
      .mockImplementation((handler) => {
        const unregister = consumeOriginal(handler);
        return async () => {
          events.push('unregister:begin');
          await unregister();
          events.push('unregister:end');
        };
      });
    const shutdownQueue = queue.shutdown.bind(queue);
    vi.spyOn(queue, 'shutdown').mockImplementation(async () => {
      events.push('queue:shutdown');
      await shutdownQueue();
      events.push('queue:closed');
    });
    const destroyDatabase = database.destroy.bind(database);
    vi.spyOn(database, 'destroy').mockImplementation(async () => {
      events.push('database:destroy');
      // Read terminal business state before the actual DatabaseProvider closes it.
      try {
        const run = await findRun(database, eventKey);
        await expect(readRun(database, asId(run.id))).resolves.toMatchObject({
          workflowKey,
          input,
          status: EXECUTION_STATUS.RESOLVED,
          output: input.value,
        });
        await expect(
          listNodeRuns(database, asId(run.id)),
        ).resolves.toMatchObject([
          {
            nodeKey: 'held',
            status: NODE_RUN_STATUS.RESOLVED,
            result: input.value,
          },
          {
            nodeKey: 'after',
            status: NODE_RUN_STATUS.RESOLVED,
            result: input.value,
          },
        ]);
      } finally {
        await destroyDatabase();
        events.push('database:closed');
      }
    });
    const closeLogging = logging.close.bind(logging);
    vi.spyOn(logging, 'close').mockImplementation(async () => {
      events.push('logging:close');
      await closeLogging();
    });

    starting = app.start();
    await expect.poll(() => bootReached).toBe(true);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(setup).not.toHaveBeenCalled();
    // A valid publication cannot be admitted during boot, even though the
    // Workflow handler is registered. No manual queue.setup() is used here.
    await expect(
      queue
        .producer(WORKFLOW_QUEUE_NAME)
        .publish(WORKFLOW_TASK_JOB_NAME, { executionId: 'not-started' }),
    ).rejects.toThrow('Queue is not ready');
    expect(instructionEntered).toBe(false);
    expect(await testStore(database).runs.count()).toBe(0);

    const workflow = app.container.resolve(internalWorkflowServiceToken);
    const disposeWorkflow = workflow.dispose.bind(workflow);
    vi.spyOn(workflow, 'dispose').mockImplementation(async () => {
      events.push('workflow:dispose');
      await disposeWorkflow();
      events.push('workflow:disposed');
    });

    bootGate.resolve();
    await starting;
    expect(setup).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledTimes(1);
    await expect(
      app.container
        .resolve(workflowServiceToken)
        .trigger(workflowKey, input, { eventKey }),
    ).resolves.toEqual({ status: 'accepted', eventKey });
    await expect.poll(() => instructionEntered).toBe(true);
    const run = await findRun(database, eventKey);
    expect(run.status).toBe(EXECUTION_STATUS.STARTED);

    stopping = app.shutdown().finally(() => {
      shutdownSettled = true;
    });
    await expect.poll(() => events.includes('unregister:begin')).toBe(true);
    await setImmediate();
    expect(shutdownSettled).toBe(false);
    expect(events).toEqual([
      'instruction:entered',
      'workflow:dispose',
      'unregister:begin',
    ]);
    await expect(readRun(database, asId(run.id))).resolves.toMatchObject({
      status: EXECUTION_STATUS.STARTED,
      input,
    });
    // The plugin drain has not closed the application-owned producer either.
    await expect(
      queue.producer('unrelated').publish('still-open', {}),
    ).resolves.toHaveProperty('jobId');
    expect(shutdownSettled).toBe(false);

    instructionGate.resolve();
    await stopping;
    expect(events).toEqual([
      'instruction:entered',
      'workflow:dispose',
      'unregister:begin',
      'instruction:released',
      'instruction:after',
      'unregister:end',
      'workflow:disposed',
      'queue:shutdown',
      'queue:closed',
      'database:destroy',
      'database:closed',
      'logging:close',
    ]);
    expect(() => queue.producer(WORKFLOW_QUEUE_NAME)).toThrow('shutting down');
  } finally {
    bootGate.resolve();
    instructionGate.resolve();
    await starting?.catch(() => undefined);
    if (!stopping) vi.restoreAllMocks();
    try {
      await (stopping ?? app.shutdown());
    } finally {
      vi.restoreAllMocks();
      await rm(root, { recursive: true, force: true });
    }
  }
});

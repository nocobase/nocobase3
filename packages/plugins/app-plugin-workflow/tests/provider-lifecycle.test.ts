import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { Application } from '@nocobase/app-server/application';
import { AppConfig, createAppPaths } from '@nocobase/app-server/config';
import { DatabaseProvider } from '@nocobase/app-server/database';
import {
  JobExecutorServiceProvider,
  jobExecutorServiceToken,
} from '@nocobase/app-server/jobs';
import { LoggingProvider, loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { createSilentLoggingConfig } from '@nocobase/logging';
import { ServiceProvider } from '@nocobase/service-provider';
import { expect, it, vi } from 'vitest';

import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
} from '../server/engine/constants.js';
import {
  buildWorkflowArtifact,
  writeWorkflowArtifact,
} from '../build/artifact-builder.js';
import { asId } from '../server/engine/utils.js';
import { WorkflowProvider } from '../server/provider.js';
import { WorkflowRepository } from '../server/repositories/workflow-repository.js';
import {
  internalWorkflowServiceToken,
  workflowServiceToken,
} from '../server/tokens.js';
import { defineTestInstruction } from './fixtures/instructions.js';
import {
  createWorkflowCollections,
  findRun,
  listNodeRuns,
  readRun,
  testStore,
} from './helpers.js';

it('registers Workflow at boot and drains a running jobs task before application dependencies close', async () => {
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
  // Triggering requires a stored Artifact, so deploy a real build output.
  const artifact = buildWorkflowArtifact({
    key: workflowKey,
    flatIr: {
      title: workflowKey,
      inputSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
      },
      start: 'held',
      nodes: [
        {
          key: 'held',
          title: 'held',
          type: 'lifecycle-barrier',
          config: {},
          upstreamKey: null,
          downstreamKey: 'after',
          branchKey: null,
        },
        {
          key: 'after',
          title: 'after',
          type: 'lifecycle-after',
          config: {},
          upstreamKey: 'held',
          downstreamKey: null,
          branchKey: null,
        },
      ],
    },
    resourceFiles: new Map(),
  });
  await writeWorkflowArtifact(artifact, path.join(root, 'dist'));

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
      production: true,
    },
  });
  const app = new Application({
    config,
    paths: createAppPaths({ rootDir: root }),
  });

  // Only fixture data and phase barriers are test providers. All resource owners
  // and the Workflow engine run on the production implementations, including the
  // application's built-in memory jobs configuration.
  class WorkflowFixtureProvider extends ServiceProvider<Application> {
    readonly name = 'workflow-lifecycle-fixture';

    override async boot(): Promise<void> {
      const database = this.app.container.resolve(databaseManagerToken);
      await createWorkflowCollections(database.builder());
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
          // The running task still owns a usable database during shutdown.
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
  app.addServiceProvider(JobExecutorServiceProvider, { nodeEnv: 'test' });
  app.addServiceProviders([WorkflowProvider, BootBarrierProvider]);

  try {
    app.registerProviders();
    expect(
      app.container.resolveIfCreated(internalWorkflowServiceToken),
    ).toBeUndefined();
    expect(
      app.container.resolveIfCreated(jobExecutorServiceToken),
    ).toBeUndefined();
    // The service caches executors by scope, so this is the one Workflow uses.
    const executor = app.container
      .resolve(jobExecutorServiceToken)
      .getJobExecutor('@nocobase/app-plugin-workflow');
    const database = app.container.resolve(databaseManagerToken);
    const logging = app.container.resolve(loggingToken);
    const setup = vi.spyOn(executor, 'setup');
    const shutdownExecutor = executor.shutdown.bind(executor);
    vi.spyOn(executor, 'shutdown').mockImplementation(async () => {
      events.push('executor:shutdown');
      await shutdownExecutor();
      events.push('executor:closed');
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
    // Registering instructions during boot neither sets up nor consumes.
    expect(setup).not.toHaveBeenCalled();
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
    await new WorkflowRepository(database, workflow).enable(artifact.digest);
    await expect(
      app.container
        .resolve(workflowServiceToken)
        .trigger(workflowKey, input, { eventKey }),
    ).resolves.toMatchObject({ status: 'accepted', eventKey });
    expect(setup).toHaveBeenCalledOnce();
    await expect.poll(() => instructionEntered).toBe(true);
    const run = await findRun(database, eventKey);
    expect(run.status).toBe(EXECUTION_STATUS.STARTED);

    stopping = app.shutdown().finally(() => {
      shutdownSettled = true;
    });
    await expect.poll(() => events.includes('workflow:dispose')).toBe(true);
    await setImmediate();
    expect(shutdownSettled).toBe(false);
    expect(events).toEqual(['instruction:entered', 'workflow:dispose']);
    await expect(readRun(database, asId(run.id))).resolves.toMatchObject({
      status: EXECUTION_STATUS.STARTED,
      input,
    });

    instructionGate.resolve();
    await stopping;
    // The jobs provider shuts the executor down again after Workflow; that
    // second call is idempotent and closes nothing further.
    expect(events.slice(0, 8)).toEqual([
      'instruction:entered',
      'workflow:dispose',
      'instruction:released',
      'instruction:after',
      'executor:shutdown',
      'executor:closed',
      'workflow:disposed',
      'executor:shutdown',
    ]);
    expect(events.slice(-3)).toEqual([
      'database:destroy',
      'database:closed',
      'logging:close',
    ]);
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

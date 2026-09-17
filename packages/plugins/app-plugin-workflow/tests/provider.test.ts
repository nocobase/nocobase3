import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager, databaseManagerToken } from '@nocobase/db';
import { createLogging, createSilentLoggingConfig } from '@nocobase/logging';
import { createQueueService, type QueueService } from '@nocobase/queue';
import { loggingToken } from '@nocobase/app-server/logging';
import { queueServiceToken } from '@nocobase/app-server/queue';
import type { AppConfigAccessor } from '@nocobase/app-server/config';
import { ServiceContainer } from '@nocobase/service-provider';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { WorkflowProvider } from '../server/provider.js';
import {
  workflowServiceToken,
  type WorkflowServiceContract,
} from '../server/index.js';
import { echoInstruction } from './fixtures/instructions.js';

const providers: WorkflowProvider[] = [];
const databases: ReturnType<typeof createDatabaseManager>[] = [];
const queues: QueueService[] = [];

afterEach(async () => {
  await Promise.all(providers.splice(0).map((provider) => provider.shutdown()));
  await Promise.all(queues.splice(0).map((queue) => queue.shutdown()));
  await Promise.all(databases.splice(0).map((database) => database.destroy()));
});

describe('WorkflowProvider', () => {
  it('does not register the workflow service without a database', () => {
    const container = new ServiceContainer();
    const provider = createProvider('without-database', container);

    provider.register();

    expect(container.has(workflowServiceToken)).toBe(false);
  });

  it('registers once at boot and leaves queue shutdown to the application', async () => {
    const { container, provider } =
      await createProviderWithDependencies('boot-order');
    const queue = container.resolve(queueServiceToken);
    const consumer = queue.consumer('workflow');
    const consume = vi.spyOn(consumer, 'consume');
    provider.register();
    expect(consume).not.toHaveBeenCalled();
    await provider.boot();
    expect(consume).toHaveBeenCalledTimes(1);
    await provider.boot();
    expect(consume).toHaveBeenCalledTimes(1);
    await provider.shutdown();
    // The application, not this plugin, retains ownership of queue shutdown.
    await expect(
      queue.producer('workflow').publish('unrelated', {}),
    ).resolves.toBeDefined();
  });

  it('registers isolated workflow services for multiple applications', async () => {
    const first = await createProviderWithDependencies('first');
    const second = await createProviderWithDependencies('second');

    first.provider.register();
    second.provider.register();

    expect(first.container.resolve(workflowServiceToken)).toBeDefined();
    expect(second.container.resolve(workflowServiceToken)).toBeDefined();
    expect(first.container.resolve(workflowServiceToken)).not.toBe(
      second.container.resolve(workflowServiceToken),
    );
  });

  it('registers an application instruction through the public workflow API', async () => {
    const { container, provider } = await createProviderWithDependencies('app');
    provider.register();
    const workflow = container.resolve(workflowServiceToken);
    expectTypeOf(workflow).toEqualTypeOf<WorkflowServiceContract>();

    expect(() => workflow.registerInstruction(echoInstruction)).not.toThrow();
    expect(() => workflow.registerInstruction(echoInstruction)).toThrow(
      'Workflow instruction "echo" is already registered.',
    );
  });
});

async function createProviderWithDependencies(appName: string): Promise<{
  container: ServiceContainer;
  provider: WorkflowProvider;
}> {
  const container = new ServiceContainer();
  const database = createDatabaseManager({
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  const queue = createQueueService({
    namespace: `workflow-provider-${appName}`,
  });
  const logging = createLogging(createSilentLoggingConfig());
  databases.push(database);
  queues.push(queue);
  await queue.setup();
  container.instance(databaseManagerToken, database);
  container.instance(queueServiceToken, queue);
  container.instance(loggingToken, logging);
  return { container, provider: createProvider(appName, container) };
}

function createProvider(
  appName: string,
  container: ServiceContainer,
): WorkflowProvider {
  const provider = new WorkflowProvider({
    appName,
    container,
    config: createTestConfig({
      drive: {
        default: 'local',
        disks: {
          local: {
            driver: 'fs',
            location: '/tmp/nocobase-workflow-provider-test',
            visibility: 'private',
          },
        },
      },
      workflow: {
        sourceRoot: '/tmp/nocobase-workflow-provider-test/source',
        distRoot: '/tmp/nocobase-workflow-provider-test/dist',
        artifactDisk: 'local',
        production: false,
      },
    }),
  });
  providers.push(provider);
  return provider;
}

function createTestConfig(
  values: Readonly<Record<string, unknown>>,
): AppConfigAccessor {
  return {
    get: <TValue>(definition: string): TValue => values[definition] as TValue,
    raw: () => values,
    reload: () => Promise.resolve({ changedNamespaces: [] }),
    subscribe: () => () => undefined,
  };
}

import { createDatabaseManager, databaseManagerToken } from '@nocobase/db';
import { createLogging, createSilentLoggingConfig } from '@nocobase/logging';
import { createQueueManager, createSyncQueueConfig } from '@nocobase/queue';
import { loggingToken } from '@nocobase/app-server/logging';
import { queueManagerToken } from '@nocobase/app-server/queue';
import type {
  AppConfigAccessor,
  AppConfigToken,
} from '@nocobase/app-server/config';
import { ServiceContainer } from '@nocobase/service-provider';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';

import { WorkflowProvider } from '../server/provider.js';
import {
  workflowServiceToken,
  type WorkflowServiceContract,
} from '../server/index.js';
import { echoInstruction } from './fixtures/instructions.js';

const providers: WorkflowProvider[] = [];
const databases: ReturnType<typeof createDatabaseManager>[] = [];
const queues: ReturnType<typeof createQueueManager>[] = [];

afterEach(async () => {
  await Promise.all(providers.splice(0).map((provider) => provider.shutdown()));
  await Promise.all(queues.splice(0).map((queue) => queue.close()));
  await Promise.all(databases.splice(0).map((database) => database.destroy()));
});

describe('WorkflowProvider', () => {
  it('does not register the workflow service without a database', () => {
    const container = new ServiceContainer();
    const provider = createProvider('without-database', container);

    provider.register();

    expect(container.has(workflowServiceToken)).toBe(false);
  });

  it('registers isolated workflow services for multiple applications', () => {
    const first = createProviderWithDependencies('first');
    const second = createProviderWithDependencies('second');

    first.provider.register();
    second.provider.register();

    expect(first.container.resolve(workflowServiceToken)).toBeDefined();
    expect(second.container.resolve(workflowServiceToken)).toBeDefined();
    expect(first.container.resolve(workflowServiceToken)).not.toBe(
      second.container.resolve(workflowServiceToken),
    );
  });

  it('registers an application instruction through the public workflow API', () => {
    const { container, provider } = createProviderWithDependencies('app');
    provider.register();
    const workflow = container.resolve(workflowServiceToken);
    expectTypeOf(workflow).toEqualTypeOf<WorkflowServiceContract>();

    expect(() => workflow.registerInstruction(echoInstruction)).not.toThrow();
    expect(() => workflow.registerInstruction(echoInstruction)).toThrow(
      'Workflow instruction "echo" is already registered.',
    );
  });
});

function createProviderWithDependencies(appName: string): {
  container: ServiceContainer;
  provider: WorkflowProvider;
} {
  const container = new ServiceContainer();
  const database = createDatabaseManager({
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  const queue = createQueueManager(createSyncQueueConfig());
  const logging = createLogging(createSilentLoggingConfig());
  databases.push(database);
  queues.push(queue);
  container.instance(databaseManagerToken, database);
  container.instance(queueManagerToken, queue);
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
        sourceResolverDiagnostic: false,
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
    get: <TValue>(definition: AppConfigToken<TValue>): TValue =>
      values[definition.namespace] as TValue,
    raw: () => values,
    reload: () => Promise.resolve({ changedNamespaces: [] }),
    subscribe: () => () => undefined,
  };
}

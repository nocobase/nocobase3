import {
  createDatabaseManager,
  databaseManagerToken,
} from '@nocobase/app-database';
import {
  createLogging,
  createSilentLoggingConfig,
  loggingToken,
} from '@nocobase/logging';
import {
  createQueueManager,
  createSyncQueueConfig,
  queueManagerToken,
} from '@nocobase/queue';
import { ServiceContainer } from '@nocobase/service-provider';
import { afterEach, describe, expect, it } from 'vitest';

import { WorkflowProvider } from '../server/providers/workflow.js';
import { workflowServiceToken } from '../server/tokens.js';

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
    config: {
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
    },
  });
  providers.push(provider);
  return provider;
}

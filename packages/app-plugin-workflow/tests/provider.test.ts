import {
  createDatabaseManager,
  databaseManagerToken,
} from '@nocobase/app-database';
import { createLogging, createSilentLoggingConfig } from '@nocobase/logging';
import { loggingToken } from '@nocobase/app-server-kit/logging';
import { createQueueManager, createSyncQueueConfig } from '@nocobase/queue';
import { queueManagerToken } from '@nocobase/app-server-kit/queue';
import { ServiceContainer } from '@nocobase/service-provider';
import { AppConfig } from '@nocobase/app-server-kit/config';
import { driveConfig } from '@nocobase/app-server-kit/drive';
import { afterEach, describe, expect, it } from 'vitest';

import WorkflowProvider from '../server/provider.js';
import { workflowConfig } from '../server/config.js';
import { workflowServiceToken } from '../server/token.js';

const providers: WorkflowProvider[] = [];
const databases: ReturnType<typeof createDatabaseManager>[] = [];
const queues: ReturnType<typeof createQueueManager>[] = [];

afterEach(async () => {
  await Promise.all(providers.splice(0).map((provider) => provider.shutdown()));
  await Promise.all(queues.splice(0).map((queue) => queue.close()));
  await Promise.all(databases.splice(0).map((database) => database.destroy()));
});

describe('WorkflowProvider', () => {
  it('does not register the workflow service without a database', async () => {
    const container = new ServiceContainer();
    const provider = await createProvider('without-database', container);

    provider.register();

    expect(container.has(workflowServiceToken)).toBe(false);
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
});

async function createProviderWithDependencies(appName: string): Promise<{
  container: ServiceContainer;
  provider: WorkflowProvider;
}> {
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
  return { container, provider: await createProvider(appName, container) };
}

async function createProvider(
  appName: string,
  container: ServiceContainer,
): Promise<WorkflowProvider> {
  const drive = {
    default: 'local',
    disks: {
      local: {
        driver: 'fs' as const,
        location: '/tmp/nocobase-workflow-provider-test',
        visibility: 'private' as const,
      },
    },
    links: {},
  };
  const workflow = {
    sourceRoot: '/tmp/nocobase-workflow-provider-test/source',
    distRoot: '/tmp/nocobase-workflow-provider-test/dist',
    artifactDisk: 'local',
    sourceResolverDiagnostic: false,
    production: false,
  };
  const config = new AppConfig(
    [
      { ...driveConfig, defaults: drive },
      { ...workflowConfig, defaults: workflow },
    ],
    { context: {} },
  );
  await config.loadAll();
  const provider = new WorkflowProvider({
    appName,
    container,
    config,
  });
  providers.push(provider);
  return provider;
}

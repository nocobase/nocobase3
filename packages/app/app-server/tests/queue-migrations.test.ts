import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  databaseManagerToken,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { type AppQueueConfig } from '@nocobase/queue';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Knex } from 'knex';
import { expect, it } from 'vitest';
import { objectProvider } from '@nocobase/config/providers/object';
import { AppConfig } from '../src/config/index.js';
import { DatabaseProvider } from '../src/database/provider.js';
import { createConfigPaths } from '../src/config/paths.js';
import { planAppRuntimeDatabaseTasks as planAppDatabaseTasks } from '../src/database/plan.js';
import {
  executeAppDatabasePlan,
  runAppDatabaseTasks,
} from '../src/database/tasks.js';
import { createAppMigrator } from '../src/database/migrator.js';

const contributions = { appPackageName: 'test', migrations: [], seeds: [] };
const config = {
  drivers: { sqlite },
  default: 'main',
  connections: {
    main: { dialect: 'sqlite' as const, filename: ':memory:' },
    other: {
      dialect: 'sqlite' as const,
      filename: ':memory:',
      migrations: { autoRun: false },
    },
  },
};
const queue: AppQueueConfig = {
  default: 'sync',
  connections: {
    sync: { driver: 'sync' },
    storage: { driver: 'database', table: 'tasks', schedulesTable: 'timers' },
    alias: { driver: 'database', table: 'tasks', schedulesTable: 'timers' },
    second: {
      driver: 'database',
      table: 'other_tasks',
      schedulesTable: 'other_timers',
    },
    remote: { driver: 'database', connection: 'other' },
  },
};

it('plans configured queue storage without scheduler and respects connection selection and autoRun', async () => {
  const metadataStore = new InMemoryCollectionMetadataStore();
  const database = createDatabaseManager({ ...config, metadataStore });
  try {
    const plan = planAppDatabaseTasks(config, ['migrations'], {
      contributions,
      runtimeConfig: runtimeConfig(queue),
      autoRun: true,
    });
    expect(
      plan[0].config.sources?.filter(
        (source) => source.packageName === '@nocobase/queue',
      ),
    ).toHaveLength(3);
    expect(plan[1].skipReason).toBe('auto-run-disabled');
    await executeAppDatabasePlan(database, config, plan);
    const client = await database.connection('main').client<Knex>();
    expect(await client.schema.hasTable('tasks')).toBe(true);
    expect(await client.schema.hasTable('other_tasks')).toBe(true);
    expect(await client.schema.hasTable('queue_jobs')).toBe(false);
    expect(await metadataStore.get('queueJobs')).toBeUndefined();
    const again = await executeAppDatabasePlan(database, config, plan);
    expect(again.results[0].executed).toEqual([]);
    const manual = planAppDatabaseTasks(config, ['migrations'], {
      contributions,
      runtimeConfig: runtimeConfig(queue),
      connection: 'other',
    });
    await executeAppDatabasePlan(database, config, manual);
    const other = await database.connection('other').client<Knex>();
    expect(await other.schema.hasTable('queue_jobs')).toBe(true);
    await createAppMigrator({
      database,
      connection: 'main',
      config: plan[0].config,
      sources: plan[0].config.sources,
    }).rollback();
    expect(await client.schema.hasTable('tasks')).toBe(false);
    expect(await client.schema.hasTable('other_tasks')).toBe(false);
    await executeAppDatabasePlan(database, config, plan, { fresh: true });
    expect(await client.schema.hasTable('timers')).toBe(true);
  } finally {
    await database.destroy();
  }
});

it('skips queue migrations without a database queue driver', async () => {
  for (const value of [
    undefined,
    { default: 'sync', connections: { sync: { driver: 'sync' as const } } },
  ]) {
    const plan = planAppDatabaseTasks(config, ['migrations'], {
      contributions,
      runtimeConfig: runtimeConfig(value),
    });
    const database = createDatabaseManager(config);
    try {
      const result = await executeAppDatabasePlan(database, config, plan);
      expect(result.results[0].executed ?? []).toEqual([]);
      const client = await database.connection().client<Knex>();
      expect(await client.schema.hasTable('queue_jobs')).toBe(false);
    } finally {
      await database.destroy();
    }
  }
});

it('skips external connections and rejects unknown queue database targets', () => {
  const external = {
    ...config,
    connections: {
      ...config.connections,
      other: {
        ...config.connections.other,
        schemaManagement: 'external' as const,
      },
    },
  };
  expect(
    planAppDatabaseTasks(external, ['migrations'], {
      contributions,
      runtimeConfig: runtimeConfig(queue),
      all: true,
    })[1].skipReason,
  ).toBe('external');
  expect(() =>
    planAppDatabaseTasks(config, ['migrations'], {
      contributions,
      runtimeConfig: runtimeConfig({
        default: 'db',
        connections: { db: { driver: 'database', connection: 'missing' } },
      }),
    }),
  ).toThrow('Unknown migration target database connection');
});

it('initializes queue storage through the database provider before business providers boot', async () => {
  const appConfig = new AppConfig();
  appConfig.load(objectProvider({ database: config, queue }));
  await appConfig.loadAll();
  const container = new ServiceContainer();
  const provider = new DatabaseProvider({
    config: appConfig,
    container,
    paths: createConfigPaths({ rootDir: process.cwd() }),
    databaseTaskContributions: contributions,
  });
  provider.register();
  try {
    await provider.boot();
    const client = await container
      .resolve(databaseManagerToken)
      .connection()
      .client<Knex>();
    expect(await client.schema.hasTable('tasks')).toBe(true);
  } finally {
    await provider.shutdown();
  }
});

function runtimeConfig(
  queueConfig: AppQueueConfig | undefined,
): Pick<AppConfig, 'get'> {
  return {
    get<T>(key: string): T | undefined {
      return (key === 'queue' ? queueConfig : undefined) as T | undefined;
    },
  };
}

it('uses the same history identity when a queue switches from sync to database', async () => {
  const database = createDatabaseManager(config);
  const options = { contributions };
  try {
    const sync = planAppDatabaseTasks(config, ['migrations'], {
      ...options,
      runtimeConfig: runtimeConfig({
        default: 'jobs',
        connections: { jobs: { driver: 'sync' } },
      }),
    });
    const first = await executeAppDatabasePlan(database, config, sync);
    expect(first.results[0].executed).toEqual([]);
    const dbQueue = planAppDatabaseTasks(config, ['migrations'], {
      ...options,
      runtimeConfig: runtimeConfig({
        default: 'jobs',
        connections: { jobs: { driver: 'database' } },
      }),
    });
    const second = await executeAppDatabasePlan(database, config, dbQueue);
    expect(second.results[0].executed).toEqual(first.results[0].skipped);
    const client = await database.connection().client<Knex>();
    expect(await client.schema.hasTable('queue_jobs')).toBe(true);
    expect(
      (await executeAppDatabasePlan(database, config, sync)).results[0]
        .executed,
    ).toEqual([]);
  } finally {
    await database.destroy();
  }
});

it('does not reject inactive configurations that overlap an active target', async () => {
  const database = createDatabaseManager(config);
  try {
    const plan = planAppDatabaseTasks(config, ['migrations'], {
      contributions,
      runtimeConfig: runtimeConfig({
        default: 'a',
        connections: {
          a: { driver: 'sync' },
          b: {
            driver: 'database',
            table: 'queue_jobs',
            schedulesTable: 'custom_timers',
          },
        },
      }),
    });
    const result = await executeAppDatabasePlan(database, config, plan);
    expect(result.results[0].executed).toHaveLength(1);
    const client = await database.connection().client<Knex>();
    expect(await client.schema.hasTable('custom_timers')).toBe(true);
    expect(await client.schema.hasTable('queue_schedules')).toBe(false);
  } finally {
    await database.destroy();
  }
});

it('includes built-in queue migrations in manual commands without source registration', async () => {
  const result = await runAppDatabaseTasks(config, {
    contributions,
    runtimeConfig: runtimeConfig(queue),
    kind: 'migrations',
  });
  expect(result.ok).toBe(true);
  expect(result.results[0].executed).toHaveLength(2);
});

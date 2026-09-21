import { databaseManagerToken } from '@nocobase/db';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import { createAppFromRuntime } from '@nocobase/app-server/runtime';
import { DatabaseProvider } from '@nocobase/app-server/database';
import type { AppCommandContext } from '../src/context.js';
import { IdGeneratorProvider } from '@nocobase/app-server/id-generator';
import { ServiceProvider } from '../../../libs/service-provider/src/index.js';
import type { Application } from '@nocobase/app-server';
// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runDatabaseCommand } from '../src/database-command.js';
import { createAppPaths, AppConfig } from '@nocobase/app-server/config';
import type { AppDatabaseConfig } from '@nocobase/app-server/database';
import sqlite, { type SqliteConnectionConfig } from '@nocobase/db-sqlite';

class TaskServiceProvider extends ServiceProvider<Application> {
  override async boot(): Promise<void> {
    throw new Error('CLI must not boot providers');
  }
  override async start(): Promise<void> {
    throw new Error('CLI must not start providers');
  }

  override register(): void {
    this.app.config.mergeDefaults({ taskServiceRegistered: true });
  }
}

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'cli-database-'));
  roots.push(root);
  const paths = createAppPaths({ rootDir: root });
  const database: AppDatabaseConfig<SqliteConnectionConfig> = {
    drivers: { sqlite },
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: paths.storage('main.sqlite') },
      analytics: {
        dialect: 'sqlite',
        filename: paths.storage('analytics.sqlite'),
        migrations: { autoRun: false },
      },
      erp: {
        dialect: 'sqlite',
        filename: paths.storage('erp.sqlite'),
        schemaManagement: 'external',
      },
    },
  };
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'test-app', version: '1.0.0' }),
  );
  const runtime: {
    -readonly [K in 'loadRuntime' | 'createApp']: AppCommandContext[K];
  } = {
    loadRuntime: () =>
      resolveStandaloneAppRuntime(
        {
          createAppConfig: () => {
            const config = new AppConfig();
            return config;
          },
          defaultConfigs: () => ({ database, snowflake: { workerId: 0 } }),
          plugins: { plugins: [] },
          serviceProviders: [],
          routes: [],
        },
        { rootDir: root },
      ),
    createApp: (loaded) => {
      const app = createAppFromRuntime(loaded);
      app.addServiceProvider(DatabaseProvider);
      app.addServiceProvider(IdGeneratorProvider);
      app.addServiceProvider(TaskServiceProvider);
      app.addRuntimeContributions(loaded);
      return app;
    },
  };
  const command = {
    log: vi.fn(),
    logJson: vi.fn(),
    exit: vi.fn((code: number): never => {
      throw new Error(`exit ${code}`);
    }),
  };
  function migration(connection: string, fail = false) {
    const directory = paths.database(`${connection}/migrations`);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, '001_create.ts'),
      `import { defineMigration, databaseManagerToken } from '@nocobase/db';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
export default defineMigration({ name: '001_create', async up({ builder, config, container }) {
if (config.get('taskServiceRegistered') !== true) throw new Error('providers not registered');
if (container.has(databaseManagerToken)) throw new Error('database manager exposed');
if (!container.resolve(idGeneratorToken).generateString()) throw new Error('missing ID generator');
${fail ? "throw new Error('failed migration');" : "await builder.createCollection('rows', c => c.increments('id'));"}
}, async down({ builder }) { await builder.dropCollection('rows'); } });`,
    );
  }
  return { runtime, command, migration };
}

it('retains single-connection JSON fields and honors manual selection', async () => {
  const { runtime, command, migration } = fixture();
  migration('analytics');
  await runDatabaseCommand(
    command,
    'migrations',
    { json: true, all: false, connection: 'analytics' },
    runtime,
  );
  expect(command.logJson).toHaveBeenCalledWith({
    ok: true,
    status: 'completed',
    connection: 'analytics',
    batch: 1,
    executed: ['001_create'],
    skipped: [],
  });
  expect(command.exit).not.toHaveBeenCalled();
});

it('reports external skips in all-connection JSON', async () => {
  const { runtime, command } = fixture();
  await runDatabaseCommand(
    command,
    'seeds',
    { json: true, all: true },
    runtime,
  );
  expect(command.logJson).toHaveBeenCalledWith(
    expect.objectContaining({
      ok: true,
      results: expect.arrayContaining([
        {
          connection: 'erp',
          kind: 'seeds',
          status: 'skipped',
          reason: 'external',
        },
      ]),
    }),
  );
});

it('prints partial failure JSON before exiting nonzero', async () => {
  const { runtime, command, migration } = fixture();
  migration('main');
  migration('analytics', true);
  await expect(
    runDatabaseCommand(
      command,
      'migrations',
      { json: true, all: true },
      runtime,
    ),
  ).rejects.toThrow('exit 1');
  expect(command.logJson).toHaveBeenCalledWith(
    expect.objectContaining({
      ok: false,
      results: [
        expect.objectContaining({ connection: 'main', status: 'completed' }),
        expect.objectContaining({ connection: 'analytics', status: 'failed' }),
        expect.objectContaining({ connection: 'erp', status: 'not-run' }),
      ],
    }),
  );
});

it('reports invalid selection as JSON and exits nonzero', async () => {
  const { runtime, command } = fixture();
  await expect(
    runDatabaseCommand(
      command,
      'migrations',
      { json: true, all: false, connection: 'unknown' },
      runtime,
    ),
  ).rejects.toThrow('exit 1');
  expect(command.logJson).toHaveBeenCalledWith(
    expect.objectContaining({
      ok: false,
      connection: 'unknown',
      error: expect.stringContaining('Unknown'),
    }),
  );
});

it('requires force for fresh migrations in CI', async () => {
  const { runtime, command } = fixture();
  vi.stubEnv('CI', '1');
  await expect(
    runDatabaseCommand(
      command,
      'migrations',
      { json: true, all: false, fresh: true },
      runtime,
    ),
  ).rejects.toThrow('exit 1');
  expect(command.log).toHaveBeenCalledWith(
    '--fresh requires --force in CI or a non-interactive terminal.',
  );
  expect(command.logJson).not.toHaveBeenCalled();
});

it('uses and disposes the factory application and its scope without autoRun', async () => {
  const { runtime, command, migration } = fixture();
  migration('main', true); // Would fail if autoRun were triggered while migrating analytics.
  migration('analytics');
  const load = runtime.loadRuntime;
  const create = runtime.createApp;
  const destroy = vi.fn();
  const shutdown = vi.fn();
  const register = vi.fn();
  let databaseDestroy = vi.fn();
  let databaseConnection = vi.fn();
  runtime.loadRuntime = async () => {
    const loaded = await load();
    loaded.scope.registerDisposer('test-scope', destroy);
    return loaded;
  };
  runtime.createApp = async (loaded) => {
    const app = await create(loaded);
    const original = app.registerProviders.bind(app);
    app.registerProviders = () => {
      register();
      original();
      const database = app.container.resolve(databaseManagerToken);
      databaseDestroy = vi.spyOn(database, 'destroy');
      databaseConnection = vi.spyOn(database, 'connection');
    };
    const dispose = app.shutdown.bind(app);
    app.shutdown = async () => {
      shutdown();
      await dispose();
    };
    return app;
  };
  await runDatabaseCommand(
    command,
    'migrations',
    { json: true, all: false, connection: 'analytics' },
    runtime,
  );
  expect(register).toHaveBeenCalledOnce();
  expect(shutdown).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledOnce();
  expect(databaseDestroy).toHaveBeenCalledOnce();
  expect(databaseConnection).toHaveBeenCalledWith('analytics');
});

it('cleans partial assembly and retains the factory error when cleanup also fails', async () => {
  const { runtime, command } = fixture();
  const create = runtime.createApp;
  const load = runtime.loadRuntime;
  const destroy = vi.fn();
  const shutdown = vi.fn(async () => {
    throw new Error('cleanup failure');
  });
  runtime.loadRuntime = async () => {
    const loaded = await load();
    loaded.scope.registerDisposer('test-scope', destroy);
    return loaded;
  };
  runtime.createApp = async (loaded) => {
    const app = await create(loaded);
    app.shutdown = shutdown;
    throw new Error('factory failure');
  };
  await expect(
    runDatabaseCommand(command, 'seeds', { json: true, all: false }, runtime),
  ).rejects.toThrow('exit 1');
  expect(shutdown).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledOnce();
  expect(command.logJson).toHaveBeenCalledWith(
    expect.objectContaining({
      error: expect.stringContaining('factory failure'),
    }),
  );
});

it('uses migration sources contributed by the application factory', async () => {
  const { runtime, command, migration } = fixture();
  migration('extra');
  const create = runtime.createApp;
  runtime.createApp = async (loaded) => {
    const app = await create(loaded);
    app.addServerPlugins({
      appPackageName: 'test-app',
      plugins: [
        {
          definition: {
            packageName: 'factory-plugin',
            baseDir: loaded.paths.rootDir,
            serviceProviders: [],
            routes: [],
          },
          metadata: {
            packageName: 'factory-plugin',
            version: '1.0.0',
            baseDir: loaded.paths.rootDir,
            rootDir: loaded.paths.rootDir,
            migrationsDirectory: loaded.paths.database('extra/migrations'),
            jobLocations: [],
          },
        },
      ],
    });
    return app;
  };
  await runDatabaseCommand(
    command,
    'migrations',
    { json: true, all: false },
    runtime,
  );
  expect(command.logJson).toHaveBeenCalledWith(
    expect.objectContaining({ executed: ['001_create'] }),
  );
});

import {
  createDatabaseManager,
  databaseManagerToken,
  TASK_LOCK_EXPIRY_MS,
} from '@nocobase/db';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import { createAppFromRuntime } from '@nocobase/app-server/runtime';
import { DatabaseProvider } from '@nocobase/app-server/database';
import type { AppCommandContext } from '../src/context.ts';
import { IdGeneratorProvider } from '@nocobase/app-server/id-generator';
import { ServiceProvider } from '../../../libs/service-provider/src/index.ts';
import type { Application } from '@nocobase/app-server';
// @vitest-environment node
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectionsRefreshAllowed,
  runDatabaseApplyCommand,
  runDatabaseRedoCommand,
  runDatabaseRepairCommand,
  runDatabaseRollbackCommand,
  runDatabaseUnlockCommand,
} from '../src/database-command.ts';
import { createAppPaths, AppConfig } from '@nocobase/app-server/config';
import { setApplicationState } from '../src/runtime/command-store.ts';
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
  function seed(connection: string) {
    const directory = paths.database(`${connection}/seeds`);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, '001_defaults.ts'),
      `import { defineSeed } from '@nocobase/db';
export default defineSeed({ name: '001_defaults', async run() {} });`,
    );
  }
  /** Edit both sources after execution, the way a reformat or a comment would. */
  function rewrite(connection: string) {
    for (const file of [
      paths.database(`${connection}/migrations/001_create.ts`),
      paths.database(`${connection}/seeds/001_defaults.ts`),
    ])
      if (existsSync(file))
        appendFileSync(file, '\n// changed after execution\n');
  }
  /** Writes a lock row the way a run holding one would. */
  async function lockRow(
    connection: string,
    { lockedBy, beating }: { lockedBy: string; beating: boolean },
  ): Promise<void> {
    const manager = createDatabaseManager({
      drivers: { sqlite },
      connections: {
        [connection]: {
          dialect: 'sqlite',
          filename: paths.storage(`${connection}.sqlite`),
        },
      },
    });
    try {
      const at = beating
        ? new Date()
        : new Date(Date.now() - TASK_LOCK_EXPIRY_MS * 4);
      await manager
        .query(connection)
        .insertInto('__nocobase_migration_lock')
        .values({ id: 1, locked_by: lockedBy, locked_at: at, heartbeat_at: at })
        .execute();
    } finally {
      await manager.destroy();
    }
  }
  return { runtime, command, migration, seed, rewrite, lockRow, paths };
}

it('reports both kinds per connection and honors manual selection', async () => {
  const { runtime, command, migration } = fixture();
  migration('analytics');
  await runDatabaseApplyCommand(
    command,
    { json: true, all: false, connection: 'analytics' },
    runtime,
  );
  expect(command.logJson).toHaveBeenCalledWith({
    ok: true,
    status: 'completed',
    results: [
      {
        connection: 'analytics',
        kind: 'migrations',
        status: 'completed',
        batch: 1,
        executed: ['001_create'],
        skipped: [],
        warnings: [],
      },
      {
        connection: 'analytics',
        kind: 'seeds',
        status: 'skipped',
        reason: 'missing-directory',
      },
    ],
  });
  expect(command.exit).not.toHaveBeenCalled();
});

it('reports external skips in all-connection JSON', async () => {
  const { runtime, command } = fixture();
  await runDatabaseApplyCommand(command, { json: true, all: true }, runtime);
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
    runDatabaseApplyCommand(command, { json: true, all: true }, runtime),
  ).rejects.toThrow('exit 1');
  expect(command.logJson).toHaveBeenCalledWith(
    expect.objectContaining({
      ok: false,
      results: [
        expect.objectContaining({
          connection: 'main',
          kind: 'migrations',
          status: 'completed',
        }),
        expect.objectContaining({ connection: 'main', kind: 'seeds' }),
        expect.objectContaining({
          connection: 'analytics',
          kind: 'migrations',
          status: 'failed',
        }),
        // Everything planned after the failure is reported, not silently dropped.
        expect.objectContaining({
          connection: 'analytics',
          kind: 'seeds',
          status: 'not-run',
        }),
        expect.objectContaining({ connection: 'erp', status: 'not-run' }),
        expect.objectContaining({ connection: 'erp', status: 'not-run' }),
      ],
    }),
  );
});

it('reports invalid selection as JSON and exits nonzero', async () => {
  const { runtime, command } = fixture();
  await expect(
    runDatabaseApplyCommand(
      command,
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

it('requires force for a reset in CI', async () => {
  const { runtime, command } = fixture();
  vi.stubEnv('CI', '1');
  await expect(
    runDatabaseApplyCommand(
      command,
      { json: true, all: false, fresh: true },
      runtime,
    ),
  ).rejects.toThrow('exit 1');
  expect(command.log).toHaveBeenCalledWith(
    'Reset requires --force in CI or a non-interactive terminal.',
  );
  expect(command.logJson).not.toHaveBeenCalled();
});

it('applies migrations and seeds as one plan, and resets from empty', async () => {
  const { runtime, command, migration, seed } = fixture();
  migration('main');
  seed('main');
  command.logJson.mockClear();
  await runDatabaseApplyCommand(command, { json: true, all: false }, runtime);
  const applied = command.logJson.mock.calls.at(-1)?.[0];
  expect(
    applied.results.map((entry: { kind: string; executed: string[] }) => [
      entry.kind,
      entry.executed,
    ]),
  ).toEqual([
    ['migrations', ['001_create']],
    ['seeds', ['001_defaults']],
  ]);

  // Repeating it runs nothing; both halves report the task as skipped.
  command.logJson.mockClear();
  await runDatabaseApplyCommand(command, { json: true, all: false }, runtime);
  expect(
    command.logJson.mock.calls
      .at(-1)?.[0]
      .results.flatMap((entry: { executed: string[] }) => entry.executed),
  ).toEqual([]);

  // A reset rebuilds the schema and reruns both, seeds included — which is
  // what `migrate --fresh` could not do.
  command.logJson.mockClear();
  await runDatabaseApplyCommand(
    command,
    { json: true, all: false, fresh: true, force: true },
    runtime,
  );
  const reset = command.logJson.mock.calls.at(-1)?.[0];
  expect(
    reset.results.map((entry: { kind: string; executed: string[] }) => [
      entry.kind,
      entry.executed,
    ]),
  ).toEqual([
    ['migrations', ['001_create']],
    ['seeds', ['001_defaults']],
  ]);
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
  await runDatabaseApplyCommand(
    command,
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
    runDatabaseApplyCommand(command, { json: true, all: false }, runtime),
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
  await runDatabaseApplyCommand(command, { json: true, all: false }, runtime);
  expect(command.logJson).toHaveBeenCalledWith(
    expect.objectContaining({
      results: expect.arrayContaining([
        expect.objectContaining({
          kind: 'migrations',
          executed: ['001_create'],
        }),
      ]),
    }),
  );
});

it('warns about checksum drift and repairs it across both task kinds', async () => {
  const { runtime, command, migration, seed, rewrite } = fixture();
  migration('main');
  seed('main');
  await runDatabaseApplyCommand(command, { json: false, all: false }, runtime);
  rewrite('main');

  // The default policy reports the drift without stopping the run.
  command.log.mockClear();
  await runDatabaseApplyCommand(command, { json: false, all: false }, runtime);
  const drift = command.log.mock.calls.flat().join('\n');
  expect(drift).toContain(
    'WARNING: checksum changed since it was executed: 001_create',
  );
  // Both routes, because repair is only right when the schema already agrees
  // with the edited source.
  expect(drift).toContain('"nocobase db repair"');
  expect(drift).toContain('"nocobase db redo"');
  expect(command.exit).not.toHaveBeenCalled();

  // A dry run reports both kinds and writes nothing.
  command.logJson.mockClear();
  await runDatabaseRepairCommand(
    command,
    { json: true, all: false, dryRun: true },
    runtime,
  );
  const preview = command.logJson.mock.calls.at(-1)?.[0];
  expect(preview).toMatchObject({ ok: true, status: 'completed' });
  expect(
    preview.results.map((entry: { kind: string; repaired: unknown[] }) => [
      entry.kind,
      entry.repaired.length,
    ]),
  ).toEqual([
    ['migrations', 1],
    ['seeds', 1],
  ]);
  expect(
    preview.results.every((entry: { dryRun: boolean }) => entry.dryRun),
  ).toBe(true);

  command.logJson.mockClear();
  await runDatabaseRepairCommand(
    command,
    { json: true, all: false, force: true },
    runtime,
  );
  const repaired = command.logJson.mock.calls.at(-1)?.[0];
  expect(
    repaired.results.flatMap(
      (entry: { repaired: { name: string }[] }) => entry.repaired,
    ),
  ).toHaveLength(2);

  // Nothing is left to repair, and the run no longer warns.
  command.log.mockClear();
  await runDatabaseApplyCommand(command, { json: false, all: false }, runtime);
  expect(command.log.mock.calls.flat().join('\n')).not.toContain('WARNING');
  command.logJson.mockClear();
  await runDatabaseRepairCommand(
    command,
    { json: true, all: false, force: true },
    runtime,
  );
  expect(
    command.logJson.mock.calls
      .at(-1)?.[0]
      .results.flatMap((entry: { repaired: unknown[] }) => entry.repaired),
  ).toEqual([]);
});

it('rolls the latest batch back and lets it run again', async () => {
  const { runtime, command, migration } = fixture();
  migration('main');
  await runDatabaseApplyCommand(command, { json: true, all: false }, runtime);

  await runDatabaseRollbackCommand(
    command,
    { json: true, all: false, force: true },
    runtime,
  );
  expect(command.logJson).toHaveBeenLastCalledWith(
    expect.objectContaining({
      ok: true,
      results: [
        expect.objectContaining({
          connection: 'main',
          kind: 'migrations',
          status: 'completed',
          batch: 1,
          rolledBack: ['001_create'],
          dryRun: false,
        }),
      ],
    }),
  );

  // The history record is gone, so the corrected migration runs again rather
  // than being skipped as already executed.
  await runDatabaseApplyCommand(command, { json: true, all: false }, runtime);
  expect(command.logJson).toHaveBeenLastCalledWith(
    expect.objectContaining({
      results: expect.arrayContaining([
        expect.objectContaining({
          kind: 'migrations',
          executed: ['001_create'],
        }),
      ]),
    }),
  );
  expect(command.exit).not.toHaveBeenCalled();
});

it('redoes the batch in one command, reporting both halves', async () => {
  const { runtime, command, migration } = fixture();
  migration('main');
  await runDatabaseApplyCommand(command, { json: true, all: false }, runtime);

  await runDatabaseRedoCommand(
    command,
    { json: true, all: false, force: true },
    runtime,
  );
  expect(command.logJson).toHaveBeenLastCalledWith(
    expect.objectContaining({
      ok: true,
      results: expect.arrayContaining([
        expect.objectContaining({
          kind: 'migrations',
          rolledBack: ['001_create'],
        }),
        expect.objectContaining({
          kind: 'migrations',
          executed: ['001_create'],
        }),
      ]),
    }),
  );
  expect(command.exit).not.toHaveBeenCalled();
});

it('reports an empty history as nothing to roll back', async () => {
  const { runtime, command, migration } = fixture();
  migration('main');
  await runDatabaseRollbackCommand(
    command,
    { json: true, all: false, force: true },
    runtime,
  );
  expect(command.logJson).toHaveBeenLastCalledWith(
    expect.objectContaining({
      ok: true,
      results: [
        expect.objectContaining({
          status: 'completed',
          batch: 0,
          rolledBack: [],
          dryRun: true,
        }),
      ],
    }),
  );
  expect(command.exit).not.toHaveBeenCalled();
});

it('requires --force where it cannot prompt', async () => {
  const { runtime, command, migration } = fixture();
  migration('main');
  await runDatabaseApplyCommand(command, { json: true, all: false }, runtime);

  await expect(
    runDatabaseRollbackCommand(command, { json: true, all: false }, runtime),
  ).rejects.toThrow('exit 1');
  expect(command.logJson).toHaveBeenLastCalledWith(
    expect.objectContaining({
      ok: false,
      error: 'A rollback requires --force in CI or a non-interactive terminal.',
    }),
  );
});

it('reports an unheld lock, refuses a live one and releases it with --force', async () => {
  const { runtime, command, migration, lockRow } = fixture();
  migration('main');
  await runDatabaseApplyCommand(command, { json: true, all: false }, runtime);

  await runDatabaseUnlockCommand(command, { json: true, all: false }, runtime);
  expect(command.logJson).toHaveBeenLastCalledWith(
    expect.objectContaining({
      ok: true,
      results: expect.arrayContaining([
        expect.objectContaining({
          kind: 'migrations',
          released: false,
          lockReason: 'not-held',
        }),
      ]),
    }),
  );

  // A run that is still beating holds its lock; releasing it would let a
  // second run start beside the first.
  await lockRow('main', { lockedBy: 'live-run', beating: true });
  await runDatabaseUnlockCommand(command, { json: true, all: false }, runtime);
  expect(command.logJson).toHaveBeenLastCalledWith(
    expect.objectContaining({
      results: expect.arrayContaining([
        expect.objectContaining({
          kind: 'migrations',
          released: false,
          lockReason: 'active',
        }),
      ]),
    }),
  );

  await runDatabaseUnlockCommand(
    command,
    { json: true, all: false, force: true },
    runtime,
  );
  expect(command.logJson).toHaveBeenLastCalledWith(
    expect.objectContaining({
      results: expect.arrayContaining([
        expect.objectContaining({ kind: 'migrations', released: true }),
      ]),
    }),
  );
  expect(command.exit).not.toHaveBeenCalled();
});

it('releases a lock whose holder stopped beating without --force', async () => {
  const { runtime, command, migration, lockRow } = fixture();
  migration('main');
  await runDatabaseApplyCommand(command, { json: true, all: false }, runtime);
  await lockRow('main', { lockedBy: 'killed-run', beating: false });

  await runDatabaseUnlockCommand(command, { json: true, all: false }, runtime);
  expect(command.logJson).toHaveBeenLastCalledWith(
    expect.objectContaining({
      results: expect.arrayContaining([
        expect.objectContaining({
          kind: 'migrations',
          released: true,
          lock: expect.objectContaining({ lockedBy: 'killed-run' }),
        }),
      ]),
    }),
  );
});

describe('refreshing the Collection cache', () => {
  afterEach(() => {
    setApplicationState(undefined);
  });

  it('writes the cache after migrations run, and leaves it alone when nothing did', async () => {
    const { runtime, command, migration, paths } = fixture();
    migration('main');
    await runDatabaseApplyCommand(
      command,
      { json: true, all: false, collections: true },
      runtime,
    );
    expect(command.logJson).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ok: true,
        collections: [
          {
            connection: 'main',
            status: 'completed',
            written: [
              '_manifest.json',
              'rows/collection.json',
              'rows/metadata.json',
              'rows/schema.json',
            ],
            deleted: [],
          },
        ],
      }),
    );
    expect(
      existsSync(paths.database('main/collections/rows/schema.json')),
    ).toBe(true);

    // Nothing is pending, so the schema did not change and nothing is refreshed.
    await runDatabaseApplyCommand(
      command,
      { json: true, all: false, collections: true },
      runtime,
    );
    expect(command.logJson.mock.lastCall?.[0]).not.toHaveProperty(
      'collections',
    );
    expect(command.exit).not.toHaveBeenCalled();
  });

  it('writes nothing unless asked', async () => {
    const { runtime, command, migration, paths } = fixture();
    migration('main');
    await runDatabaseApplyCommand(command, { json: true, all: false }, runtime);
    expect(command.logJson.mock.lastCall?.[0]).not.toHaveProperty(
      'collections',
    );
    expect(existsSync(paths.database('main/collections'))).toBe(false);
  });

  it('follows a rollback and a reset', async () => {
    const { runtime, command, migration, paths } = fixture();
    migration('main');
    await runDatabaseApplyCommand(
      command,
      { json: true, all: false, collections: true },
      runtime,
    );

    await runDatabaseRollbackCommand(
      command,
      { json: true, all: false, force: true, collections: true },
      runtime,
    );
    expect(command.logJson).toHaveBeenLastCalledWith(
      expect.objectContaining({
        collections: [
          expect.objectContaining({
            connection: 'main',
            status: 'completed',
            deleted: [
              'rows/collection.json',
              'rows/metadata.json',
              'rows/schema.json',
            ],
          }),
        ],
      }),
    );
    expect(existsSync(paths.database('main/collections/rows'))).toBe(false);

    await runDatabaseApplyCommand(
      command,
      { json: true, all: false, fresh: true, force: true, collections: true },
      runtime,
    );
    expect(command.logJson).toHaveBeenLastCalledWith(
      expect.objectContaining({
        collections: [expect.objectContaining({ status: 'completed' })],
      }),
    );
    expect(existsSync(paths.database('main/collections/rows'))).toBe(true);
  });

  it('reports a failed refresh without failing the migrations it follows', async () => {
    const { runtime, command, migration, paths } = fixture();
    const warn = vi.fn();
    migration('main');
    // An entry the generator does not own makes it refuse to write.
    mkdirSync(paths.database('main/collections'), { recursive: true });
    writeFileSync(paths.database('main/collections/notes.txt'), 'mine\n');

    await runDatabaseApplyCommand(
      { ...command, warn },
      { json: false, all: false, collections: true },
      runtime,
    );
    expect(command.exit).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /Could not refresh the Collection cache of "main": .*notes\.txt.*nocobase collections generate --connection main/,
      ),
    );
    expect(command.log).toHaveBeenCalledWith('Executed: 001_create');
  });

  it('is not allowed in a built dist/', () => {
    const loadPlugins = async () => undefined;
    setApplicationState({
      location: { kind: 'deployment', root: '/srv/app', publishing: false },
      loadPlugins,
    });
    expect(collectionsRefreshAllowed()).toBe(false);
    setApplicationState({
      location: { kind: 'source', root: '/srv/app', publishing: false },
      loadPlugins,
    });
    expect(collectionsRefreshAllowed()).toBe(true);
  });
});

import {
  createDatabaseManager,
  databaseManagerToken,
  TASK_LOCK_EXPIRY_MS,
} from '@nocobase/db';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import { createAppFromRuntime } from '@nocobase/app-server/runtime';
import { DatabaseProvider } from '@nocobase/app-server/database';
import type { AppCommand, AppCommandContext } from '../src/context.ts';
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
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectionsRefreshAllowed,
  runDatabaseApplyCommand,
  runDatabaseRedoCommand,
  runDatabaseRepairCommand,
  runDatabaseRollbackCommand,
  runDatabaseUnlockCommand,
  type DatabaseCommandResult,
} from '../src/database-command.ts';
import { CommandError } from '../src/command/errors.ts';
import AppDbApply from '../src/commands/db/apply.ts';
import AppDbRedo from '../src/commands/db/redo.ts';
import AppDbRepair from '../src/commands/db/repair.ts';
import AppDbReset from '../src/commands/db/reset.ts';
import AppDbRollback from '../src/commands/db/rollback.ts';
import AppDbUnlock from '../src/commands/db/unlock.ts';
import CollectionsDoctor from '../src/commands/collections/doctor.ts';
import AppCollectionsGenerate from '../src/commands/collections/generate.ts';
import { bindAppCommand } from './app-command.ts';
import { runAppCommand } from './command-output.ts';
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

function fixture({ configured = true }: { configured?: boolean } = {}) {
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
          defaultConfigs: () => ({
            database: configured
              ? database
              : { drivers: { sqlite }, connections: {} },
            snowflake: { workerId: 0 },
          }),
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
    warn: vi.fn(),
    jsonEnabled: () => false,
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
  /** Drops a table the way a hand-rolled reset does: without its metadata. */
  async function dropTable(connection: string, table: string): Promise<void> {
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
      const client = await manager
        .connection(connection)
        .client<{ raw(sql: string): Promise<unknown> }>();
      await client.raw(`drop table ${table}`);
    } finally {
      await manager.destroy();
    }
  }
  /** `command` bound to this fixture, the way the runner points it at the application it located. */
  function bind<T extends typeof AppCommand>(command: T): T {
    return bindAppCommand(command, { rootDir: root, ...runtime });
  }
  return {
    root,
    runtime,
    command,
    migration,
    seed,
    rewrite,
    lockRow,
    dropTable,
    bind,
    paths,
  };
}

/** The rejection of `promise`, which the test expects to fail. */
async function failure(promise: Promise<unknown>): Promise<CommandError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(CommandError);
  return error as CommandError;
}

it('reports both kinds per connection and honors manual selection', async () => {
  const { runtime, command, migration } = fixture();
  migration('analytics');
  const result = await runDatabaseApplyCommand(
    command,
    { all: false, connection: 'analytics' },
    runtime,
  );
  expect(result).toEqual({
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
});

it('reports external skips across all connections', async () => {
  const { runtime, command } = fixture();
  const result = await runDatabaseApplyCommand(command, { all: true }, runtime);
  expect(result.results).toEqual(
    expect.arrayContaining([
      {
        connection: 'erp',
        kind: 'seeds',
        status: 'skipped',
        reason: 'external',
      },
    ]),
  );
});

it('prints every planned task of a partial failure, then fails with them in its details', async () => {
  const { runtime, command, migration } = fixture();
  migration('main');
  migration('analytics', true);
  const error = await failure(
    runDatabaseApplyCommand(command, { all: true }, runtime),
  );
  expect(error).toMatchObject({
    errorCode: 'DATABASE_TASK_FAILED',
    exitCode: 1,
    message: expect.stringMatching(
      /^Database migrations failed for connection "analytics": .*failed migration/,
    ),
    details: {
      connection: 'analytics',
      kind: 'migrations',
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
    },
  });
  expect(command.log).toHaveBeenCalledWith(
    expect.stringMatching(/^\[analytics\] migrations: failed: /),
  );
  expect(command.log).toHaveBeenCalledWith(
    '[analytics] seeds: not-run (previous-task-failed)',
  );
});

it('reports an invalid selection with the connection it named', async () => {
  const { runtime, command } = fixture();
  const error = await failure(
    runDatabaseApplyCommand(
      command,
      { all: false, connection: 'unknown' },
      runtime,
    ),
  );
  expect(error).toMatchObject({
    errorCode: 'DATABASE_COMMAND_FAILED',
    exitCode: 1,
    message: expect.stringContaining('Unknown'),
    details: { connection: 'unknown' },
  });
});

it('requires force for a reset in CI, as invalid usage', async () => {
  const { runtime, command } = fixture();
  vi.stubEnv('CI', '1');
  const error = await failure(
    runDatabaseApplyCommand(command, { all: false, fresh: true }, runtime),
  );
  expect(error).toMatchObject({
    errorCode: 'FORCE_REQUIRED',
    exitCode: 2,
    message: 'Reset requires --force in CI or a non-interactive terminal.',
  });
  expect(command.log).not.toHaveBeenCalled();
});

it('applies migrations and seeds as one plan, and resets from empty', async () => {
  const { runtime, command, migration, seed } = fixture();
  migration('main');
  seed('main');
  const applied = await runDatabaseApplyCommand(
    command,
    { all: false },
    runtime,
  );
  expect(applied.results.map((entry) => [entry.kind, entry.executed])).toEqual([
    ['migrations', ['001_create']],
    ['seeds', ['001_defaults']],
  ]);

  // Repeating it runs nothing; both halves report the task as skipped.
  const repeated = await runDatabaseApplyCommand(
    command,
    { all: false },
    runtime,
  );
  expect(repeated.results.flatMap((entry) => entry.executed)).toEqual([]);

  // A reset rebuilds the schema and reruns both, seeds included — which is
  // what `migrate --fresh` could not do.
  const reset = await runDatabaseApplyCommand(
    command,
    { all: false, fresh: true, force: true },
    runtime,
  );
  expect(reset.results.map((entry) => [entry.kind, entry.executed])).toEqual([
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
    { all: false, connection: 'analytics' },
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
  const error = await failure(
    runDatabaseApplyCommand(command, { all: false }, runtime),
  );
  expect(shutdown).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledOnce();
  expect(error).toMatchObject({
    errorCode: 'DATABASE_COMMAND_FAILED',
    message: expect.stringContaining('factory failure'),
  });
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
  const result = await runDatabaseApplyCommand(
    command,
    { all: false },
    runtime,
  );
  expect(result.results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'migrations',
        executed: ['001_create'],
      }),
    ]),
  );
});

it('warns about checksum drift and repairs it across both task kinds', async () => {
  const { runtime, command, migration, seed, rewrite } = fixture();
  migration('main');
  seed('main');
  await runDatabaseApplyCommand(command, { all: false }, runtime);
  rewrite('main');

  // The default policy reports the drift without stopping the run.
  command.log.mockClear();
  await runDatabaseApplyCommand(command, { all: false }, runtime);
  const drift = command.log.mock.calls.flat().join('\n');
  expect(drift).toContain(
    'WARNING: checksum changed since it was executed: 001_create',
  );
  // Both routes, because repair is only right when the schema already agrees
  // with the edited source.
  expect(drift).toContain('"nocobase db repair"');
  expect(drift).toContain('"nocobase db redo"');

  // A dry run reports both kinds and writes nothing.
  const preview = await runDatabaseRepairCommand(
    command,
    { all: false, dryRun: true },
    runtime,
  );
  expect(
    preview.results.map((entry) => [entry.kind, entry.repaired?.length]),
  ).toEqual([
    ['migrations', 1],
    ['seeds', 1],
  ]);
  expect(preview.results.every((entry) => entry.dryRun)).toBe(true);

  const repaired = await runDatabaseRepairCommand(
    command,
    { all: false, force: true },
    runtime,
  );
  expect(repaired.results.flatMap((entry) => entry.repaired)).toHaveLength(2);

  // Nothing is left to repair, and the run no longer warns.
  command.log.mockClear();
  await runDatabaseApplyCommand(command, { all: false }, runtime);
  expect(command.log.mock.calls.flat().join('\n')).not.toContain('WARNING');
  const clean = await runDatabaseRepairCommand(
    command,
    { all: false, force: true },
    runtime,
  );
  expect(clean.results.flatMap((entry) => entry.repaired)).toEqual([]);
});

it('rolls the latest batch back and lets it run again', async () => {
  const { runtime, command, migration } = fixture();
  migration('main');
  await runDatabaseApplyCommand(command, { all: false }, runtime);

  const rolledBack = await runDatabaseRollbackCommand(
    command,
    { all: false, force: true },
    runtime,
  );
  expect(rolledBack.results).toEqual([
    expect.objectContaining({
      connection: 'main',
      kind: 'migrations',
      status: 'completed',
      batch: 1,
      rolledBack: ['001_create'],
      dryRun: false,
    }),
  ]);

  // The history record is gone, so the corrected migration runs again rather
  // than being skipped as already executed.
  const applied = await runDatabaseApplyCommand(
    command,
    { all: false },
    runtime,
  );
  expect(applied.results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'migrations',
        executed: ['001_create'],
      }),
    ]),
  );
});

it('redoes the batch in one command, reporting both halves', async () => {
  const { runtime, command, migration } = fixture();
  migration('main');
  await runDatabaseApplyCommand(command, { all: false }, runtime);

  const result = await runDatabaseRedoCommand(
    command,
    { all: false, force: true },
    runtime,
  );
  expect(result.results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'migrations',
        rolledBack: ['001_create'],
      }),
      expect.objectContaining({
        kind: 'migrations',
        executed: ['001_create'],
      }),
    ]),
  );
});

it('reports an empty history as nothing to roll back', async () => {
  const { runtime, command, migration } = fixture();
  migration('main');
  const result = await runDatabaseRollbackCommand(
    command,
    { all: false, force: true },
    runtime,
  );
  expect(result.results).toEqual([
    expect.objectContaining({
      status: 'completed',
      batch: 0,
      rolledBack: [],
      dryRun: true,
    }),
  ]);
  expect(command.log).toHaveBeenCalledWith('Nothing to roll back.');
});

it('requires --force where it cannot prompt', async () => {
  const { runtime, command, migration } = fixture();
  migration('main');
  await runDatabaseApplyCommand(command, { all: false }, runtime);
  vi.stubEnv('CI', '1');

  for (const [run, message] of [
    [
      runDatabaseRollbackCommand,
      'A rollback requires --force in CI or a non-interactive terminal.',
    ],
    [
      runDatabaseRedoCommand,
      'A redo requires --force in CI or a non-interactive terminal.',
    ],
  ] as const) {
    const error = await failure(run(command, { all: false }, runtime));
    expect(error).toMatchObject({
      errorCode: 'FORCE_REQUIRED',
      exitCode: 2,
      message,
    });
  }

  // Nothing was rolled back: the batch is still recorded.
  const preview = await runDatabaseRollbackCommand(
    command,
    { all: false, force: true },
    runtime,
  );
  expect(preview.results[0]).toMatchObject({ rolledBack: ['001_create'] });
});

it('reports an unheld lock, refuses a live one and releases it with --force', async () => {
  const { runtime, command, migration, lockRow } = fixture();
  migration('main');
  await runDatabaseApplyCommand(command, { all: false }, runtime);

  const unheld = await runDatabaseUnlockCommand(
    command,
    { all: false },
    runtime,
  );
  expect(unheld.results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'migrations',
        released: false,
        lockReason: 'not-held',
      }),
    ]),
  );

  // A run that is still beating holds its lock; releasing it would let a
  // second run start beside the first.
  await lockRow('main', { lockedBy: 'live-run', beating: true });
  const live = await runDatabaseUnlockCommand(command, { all: false }, runtime);
  expect(live.results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'migrations',
        released: false,
        lockReason: 'active',
      }),
    ]),
  );

  const forced = await runDatabaseUnlockCommand(
    command,
    { all: false, force: true },
    runtime,
  );
  expect(forced.results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'migrations', released: true }),
    ]),
  );
});

it('releases a lock whose holder stopped beating without --force', async () => {
  const { runtime, command, migration, lockRow } = fixture();
  migration('main');
  await runDatabaseApplyCommand(command, { all: false }, runtime);
  await lockRow('main', { lockedBy: 'killed-run', beating: false });

  const result = await runDatabaseUnlockCommand(
    command,
    { all: false },
    runtime,
  );
  expect(result.results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'migrations',
        released: true,
        lock: expect.objectContaining({ lockedBy: 'killed-run' }),
      }),
    ]),
  );
});

describe('refreshing the Collection cache', () => {
  afterEach(() => {
    setApplicationState(undefined);
  });

  it('writes the cache after migrations run, and leaves it alone when nothing did', async () => {
    const { runtime, command, migration, paths } = fixture();
    migration('main');
    const applied = await runDatabaseApplyCommand(
      command,
      { all: false, collections: true },
      runtime,
    );
    expect(applied.collections).toEqual([
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
    ]);
    expect(
      existsSync(paths.database('main/collections/rows/schema.json')),
    ).toBe(true);
    expect(command.log).toHaveBeenCalledWith(
      '[main] collections: refreshed (4 written, 0 deleted)',
    );

    // Nothing is pending, so the schema did not change and nothing is refreshed.
    const repeated = await runDatabaseApplyCommand(
      command,
      { all: false, collections: true },
      runtime,
    );
    expect(repeated).not.toHaveProperty('collections');
  });

  it('writes nothing unless asked', async () => {
    const { runtime, command, migration, paths } = fixture();
    migration('main');
    const result = await runDatabaseApplyCommand(
      command,
      { all: false },
      runtime,
    );
    expect(result).not.toHaveProperty('collections');
    expect(existsSync(paths.database('main/collections'))).toBe(false);
  });

  it('follows a rollback and a reset', async () => {
    const { runtime, command, migration, paths } = fixture();
    migration('main');
    await runDatabaseApplyCommand(
      command,
      { all: false, collections: true },
      runtime,
    );

    const rolledBack = await runDatabaseRollbackCommand(
      command,
      { all: false, force: true, collections: true },
      runtime,
    );
    expect(rolledBack.collections).toEqual([
      expect.objectContaining({
        connection: 'main',
        status: 'completed',
        deleted: [
          'rows/collection.json',
          'rows/metadata.json',
          'rows/schema.json',
        ],
      }),
    ]);
    expect(existsSync(paths.database('main/collections/rows'))).toBe(false);

    const reset = await runDatabaseApplyCommand(
      command,
      { all: false, fresh: true, force: true, collections: true },
      runtime,
    );
    expect(reset.collections).toEqual([
      expect.objectContaining({ status: 'completed' }),
    ]);
    expect(existsSync(paths.database('main/collections/rows'))).toBe(true);
  });

  it('reports a failed refresh without failing the migrations it follows', async () => {
    const { runtime, command, migration, paths } = fixture();
    migration('main');
    // An entry the generator does not own makes it refuse to write.
    mkdirSync(paths.database('main/collections'), { recursive: true });
    writeFileSync(paths.database('main/collections/notes.txt'), 'mine\n');

    const result = await runDatabaseApplyCommand(
      command,
      { all: false, collections: true },
      runtime,
    );
    expect(result.collections).toEqual([
      expect.objectContaining({ connection: 'main', status: 'failed' }),
    ]);
    expect(command.warn).toHaveBeenCalledWith(
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

describe('the db commands', () => {
  it('answer --json with the task results as the result, and nothing else on stdout', async () => {
    const { root, bind, migration } = fixture();
    migration('analytics');
    const run = await runAppCommand(
      bind(AppDbApply),
      ['--json', '--connection', 'analytics', '--no-collections'],
      root,
    );
    expect(run.exitCode).toBeUndefined();
    const json = run.json();
    expect(json).toMatchObject({
      schemaVersion: 1,
      ok: true,
      status: 'success',
      warnings: [],
    });
    const result = json.result as DatabaseCommandResult;
    // `ok` and `status` belong to the envelope now.
    expect(Object.keys(result)).toEqual(['results']);
    expect(result.results).toEqual([
      expect.objectContaining({
        connection: 'analytics',
        kind: 'migrations',
        executed: ['001_create'],
      }),
      expect.objectContaining({ connection: 'analytics', kind: 'seeds' }),
    ]);
  });

  it('refresh the Collection cache by default, and leave it alone with --no-collections', async () => {
    const { root, bind, migration, paths } = fixture();
    migration('main');
    const skipped = await runAppCommand(
      bind(AppDbApply),
      ['--json', '--no-collections'],
      root,
    );
    expect(skipped.json().result).not.toHaveProperty('collections');
    expect(existsSync(paths.database('main/collections'))).toBe(false);

    const rolledBack = await runAppCommand(
      bind(AppDbRollback),
      ['--json', '--force'],
      root,
    );
    expect(rolledBack.json()).toMatchObject({
      ok: true,
      result: {
        results: [expect.objectContaining({ rolledBack: ['001_create'] })],
      },
    });

    const applied = await runAppCommand(bind(AppDbApply), ['--json'], root);
    expect(applied.json()).toMatchObject({
      ok: true,
      result: {
        collections: [
          expect.objectContaining({ connection: 'main', status: 'completed' }),
        ],
      },
    });
    expect(
      existsSync(paths.database('main/collections/rows/schema.json')),
    ).toBe(true);
  });

  it('print the same lines for people as before', async () => {
    const { root, bind, migration } = fixture();
    migration('main');
    const run = await runAppCommand(
      bind(AppDbApply),
      ['--no-collections'],
      root,
    );
    expect(run.error).toBeUndefined();
    expect(run.stdout).toBe(
      [
        '[main] migrations: completed',
        'Batch: 1',
        'Executed: 001_create',
        'Skipped: none',
        '[main] seeds: skipped (missing-directory)',
        '',
      ].join('\n'),
    );
  });

  it('fail --json with the per-connection results in error.details', async () => {
    const { root, bind, migration } = fixture();
    migration('main');
    migration('analytics', true);
    const run = await runAppCommand(
      bind(AppDbApply),
      ['--json', '--all', '--no-collections'],
      root,
    );
    expect(run.exitCode).toBe(1);
    expect(run.json()).toMatchObject({
      ok: false,
      status: 'failure',
      error: {
        code: 'DATABASE_TASK_FAILED',
        message: expect.stringContaining(
          'Database migrations failed for connection "analytics"',
        ),
        details: {
          connection: 'analytics',
          kind: 'migrations',
          results: expect.arrayContaining([
            expect.objectContaining({
              connection: 'main',
              kind: 'migrations',
              status: 'completed',
            }),
            expect.objectContaining({
              connection: 'analytics',
              kind: 'migrations',
              status: 'failed',
            }),
          ]),
        },
      },
    });
  });

  it('print the entries before failing without --json', async () => {
    const { root, bind, migration } = fixture();
    migration('main', true);
    const run = await runAppCommand(
      bind(AppDbApply),
      ['--no-collections'],
      root,
    );
    expect(run.error).toMatchObject({
      errorCode: 'DATABASE_TASK_FAILED',
      oclif: { exit: 1 },
    });
    expect(run.stdout).toMatch(/^\[main\] migrations: failed: /);
    expect(run.stdout).toContain(
      '[main] seeds: not-run (previous-task-failed)',
    );
  });

  it('refuse a destructive run without --force as invalid usage', async () => {
    const { root, bind, migration } = fixture();
    migration('main');
    await runAppCommand(bind(AppDbApply), ['--json'], root);
    vi.stubEnv('CI', '1');

    for (const [command, message] of [
      [
        AppDbReset,
        'Reset requires --force in CI or a non-interactive terminal.',
      ],
      [
        AppDbRollback,
        'A rollback requires --force in CI or a non-interactive terminal.',
      ],
      [
        AppDbRedo,
        'A redo requires --force in CI or a non-interactive terminal.',
      ],
    ] as const) {
      const run = await runAppCommand(bind(command), ['--json'], root);
      expect(run.exitCode).toBe(2);
      expect(run.json()).toMatchObject({
        ok: false,
        error: { code: 'FORCE_REQUIRED', message },
      });
    }
  });

  it('report repair and unlock results under --json', async () => {
    const { root, bind, migration } = fixture();
    migration('main');
    await runAppCommand(bind(AppDbApply), ['--json'], root);

    const repair = await runAppCommand(
      bind(AppDbRepair),
      ['--json', '--dry-run'],
      root,
    );
    expect(repair.json()).toMatchObject({
      ok: true,
      status: 'success',
      result: {
        results: [
          expect.objectContaining({ kind: 'migrations', dryRun: true }),
          expect.objectContaining({ kind: 'seeds' }),
        ],
      },
    });

    const unlock = await runAppCommand(bind(AppDbUnlock), ['--json'], root);
    expect(unlock.json()).toMatchObject({
      ok: true,
      result: {
        results: expect.arrayContaining([
          expect.objectContaining({ kind: 'migrations', released: false }),
        ]),
      },
    });
  });

  it('report a missing database as a no-op', async () => {
    const { root, bind } = fixture({ configured: false });
    const run = await runAppCommand(bind(AppDbApply), ['--json'], root);
    expect(run.json()).toMatchObject({
      ok: true,
      status: 'success-noop',
      result: { state: 'not-configured', results: [] },
    });
  });
});

describe('the collections commands', () => {
  it('check the artifacts, generate them, and find them up to date', async () => {
    const { root, bind, migration } = fixture();
    migration('main');
    await runAppCommand(bind(AppDbApply), ['--json', '--no-collections'], root);

    const stale = await runAppCommand(
      bind(AppCollectionsGenerate),
      ['--json', '--check'],
      root,
    );
    expect(stale.exitCode).toBe(1);
    expect(stale.json()).toMatchObject({
      ok: false,
      error: {
        code: 'COLLECTIONS_STALE',
        message: 'The Collection artifacts of "main" differ from the database.',
        suggestions: [
          {
            message: 'Run without --check to write them:',
            run: {
              command: 'pnpm',
              args: ['nocobase', 'collections', 'generate'],
            },
          },
        ],
        details: {
          connections: ['main'],
          check: true,
          results: [
            expect.objectContaining({
              connection: 'main',
              status: 'stale',
              directoryExists: false,
            }),
          ],
        },
      },
    });

    const generated = await runAppCommand(
      bind(AppCollectionsGenerate),
      ['--json'],
      root,
    );
    expect(generated.json()).toMatchObject({
      ok: true,
      status: 'success',
      result: {
        check: false,
        results: [
          expect.objectContaining({
            connection: 'main',
            status: 'completed',
            written: expect.arrayContaining(['rows/schema.json']),
          }),
        ],
      },
    });

    const checked = await runAppCommand(
      bind(AppCollectionsGenerate),
      ['--check'],
      root,
    );
    expect(checked.error).toBeUndefined();
    expect(checked.stdout).toContain('  Up to date.');
  });

  it('report orphaned metadata until --fix deletes it', async () => {
    const { root, bind, migration, dropTable } = fixture();
    migration('main');
    await runAppCommand(bind(AppDbApply), ['--json', '--no-collections'], root);

    const healthy = await runAppCommand(
      bind(CollectionsDoctor),
      ['--json'],
      root,
    );
    expect(healthy.json()).toMatchObject({
      ok: true,
      status: 'success',
      result: {
        fix: false,
        results: [expect.objectContaining({ connection: 'main', issues: [] })],
      },
    });

    await dropTable('main', 'rows');
    const broken = await runAppCommand(
      bind(CollectionsDoctor),
      ['--json', '--connection', 'main'],
      root,
    );
    expect(broken.exitCode).toBe(1);
    expect(broken.json()).toMatchObject({
      ok: false,
      error: {
        code: 'COLLECTION_ISSUES_REMAIN',
        message: '1 Collection metadata record disagrees with the schema.',
        suggestions: [
          {
            message: 'Delete the records whose table is gone:',
            run: {
              command: 'pnpm',
              args: [
                'nocobase',
                'collections',
                'doctor',
                '--fix',
                '--connection',
                'main',
              ],
            },
          },
        ],
        details: {
          fix: false,
          results: [
            expect.objectContaining({
              connection: 'main',
              issues: [
                expect.objectContaining({
                  name: 'rows',
                  code: 'COLLECTION_TABLE_MISSING',
                  orphaned: true,
                }),
              ],
            }),
          ],
        },
      },
    });

    const fixed = await runAppCommand(bind(CollectionsDoctor), ['--fix'], root);
    expect(fixed.error).toBeUndefined();
    expect(fixed.stdout).toContain('Deleted: rows');
    expect(fixed.stdout).toContain('No issue remains.');
  });

  it('report a load failure with a stable code', async () => {
    const { root, bind } = fixture();
    const run = await runAppCommand(
      bind(CollectionsDoctor),
      ['--json', '--connection', 'unknown'],
      root,
    );
    expect(run.exitCode).toBe(1);
    expect(run.json()).toMatchObject({
      ok: false,
      error: {
        code: 'DATABASE_COMMAND_FAILED',
        message: 'Unknown database connection "unknown".',
        details: { connection: 'unknown' },
      },
    });
  });

  it('report a missing database as a no-op', async () => {
    const { root, bind } = fixture({ configured: false });
    for (const command of [CollectionsDoctor, AppCollectionsGenerate]) {
      const run = await runAppCommand(bind(command), ['--json'], root);
      expect(run.json()).toMatchObject({
        ok: true,
        status: 'success-noop',
        result: { state: 'not-configured', results: [] },
      });
    }
  });
});

describe('confirming a destructive run at a terminal', () => {
  const restore: (() => void)[] = [];
  afterEach(() => {
    for (const undo of restore.splice(0).reverse()) undo();
  });

  /** Puts the command at a terminal where the person types `answer`. */
  function terminal(answer: string): void {
    vi.stubEnv('CI', '');
    const input = Object.assign(new PassThrough(), { isTTY: true });
    input.write(`${answer}\n`);
    const stdin = Object.getOwnPropertyDescriptor(process, 'stdin');
    Object.defineProperty(process, 'stdin', {
      value: input,
      configurable: true,
    });
    restore.push(() => {
      if (stdin) Object.defineProperty(process, 'stdin', stdin);
    });
    const tty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
    restore.push(() => {
      if (tty) Object.defineProperty(process.stdout, 'isTTY', tty);
      else Reflect.deleteProperty(process.stdout, 'isTTY');
    });
  }

  it('asks on stderr under --json, so stdout stays the one document', async () => {
    const { root, bind, migration } = fixture();
    migration('main');
    await runAppCommand(bind(AppDbApply), ['--json', '--no-collections'], root);

    terminal('yes');
    const run = await runAppCommand(
      bind(AppDbRollback),
      ['--json', '--no-collections'],
      root,
    );
    expect(run.json()).toMatchObject({
      ok: true,
      result: {
        results: [expect.objectContaining({ rolledBack: ['001_create'] })],
      },
    });
    expect(run.stderr).toContain(
      'WARNING: this runs down() for every migration in main: batch 1:',
    );
    expect(run.stderr).toContain('  [main] test-app: 001_create');
    expect(run.stderr).toContain('Type "yes" to continue: ');
  });

  it('reports a declined confirmation as cancelled', async () => {
    const { root, bind, migration } = fixture();
    migration('main');
    await runAppCommand(bind(AppDbApply), ['--json', '--no-collections'], root);

    terminal('no');
    const rollback = await runAppCommand(
      bind(AppDbRollback),
      ['--json', '--no-collections'],
      root,
    );
    expect(rollback.exitCode).toBe(1);
    expect(rollback.json()).toMatchObject({
      ok: false,
      error: { code: 'CANCELLED', message: 'Rollback cancelled.' },
    });

    terminal('no');
    const reset = await runAppCommand(
      bind(AppDbReset),
      ['--json', '--no-collections'],
      root,
    );
    expect(reset.exitCode).toBe(1);
    expect(reset.json()).toMatchObject({
      ok: false,
      error: { code: 'CANCELLED', message: 'Fresh migration cancelled.' },
    });
    expect(reset.stderr).toContain(
      'WARNING: this will delete all managed schema objects for: main.',
    );
  });
});

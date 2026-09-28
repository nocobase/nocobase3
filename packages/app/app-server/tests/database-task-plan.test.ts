import type { ConnectionConfigFromDrivers } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import type { Knex } from 'knex';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAppPaths } from '../src/config/index.js';
import {
  createAppDatabaseManager,
  runAppDatabaseTasks,
  type AppDatabaseConfig as GenericAppDatabaseConfig,
  type AppDatabaseTaskContributions,
} from '../src/database/index.js';

const drivers = { sqlite };
type AppDatabaseConfig = GenericAppDatabaseConfig<
  ConnectionConfigFromDrivers<typeof drivers>
>;

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'task-plan-'));
  roots.push(root);
  const paths = createAppPaths({ rootDir: root });
  const config: AppDatabaseConfig = {
    drivers,
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: paths.storage('main/data.sqlite') },
      erp: {
        dialect: 'sqlite',
        filename: paths.storage('erp/data.sqlite'),
        schemaManagement: 'external',
      },
    },
  };
  const contributions: AppDatabaseTaskContributions = {
    appPackageName: 'test-app',
    migrations: [],
    seeds: [],
  };
  const both = ['migrations', 'seeds'] as const;
  function migration(name: string, table: string) {
    const directory = paths.database('main/migrations');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, `${name}.ts`),
      `import { defineMigration } from '@nocobase/db';
export default defineMigration({ name: '${name}', async up({ builder }) {
await builder.createCollection('${table}', c => { c.increments('id'); c.string('value'); });
}, async down({ builder }) { await builder.dropCollection('${table}'); } });`,
    );
  }
  function seed(name: string, table: string) {
    const directory = paths.database('main/seeds');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, `${name}.ts`),
      `import { defineSeed } from '@nocobase/db';
export default defineSeed({ name: '${name}', async run({ query }) {
await query.insertInto('${table}').values({ value: 'seeded' }).execute();
} });`,
    );
  }
  async function inspect<T>(check: (client: Knex) => Promise<T>): Promise<T> {
    const database = createAppDatabaseManager(config)!;
    try {
      return await check(await database.connection('main').client<Knex>());
    } finally {
      await database.destroy();
    }
  }
  return { paths, config, contributions, both, migration, seed, inspect };
}

describe('a dry run of the database tasks', () => {
  it('lists what a run would execute per connection and kind, and runs none of it', async () => {
    const { paths, config, contributions, both, migration, seed, inspect } =
      fixture();
    migration('001_rows', 'rows');
    seed('001_defaults', 'rows');

    const plan = await runAppDatabaseTasks(config, {
      paths,
      contributions,
      kind: both,
      all: true,
      dryRun: true,
    });
    expect(plan).toEqual({
      ok: true,
      status: 'completed',
      results: [
        {
          connection: 'main',
          kind: 'migrations',
          status: 'completed',
          pending: ['001_rows'],
          skipped: [],
          dryRun: true,
        },
        {
          connection: 'main',
          kind: 'seeds',
          status: 'completed',
          pending: ['001_defaults'],
          skipped: [],
          dryRun: true,
        },
        {
          connection: 'erp',
          kind: 'migrations',
          status: 'skipped',
          reason: 'external',
        },
        {
          connection: 'erp',
          kind: 'seeds',
          status: 'skipped',
          reason: 'external',
        },
      ],
    });
    // The database did not exist, and a dry run does not create it: it answers for an empty one without connecting.
    const file = paths.storage('main/data.sqlite');
    expect(existsSync(file)).toBe(false);
    expect(existsSync(path.dirname(file))).toBe(false);

    // An existing database is read, and nothing is recorded: not even the history tables appear.
    mkdirSync(path.dirname(file), { recursive: true });
    await inspect(async (client) => client.raw('select 1'));
    expect(
      await runAppDatabaseTasks(config, {
        paths,
        contributions,
        kind: both,
        all: true,
        dryRun: true,
      }),
    ).toEqual(plan);
    expect(
      await inspect(async (client) => [
        await client.schema.hasTable('rows'),
        await client.schema.hasTable('__nocobase_migrations'),
        await client.schema.hasTable('__nocobase_seeds'),
      ]),
    ).toEqual([false, false, false]);

    const applied = await runAppDatabaseTasks(config, {
      paths,
      contributions,
      kind: both,
    });
    expect(applied.results.map((entry) => entry.executed)).toEqual([
      ['001_rows'],
      ['001_defaults'],
    ]);

    // Once applied, the same plan has nothing pending, and names what it skips.
    migration('002_more', 'more');
    const again = await runAppDatabaseTasks(config, {
      paths,
      contributions,
      kind: both,
      dryRun: true,
    });
    expect(
      again.results.map((entry) => [entry.kind, entry.pending, entry.skipped]),
    ).toEqual([
      ['migrations', ['002_more'], ['001_rows']],
      ['seeds', [], ['001_defaults']],
    ]);
  });

  it('reports a missing task directory the way a run skips it', async () => {
    const { paths, config, contributions, both, migration } = fixture();
    migration('001_rows', 'rows');
    const plan = await runAppDatabaseTasks(config, {
      paths,
      contributions,
      kind: both,
      dryRun: true,
    });
    expect(plan.results[1]).toEqual({
      connection: 'main',
      kind: 'seeds',
      status: 'skipped',
      reason: 'missing-directory',
    });
  });

  it('plans a fresh run as everything pending, without confirming or dropping anything', async () => {
    const { paths, config, contributions, both, migration, seed, inspect } =
      fixture();
    migration('001_rows', 'rows');
    seed('001_defaults', 'rows');
    await runAppDatabaseTasks(config, { paths, contributions, kind: both });

    let asked = false;
    const plan = await runAppDatabaseTasks(config, {
      paths,
      contributions,
      kind: both,
      fresh: true,
      dryRun: true,
      confirmFresh: async () => {
        asked = true;
        return false;
      },
    });
    expect(asked).toBe(false);
    expect(plan.results).toEqual([
      {
        connection: 'main',
        kind: 'migrations',
        status: 'completed',
        pending: ['001_rows'],
        skipped: [],
        dryRun: true,
        fresh: true,
      },
      {
        connection: 'main',
        kind: 'seeds',
        status: 'completed',
        pending: ['001_defaults'],
        skipped: [],
        dryRun: true,
        fresh: true,
      },
    ]);
    expect(
      await inspect(async (client) => client('rows').select('value')),
    ).toEqual([{ value: 'seeded' }]);
  });

  it('plans a fresh reset of a connection with no migrations to apply afterwards', async () => {
    const { paths, config, contributions } = fixture();
    const plan = await runAppDatabaseTasks(config, {
      paths,
      contributions,
      kind: ['migrations', 'seeds'],
      fresh: true,
      dryRun: true,
    });
    expect(plan.results[0]).toMatchObject({
      kind: 'migrations',
      status: 'completed',
      pending: [],
      fresh: true,
    });
  });

  it('reads history without waiting for a run that holds the lock', async () => {
    const { paths, config, contributions, both, migration, inspect } =
      fixture();
    migration('001_rows', 'rows');
    await runAppDatabaseTasks(config, { paths, contributions, kind: both });
    migration('002_more', 'more');
    await inspect(async (client) => {
      const now = new Date();
      await client('__nocobase_migration_lock').insert({
        id: 1,
        locked_by: 'live-run',
        locked_at: now,
        heartbeat_at: now,
      });
    });

    // A run would wait out the acquire timeout; the plan does not queue for it.
    const startedAt = Date.now();
    const plan = await runAppDatabaseTasks(config, {
      paths,
      contributions,
      kind: 'migrations',
      dryRun: true,
    });
    expect(Date.now() - startedAt).toBeLessThan(10_000);
    expect(plan.results[0]).toMatchObject({ pending: ['002_more'] });
  });

  it('refuses a dry run of unlock', async () => {
    const { paths, config, contributions } = fixture();
    await expect(
      runAppDatabaseTasks(config, {
        paths,
        contributions,
        kind: 'migrations',
        operation: 'unlock',
        dryRun: true,
      }),
    ).rejects.toThrow('An unlock has no dry run');
  });
});

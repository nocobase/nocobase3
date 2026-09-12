import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';
import ts from 'typescript';
import { objectProvider } from '@nocobase/config/providers/object';
import { AppConfig, createConfigPaths } from '../src/config/index.js';
import {
  createAppDatabaseManager,
  type AppDatabaseConfig,
  planAppDatabaseTasks,
  runAppDatabaseTasks,
} from '../src/database/index.js';
import { executeAppDatabasePlan } from '../src/database/tasks.js';
import { createAppPluginDatabaseConfig } from '../src/plugins/resolve.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'connections-'));
  roots.push(root);
  const paths = createConfigPaths({ rootDir: root });
  const config: AppDatabaseConfig = {
    default: 'main',
    connections: {
      analytics: {
        dialect: 'sqlite',
        filename: paths.storage('analytics/data.sqlite'),
        migrations: { autoRun: false },
        seeds: { autoRun: false },
      },
      main: { dialect: 'sqlite', filename: paths.storage('main/data.sqlite') },
    },
    taskSources: {
      directory: paths.database(),
      packageName: 'test-app',
      migrations: [],
      seeds: [],
    },
  };
  return { root, paths, config };
}

function migration(
  directory: string,
  name: string,
  table: string,
  fail = false,
) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, `${name}.ts`),
    `import { defineMigration } from '@nocobase/db';
export default defineMigration({ name: '${name}', async up({ builder }) {
${fail ? "throw new Error('intentional failure');" : `await builder.createCollection('${table}', c => { c.increments('id'); c.string('value'); });`}
}, async down({ builder }) { await builder.dropCollection('${table}'); } });`,
  );
}

function seed(directory: string, table: string) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, '002_seed.ts'),
    `import { defineSeed } from '@nocobase/db';
export default defineSeed({ name: '002_seed', async run({ query }) {
await query.insertInto('${table}').values({ value: 'initial' }).execute();
} });`,
  );
}

async function inspect(
  config: AppDatabaseConfig,
  name: string,
  check: (client: Knex) => Promise<void>,
) {
  const database = createAppDatabaseManager(config)!;
  try {
    await check(await database.connection(name).client<Knex>());
  } finally {
    await database.destroy();
  }
}

describe('connection-bound application database tasks', () => {
  it('isolates migrations, seeds and histories and runs plugins only on the default connection', async () => {
    const { config, paths, root } = fixture();
    migration(paths.database('main/migrations'), '001_main', 'mainRows');
    migration(
      paths.database('analytics/migrations'),
      '001_analytics',
      'analyticsRows',
    );
    seed(paths.database('main/seeds'), 'mainRows');
    seed(paths.database('analytics/seeds'), 'analyticsRows');
    const pluginDirectory = path.join(root, 'plugin/migrations');
    migration(pluginDirectory, '000_plugin', 'systemRows');
    const resolved = createAppPluginDatabaseConfig(config, {
      appPackageName: 'test-app',
      plugins: [
        {
          metadata: {
            packageName: 'test-plugin',
            migrationsDirectory: pluginDirectory,
          },
        },
      ],
    } as Parameters<typeof createAppPluginDatabaseConfig>[1]).database;
    const result = await runAppDatabaseTasks(resolved, paths, {
      kind: 'migrations',
      all: true,
    });
    expect(result.results.map((r) => r.connection)).toEqual([
      'main',
      'analytics',
    ]);
    expect(result.results[0].executed).toEqual(['000_plugin', '001_main']);
    expect(result.results[1].executed).toEqual(['001_analytics']);
    await runAppDatabaseTasks(resolved, paths, { kind: 'seeds', all: true });
    await inspect(config, 'analytics', async (client) => {
      expect(await client.schema.hasTable('system_rows')).toBe(false);
      expect(await client.schema.hasTable('main_rows')).toBe(false);
      expect(await client('analytics_rows').select('value')).toEqual([
        { value: 'initial' },
      ]);
    });
    const again = await runAppDatabaseTasks(resolved, paths, {
      kind: 'migrations',
      all: true,
    });
    expect(again.results.map((r) => r.executed)).toEqual([[], []]);
    const seeds = await runAppDatabaseTasks(resolved, paths, {
      kind: 'seeds',
      all: true,
    });
    expect(seeds.results.map((r) => r.executed)).toEqual([[], []]);
  });

  it('manual selection ignores autoRun and never creates the unselected database', async () => {
    const { config, paths } = fixture();
    migration(
      paths.database('analytics/migrations'),
      '001_analytics',
      'analyticsRows',
    );
    await runAppDatabaseTasks(config, paths, {
      kind: 'migrations',
      connection: 'analytics',
    });
    expect(existsSync(paths.storage('main/data.sqlite'))).toBe(false);
    expect(existsSync(paths.storage('analytics/data.sqlite'))).toBe(true);
  });

  it('keeps startup order, skips disabled tasks and migrates before seeding each connection', async () => {
    const { config, paths } = fixture();
    migration(paths.database('main/migrations'), '001_main', 'mainRows');
    seed(paths.database('main/seeds'), 'mainRows');
    const database = createAppDatabaseManager(config)!;
    try {
      const plan = planAppDatabaseTasks(
        config,
        paths,
        ['migrations', 'seeds'],
        { autoRun: true },
      );
      const result = await executeAppDatabasePlan(
        database,
        config,
        paths,
        plan,
      );
      expect(
        result.results.map((r) => [r.connection, r.kind, r.status]),
      ).toEqual([
        ['main', 'migrations', 'completed'],
        ['main', 'seeds', 'completed'],
        ['analytics', 'migrations', 'skipped'],
        ['analytics', 'seeds', 'skipped'],
      ]);
      expect(existsSync(paths.storage('analytics/data.sqlite'))).toBe(false);
    } finally {
      await database.destroy();
    }
  });

  it('reports committed, failed and unattempted connections and stops on failure', async () => {
    const { config, paths } = fixture();
    config.connections.zlast = {
      dialect: 'sqlite',
      filename: paths.storage('last/data.sqlite'),
    };
    migration(paths.database('main/migrations'), '001_main', 'mainRows');
    migration(
      paths.database('analytics/migrations'),
      '001_fail',
      'badRows',
      true,
    );
    migration(paths.database('zlast/migrations'), '001_last', 'lastRows');
    await expect(
      runAppDatabaseTasks(config, paths, { kind: 'migrations', all: true }),
    ).rejects.toMatchObject({
      result: {
        ok: false,
        results: [
          { connection: 'main', status: 'completed' },
          { connection: 'analytics', status: 'failed' },
          { connection: 'zlast', status: 'not-run' },
        ],
      },
    });
    expect(existsSync(paths.storage('last/data.sqlite'))).toBe(false);
    await inspect(config, 'main', async (client) => {
      expect(await client.schema.hasTable('main_rows')).toBe(true);
    });
  });

  it('skips external databases without opening them and rejects explicit execution', async () => {
    const { config, paths } = fixture();
    config.connections.erp = {
      dialect: 'sqlite',
      filename: paths.storage('erp.sqlite'),
      schemaManagement: 'external',
    };
    const result = await runAppDatabaseTasks(config, paths, {
      kind: 'seeds',
      all: true,
    });
    expect(result.results.find((r) => r.connection === 'erp')).toMatchObject({
      status: 'skipped',
      reason: 'external',
    });
    expect(existsSync(paths.storage('erp.sqlite'))).toBe(false);
    await expect(
      runAppDatabaseTasks(config, paths, { kind: 'seeds', connection: 'erp' }),
    ).rejects.toThrow('external');
    await expect(
      runAppDatabaseTasks(config, paths, {
        kind: 'migrations',
        connection: 'erp',
      }),
    ).rejects.toThrow('external');
  });

  it('preserves migration and seed history after moving legacy directories for a custom default', async () => {
    const { config, paths } = fixture();
    config.default = 'analytics';
    migration(paths.database('migrations'), '001_legacy', 'legacyRows');
    seed(paths.database('seeds'), 'legacyRows');
    await runAppDatabaseTasks(config, paths, { kind: 'migrations' });
    await runAppDatabaseTasks(config, paths, { kind: 'seeds' });
    mkdirSync(paths.database('analytics'), { recursive: true });
    renameSync(
      paths.database('migrations'),
      paths.database('analytics/migrations'),
    );
    renameSync(paths.database('seeds'), paths.database('analytics/seeds'));
    for (const kind of ['migrations', 'seeds'] as const) {
      expect(
        (await runAppDatabaseTasks(config, paths, { kind })).results[0]
          .executed,
      ).toEqual([]);
    }
    await inspect(config, 'analytics', async (client) => {
      expect(await client('legacy_rows').select('value')).toHaveLength(1);
    });
  });

  it('preflights conflicts, missing explicit sources and unknown connections before writing', async () => {
    const { config, paths } = fixture();
    migration(paths.database('main/migrations'), '001_main', 'mainRows');
    mkdirSync(paths.database('migrations'), { recursive: true });
    await expect(
      runAppDatabaseTasks(config, paths, { kind: 'migrations' }),
    ).rejects.toThrow('Both legacy');
    rmSync(paths.database('migrations'), { recursive: true });
    config.connections.analytics.migrations = { directory: 'missing' };
    await expect(
      runAppDatabaseTasks(config, paths, { kind: 'migrations', all: true }),
    ).rejects.toThrow('Explicit');
    expect(existsSync(paths.storage('main/data.sqlite'))).toBe(false);
    await expect(
      runAppDatabaseTasks(config, paths, {
        kind: 'migrations',
        connection: 'typo',
      }),
    ).rejects.toThrow('Unknown');
    await expect(
      runAppDatabaseTasks(config, paths, {
        kind: 'migrations',
        connection: 'main',
        all: true,
      }),
    ).rejects.toThrow('mutually exclusive');
  });

  it('rejects two managed aliases of the same target before creating storage', async () => {
    const { config, paths } = fixture();
    config.connections.analytics.filename = config.connections.main.filename;
    await expect(
      runAppDatabaseTasks(config, paths, { kind: 'migrations', all: true }),
    ).rejects.toThrow('same database and schema');
    expect(existsSync(paths.storage('main/data.sqlite'))).toBe(false);
  });

  it('normalizes every SQLite path consistently, including database aliases and memory databases', async () => {
    const { config, paths } = fixture();
    config.connections.analytics = {
      dialect: 'sqlite',
      filename: 'unused.sqlite',
      database: 'nested/analytics.sqlite',
    } as AppDatabaseConfig['connections'][string];
    config.connections.main = {
      dialect: 'sqlite',
      filename: ':memory:',
      database: ':memory:',
    } as AppDatabaseConfig['connections'][string];
    migration(
      paths.database('analytics/migrations'),
      '001_analytics',
      'analyticsRows',
    );
    await runAppDatabaseTasks(config, paths, {
      kind: 'migrations',
      connection: 'analytics',
    });
    expect(existsSync(paths.storage('nested/analytics.sqlite'))).toBe(true);
    expect(existsSync(paths.storage(':memory:'))).toBe(false);
  });

  it('loads compiled per-connection sources from the runtime database directory', async () => {
    const { config, paths, root } = fixture();
    const source = paths.database('analytics/migrations');
    migration(source, '001_compiled', 'compiledRows');
    seed(paths.database('analytics/seeds'), 'compiledRows');
    const compiledPaths = createConfigPaths({
      rootDir: root,
      databaseDir: path.join(root, 'dist/database'),
    });
    for (const [kind, name] of [
      ['migrations', '001_compiled'],
      ['seeds', '002_seed'],
    ]) {
      const directory = compiledPaths.database(`analytics/${kind}`);
      mkdirSync(directory, { recursive: true });
      const input = readFileSync(
        paths.database(`analytics/${kind}/${name}.ts`),
        'utf8',
      );
      writeFileSync(
        path.join(directory, `${name}.js`),
        ts.transpileModule(input, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
      );
    }
    for (const kind of ['migrations', 'seeds'] as const) {
      const result = await runAppDatabaseTasks(config, compiledPaths, {
        kind,
        connection: 'analytics',
      });
      expect(result.results[0].executed).toHaveLength(1);
      expect(
        (
          await runAppDatabaseTasks(config, compiledPaths, {
            kind,
            connection: 'analytics',
          })
        ).results[0].executed,
      ).toEqual([]);
    }
    await inspect(config, 'analytics', async (client) => {
      expect(await client('compiled_rows').select('value')).toEqual([
        { value: 'initial' },
      ]);
    });
  });

  it('maps old environment task settings to a custom default without contaminating other connections', async () => {
    const { paths } = fixture();
    const config = new AppConfig();
    config.load(
      objectProvider({
        database: {
          default: 'analytics',
          connections: {
            analytics: {
              dialect: 'sqlite',
              filename: ':memory:',
              migrations: { autoRun: true },
            },
          },
        },
      }),
    );
    config.load(
      objectProvider({
        database: {
          migrations: { autoRun: false, tableName: 'legacy_history' },
          connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
        },
      }),
    );
    await config.loadAll();
    const plan = planAppDatabaseTasks(
      config.get<AppDatabaseConfig>('database')!,
      paths,
      ['migrations'],
      { all: true },
    );
    expect(plan[0]).toMatchObject({
      connection: 'analytics',
      config: { autoRun: false, tableName: 'legacy_history' },
    });
    expect(plan[1].config.tableName).toBeUndefined();
    expect(plan[1].config.autoRun).toBe(false);
  });
});

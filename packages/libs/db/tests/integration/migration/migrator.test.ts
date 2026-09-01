import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMigrator, loadMigrations } from '../../../src/index.js';
import { describeIntegrationDatabases } from '../helpers.js';

const tempRoot = join(process.cwd(), 'tests/.tmp');
const tempDirectories: string[] = [];

describeIntegrationDatabases('migration runner', (context) => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('runs pending migrations once and records history', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('migrationHistory');
    const lockTableName = context.table('migrationLock');
    await writeMigration(
      directory,
      '202608180001_create_migration_users',
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_create_migration_users',

        async up({ builder }) {
          await builder.createCollection('migrationUsers', (collection) => {
            collection.increments('id');
            collection.string('name');
          });
        },

        async down({ builder }) {
          await builder.dropCollection('migrationUsers');
        },
      });
    `,
    );

    const migrator = createMigrator({
      database: context.database,
      connection: context.spec.name,
      directory,
      packageName: '@nocobase/plugin-users',
      tableName,
      lockTableName,
    });

    await expect(migrator.latest()).resolves.toMatchObject({
      batch: 1,
      executed: ['202608180001_create_migration_users'],
      skipped: [],
    });
    expect(
      await context.db.schema.hasTable(context.table('migrationUsers')),
    ).toBe(true);

    await expect(migrator.latest()).resolves.toMatchObject({
      batch: 1,
      executed: [],
      skipped: ['202608180001_create_migration_users'],
    });

    const history = await context
      .db(tableName)
      .select(['package_name', 'name', 'batch']);
    expect(history).toEqual([
      {
        package_name: '@nocobase/plugin-users',
        name: '202608180001_create_migration_users',
        batch: 1,
      },
    ]);
  });

  it('upgrades legacy history tables and preserves applied migrations', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('legacyMigrationHistory');
    const lockTableName = context.table('legacyMigrationLock');
    const migrationName = '202608180001_legacy_history';
    await writeMigration(
      directory,
      migrationName,
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '${migrationName}',
        async up() { throw new Error('already applied migration ran again'); },
        async down() {},
      });
    `,
    );
    const [loaded] = await loadMigrations({ directory });
    await context.db.schema.createTable(tableName, (table) => {
      table.increments('id').primary();
      table.string('name', 191).notNullable().unique();
      table.integer('batch').notNullable();
      table.string('checksum', 128).notNullable();
      table.dateTime('executed_at').notNullable();
      table.integer('duration_ms').nullable();
    });
    await context.db(tableName).insert({
      name: loaded.name,
      batch: 1,
      checksum: loaded.checksum,
      executed_at: new Date(),
      duration_ms: 1,
    });

    const migrator = createMigrator({
      database: context.database,
      connection: context.spec.name,
      sources: [{ packageName: '@nocobase/plugin-legacy', directory }],
      tableName,
      lockTableName,
    });

    await expect(migrator.latest()).resolves.toEqual({
      batch: 1,
      executed: [],
      skipped: [migrationName],
    });
    await expect(
      context.db(tableName).select(['package_name', 'name']),
    ).resolves.toEqual([{ package_name: 'app', name: migrationName }]);
  });

  it('runs and rolls back a global batch across package sources', async () => {
    const firstDirectory = await createTempDirectory();
    const secondDirectory = await createTempDirectory();
    const tableName = context.table('packageMigrationHistory');
    const lockTableName = context.table('packageMigrationLock');
    const dataTableName = context.table('packageMigrationEvents');
    await context.db.schema.createTable(dataTableName, (table) => {
      table.increments('id').primary();
      table.string('event').notNullable();
    });
    await writeEventMigration(
      firstDirectory,
      '202608180002_package_alpha',
      dataTableName,
    );
    await writeEventMigration(
      secondDirectory,
      '202608180001_package_beta',
      dataTableName,
    );

    const migrator = createMigrator({
      database: context.database,
      connection: context.spec.name,
      sources: [
        { packageName: '@nocobase/plugin-alpha', directory: firstDirectory },
        { packageName: '@nocobase/plugin-beta', directory: secondDirectory },
      ],
      tableName,
      lockTableName,
    });

    await expect(migrator.latest()).resolves.toMatchObject({
      executed: ['202608180001_package_beta', '202608180002_package_alpha'],
    });
    await expect(
      context.db(tableName).select(['package_name', 'name']).orderBy('id'),
    ).resolves.toEqual([
      {
        package_name: '@nocobase/plugin-beta',
        name: '202608180001_package_beta',
      },
      {
        package_name: '@nocobase/plugin-alpha',
        name: '202608180002_package_alpha',
      },
    ]);

    await expect(migrator.rollback()).resolves.toEqual({
      batch: 1,
      rolledBack: ['202608180002_package_alpha', '202608180001_package_beta'],
    });
    await expect(
      context.db(dataTableName).select('event').orderBy('id'),
    ).resolves.toEqual([
      { event: 'up:202608180001_package_beta' },
      { event: 'up:202608180002_package_alpha' },
      { event: 'down:202608180002_package_alpha' },
      { event: 'down:202608180001_package_beta' },
    ]);
  });

  it('keeps history for packages that no longer participate', async () => {
    const pluginDirectory = await createTempDirectory();
    const appDirectory = await createTempDirectory();
    const tableName = context.table('disabledPackageHistory');
    const lockTableName = context.table('disabledPackageLock');
    const migrationName = '202608180001_disabled_package';
    await writeMigration(
      pluginDirectory,
      migrationName,
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '${migrationName}',
        async up() {},
        async down() {},
      });
    `,
    );

    const installer = createMigrator({
      database: context.database,
      connection: context.spec.name,
      sources: [
        {
          packageName: '@nocobase/app-plugin-disabled',
          directory: pluginDirectory,
        },
      ],
      tableName,
      lockTableName,
    });
    await installer.latest();

    const appMigrator = createMigrator({
      database: context.database,
      connection: context.spec.name,
      sources: [
        {
          packageName: '@nocobase/app-template-default',
          directory: appDirectory,
        },
      ],
      tableName,
      lockTableName,
    });

    await expect(appMigrator.latest()).resolves.toEqual({
      batch: 1,
      executed: [],
      skipped: [],
    });
    await expect(
      context.db(tableName).select(['package_name', 'name']),
    ).resolves.toEqual([
      {
        package_name: '@nocobase/app-plugin-disabled',
        name: migrationName,
      },
    ]);
  });

  it('rolls back the latest batch in reverse order', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('rollbackHistory');
    const lockTableName = context.table('rollbackLock');
    await writeMigration(
      directory,
      '202608180001_create_rollback_users',
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_create_rollback_users',

        async up({ builder }) {
          await builder.createCollection('rollbackUsers', (collection) => {
            collection.increments('id');
            collection.string('name');
          });
        },

        async down({ builder }) {
          await builder.dropCollection('rollbackUsers');
        },
      });
    `,
    );

    const migrator = createMigrator({
      database: context.database,
      connection: context.spec.name,
      directory,
      tableName,
      lockTableName,
    });

    await migrator.latest();
    expect(
      await context.db.schema.hasTable(context.table('rollbackUsers')),
    ).toBe(true);

    await expect(migrator.rollback()).resolves.toEqual({
      batch: 1,
      rolledBack: ['202608180001_create_rollback_users'],
    });
    expect(
      await context.db.schema.hasTable(context.table('rollbackUsers')),
    ).toBe(false);
    await expect(context.db(tableName).select()).resolves.toEqual([]);
  });

  it('keeps query changes and history writes in the same transaction', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('failedHistory');
    const lockTableName = context.table('failedLock');
    await context.builder.createCollection('migrationRows', (collection) => {
      collection.increments('id');
      collection.string('status');
    });
    await writeMigration(
      directory,
      '202608180001_failing_data_migration',
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_failing_data_migration',

        async up({ query }) {
          await query
            .insertInto('migrationRows')
            .values({ status: 'created' })
            .execute();
          throw new Error('migration failed on purpose');
        },

        async down({ query }) {
          await query
            .deleteFrom('migrationRows')
            .where('status', '=', 'created')
            .execute();
        },
      });
    `,
    );

    const migrator = createMigrator({
      database: context.database,
      connection: context.spec.name,
      directory,
      tableName,
      lockTableName,
    });

    await expect(migrator.latest()).rejects.toThrow(
      'migration failed on purpose',
    );
    await expect(
      context.database
        .query()
        .selectFrom('migrationRows')
        .select('status')
        .execute(),
    ).resolves.toEqual([]);
    await expect(context.db(tableName).select()).resolves.toEqual([]);
  });

  it('rejects checksum changes for already executed migrations', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('checksumHistory');
    const lockTableName = context.table('checksumLock');
    const migrationName = '202608180001_checksum_guard';
    await writeMigration(
      directory,
      migrationName,
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_checksum_guard',
        async up() {},
        async down() {},
      });
    `,
    );

    const migrator = createMigrator({
      database: context.database,
      connection: context.spec.name,
      directory,
      tableName,
      lockTableName,
    });

    await migrator.latest();
    await writeMigration(
      directory,
      migrationName,
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_checksum_guard',
        async up() {
          // changed after execution
        },
        async down() {},
      });
    `,
    );

    await expect(migrator.latest()).rejects.toThrow(
      'Executed migration "202608180001_checksum_guard" checksum changed.',
    );
  });
});

async function createTempDirectory(): Promise<string> {
  await mkdir(tempRoot, { recursive: true });
  const directory = await mkdtemp(join(tempRoot, 'migrations-'));
  tempDirectories.push(directory);
  return directory;
}

async function writeMigration(
  directory: string,
  name: string,
  source: string,
): Promise<void> {
  await writeFile(join(directory, `${name}.ts`), trimSource(source));
}

function trimSource(source: string): string {
  return `${source.trim().replace(/^ {6}/gm, '')}\n`;
}

async function writeEventMigration(
  directory: string,
  name: string,
  tableName: string,
): Promise<void> {
  await writeMigration(
    directory,
    name,
    `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '${name}',
        transaction: false,
        async up({ connection }) {
          const knex = await connection.client();
          await knex('${tableName}').insert({ event: 'up:${name}' });
        },
        async down({ connection }) {
          const knex = await connection.client();
          await knex('${tableName}').insert({ event: 'down:${name}' });
        },
      });
    `,
  );
}

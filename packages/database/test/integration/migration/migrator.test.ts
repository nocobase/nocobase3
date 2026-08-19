import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMigrator } from '../../../src/index.js';
import { describeIntegrationDatabases } from '../helpers.js';

const tempRoot = join(process.cwd(), 'test/.tmp');
const tempDirectories: string[] = [];

describeIntegrationDatabases('migration runner', (context) => {
  afterEach(async () => {
    await Promise.all(tempDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ));
  });

  it('runs pending migrations once and records history', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('migrationHistory');
    const lockTableName = context.table('migrationLock');
    await writeMigration(directory, '202608180001_create_migration_users', `
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
    `);

    const migrator = createMigrator({
      database: context.database,
      connection: context.spec.name,
      directory,
      tableName,
      lockTableName,
    });

    await expect(migrator.latest()).resolves.toMatchObject({
      batch: 1,
      executed: ['202608180001_create_migration_users'],
      skipped: [],
    });
    expect(await context.db.schema.hasTable(context.table('migrationUsers'))).toBe(true);

    await expect(migrator.latest()).resolves.toMatchObject({
      batch: 1,
      executed: [],
      skipped: ['202608180001_create_migration_users'],
    });

    const history = await context.db(tableName).select(['name', 'batch']);
    expect(history).toEqual([
      {
        name: '202608180001_create_migration_users',
        batch: 1,
      },
    ]);
  });

  it('rolls back the latest batch in reverse order', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('rollbackHistory');
    const lockTableName = context.table('rollbackLock');
    await writeMigration(directory, '202608180001_create_rollback_users', `
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
    `);

    const migrator = createMigrator({
      database: context.database,
      connection: context.spec.name,
      directory,
      tableName,
      lockTableName,
    });

    await migrator.latest();
    expect(await context.db.schema.hasTable(context.table('rollbackUsers'))).toBe(true);

    await expect(migrator.rollback()).resolves.toEqual({
      batch: 1,
      rolledBack: ['202608180001_create_rollback_users'],
    });
    expect(await context.db.schema.hasTable(context.table('rollbackUsers'))).toBe(false);
    await expect(context.db(tableName).select()).resolves.toEqual([]);
  });

  it('keeps query changes and history writes in the same transaction', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('failedHistory');
    const lockTableName = context.table('failedLock');
    const dataTableName = context.table('migrationRows');

    await context.builder.createCollection('migrationRows', (collection) => {
      collection.increments('id');
      collection.string('status');
    });
    await writeMigration(directory, '202608180001_failing_data_migration', `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_failing_data_migration',

        async up({ query }) {
          await query
            .insertInto('${dataTableName}')
            .values({ status: 'created' })
            .execute();
          throw new Error('migration failed on purpose');
        },

        async down({ query }) {
          await query
            .deleteFrom('${dataTableName}')
            .where('status', '=', 'created')
            .execute();
        },
      });
    `);

    const migrator = createMigrator({
      database: context.database,
      connection: context.spec.name,
      directory,
      tableName,
      lockTableName,
    });

    await expect(migrator.latest()).rejects.toThrow('migration failed on purpose');
    await expect(context.database.query().selectFrom(dataTableName).select('status').execute()).resolves.toEqual([]);
    await expect(context.db(tableName).select()).resolves.toEqual([]);
  });

  it('rejects checksum changes for already executed migrations', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('checksumHistory');
    const lockTableName = context.table('checksumLock');
    const migrationName = '202608180001_checksum_guard';
    await writeMigration(directory, migrationName, `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_checksum_guard',
        async up() {},
        async down() {},
      });
    `);

    const migrator = createMigrator({
      database: context.database,
      connection: context.spec.name,
      directory,
      tableName,
      lockTableName,
    });

    await migrator.latest();
    await writeMigration(directory, migrationName, `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_checksum_guard',
        async up() {
          // changed after execution
        },
        async down() {},
      });
    `);

    await expect(migrator.latest())
      .rejects
      .toThrow('Executed migration "202608180001_checksum_guard" checksum changed.');
  });
});

async function createTempDirectory(): Promise<string> {
  await mkdir(tempRoot, { recursive: true });
  const directory = await mkdtemp(join(tempRoot, 'migrations-'));
  tempDirectories.push(directory);
  return directory;
}

async function writeMigration(directory: string, name: string, source: string): Promise<void> {
  await writeFile(join(directory, `${name}.ts`), trimSource(source));
}

function trimSource(source: string): string {
  return `${source.trim().replace(/^ {6}/gm, '')}\n`;
}

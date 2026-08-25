import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  createDatabaseManager,
  createMigrator,
  loadMigrations,
} from '../../../src/index.js';
import { createMigrationContext } from '../../../src/migration/context.js';
import { withMigrationLock } from '../../../src/migration/lock.js';
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

        async restoreMetadata({ builder }) {
          await builder.registerCollectionMetadata('migrationUsers', (collection) => {
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
    await context.metadataStore.removeCollection('migrationUsers');
    expect(context.builder.inspectCollection('migrationUsers')).toBeUndefined();

    await expect(migrator.latest()).resolves.toMatchObject({
      batch: 1,
      executed: [],
      skipped: ['202608180001_create_migration_users'],
    });
    expect(context.builder.inspectCollection('migrationUsers')).toBeDefined();

    await context.metadataStore.removeCollection('migrationUsers');
    await expect(migrator.restoreMetadata()).resolves.toEqual({
      restored: ['202608180001_create_migration_users'],
    });
    expect(context.builder.inspectCollection('migrationUsers')).toBeDefined();

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

  it('does nothing when metadata history has not been created', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('missingMetadataHistory');
    const lockTableName = context.table('missingMetadataLock');
    await writeMigration(
      directory,
      '202608180001_unapplied_metadata',
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_unapplied_metadata',
        async up() {},
        async restoreMetadata({ builder }) {
          await builder.registerCollectionMetadata('mustNotRestore', {
            fields: [],
          });
        },
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

    await expect(migrator.restoreMetadata()).resolves.toEqual({ restored: [] });
    await expect(context.db.schema.hasTable(tableName)).resolves.toBe(false);
    await expect(context.db.schema.hasTable(lockTableName)).resolves.toBe(true);
    expect(context.builder.inspectCollection('mustNotRestore')).toBeUndefined();
  });

  it('does not skip missing metadata history while the migration lock is held', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('lockedMissingMetadataHistory');
    const lockTableName = context.table('lockedMissingMetadataLock');
    await writeMigration(
      directory,
      '202608180001_locked_metadata',
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_locked_metadata',
        async up() {},
        async restoreMetadata() {},
        async down() {},
      });
    `,
    );
    let markLockAcquired!: () => void;
    let releaseLock!: () => void;
    const lockAcquired = new Promise<void>((resolve) => {
      markLockAcquired = resolve;
    });
    const lockReleased = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const holderConnection = createMigrationContext(
      context.database.connection(context.spec.name),
    ).connection;
    const lockHolder = withMigrationLock(
      { ...holderConnection, name: `${holderConnection.name}-holder` },
      { tableName: lockTableName },
      async () => {
        markLockAcquired();
        await lockReleased;
      },
    );
    await lockAcquired;

    const migrator = createMigrator({
      database: context.database,
      connection: context.spec.name,
      directory,
      tableName,
      lockTableName,
    });

    try {
      await expect(migrator.restoreMetadata()).rejects.toThrow(
        `Migration lock "${lockTableName}" is already held`,
      );
      await expect(context.db.schema.hasTable(tableName)).resolves.toBe(false);
    } finally {
      releaseLock();
      await lockHolder;
    }
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
            collection.tableName('${context.table('rollbackUsers')}');
            collection.increments('id');
            collection.string('name');
          });
        },

        async restoreMetadata({ builder }) {
          await builder.registerCollectionMetadata('rollbackUsers', (collection) => {
            collection.tableName('${context.table('rollbackUsers')}');
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
    await context.metadataStore.removeCollection('rollbackUsers');

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
    const dataTableName = context.table('migrationRows');

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
        .selectFrom(dataTableName)
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

  it('restores metadata-only collection renames in migration order', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('renameMetadataHistory');
    const lockTableName = context.table('renameMetadataLock');
    await writeMigration(
      directory,
      '202608180001_create_rename_source',
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_create_rename_source',
        async up({ builder }) {
          await builder.createCollection('renameSource', (collection) => {
            collection.increments('id');
          });
        },
        async restoreMetadata({ builder }) {
          await builder.registerCollectionMetadata('renameSource', (collection) => {
            collection.increments('id');
          });
        },
        async down({ builder }) {
          await builder.dropCollection('renameSource');
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
    await writeMigration(
      directory,
      '202608180002_rename_collection',
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180002_rename_collection',
        async up({ builder }) {
          await builder.renameCollection('renameSource', 'renamedCollection');
        },
        async restoreMetadata({ builder }) {
          await builder.renameCollectionMetadata('renameSource', 'renamedCollection');
        },
        async down({ builder }) {
          await builder.renameCollection('renamedCollection', 'renameSource');
        },
      });
    `,
    );

    await migrator.latest();
    await context.metadataStore.removeCollection('renameSource');
    await expect(migrator.restoreMetadata()).resolves.toEqual({
      restored: [
        '202608180001_create_rename_source',
        '202608180002_rename_collection',
      ],
    });
    expect(context.builder.inspectCollection('renameSource')).toBeUndefined();
    expect(
      context.builder.inspectCollection('renamedCollection'),
    ).toBeDefined();

    await context.metadataStore.removeCollection('renamedCollection');
    await expect(migrator.rollback()).resolves.toMatchObject({
      rolledBack: ['202608180002_rename_collection'],
    });
    expect(context.builder.inspectCollection('renameSource')).toBeDefined();
    expect(
      context.builder.inspectCollection('renamedCollection'),
    ).toBeUndefined();

    await expect(migrator.rollback()).resolves.toMatchObject({
      rolledBack: ['202608180001_create_rename_source'],
    });
    expect(context.builder.inspectCollection('renameSource')).toBeUndefined();
  });

  it('restores metadata-only collection drops without leaving stale metadata', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('dropMetadataHistory');
    const lockTableName = context.table('dropMetadataLock');
    await writeMigration(
      directory,
      '202608180001_create_drop_source',
      `
      import { defineMigration } from '../../../src/index.js';

      const defineCollection = (collection) => {
        collection.increments('id');
      };

      export default defineMigration({
        name: '202608180001_create_drop_source',
        async up({ builder }) {
          await builder.createCollection('dropSource', defineCollection);
        },
        async restoreMetadata({ builder }) {
          await builder.registerCollectionMetadata('dropSource', defineCollection);
        },
        async down({ builder }) {
          await builder.dropCollection('dropSource');
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
    await writeMigration(
      directory,
      '202608180002_drop_collection',
      `
      import { defineMigration } from '../../../src/index.js';

      const defineCollection = (collection) => {
        collection.increments('id');
      };

      export default defineMigration({
        name: '202608180002_drop_collection',
        async up({ builder }) {
          await builder.dropCollection('dropSource');
        },
        async restoreMetadata({ builder }) {
          await builder.removeCollectionMetadata('dropSource');
        },
        async down({ builder }) {
          await builder.createCollection('dropSource', defineCollection);
        },
      });
    `,
    );

    await migrator.latest();
    await context.metadataStore.saveCollection('dropSource', {
      name: 'dropSource',
      fields: [],
    });
    await expect(migrator.restoreMetadata()).resolves.toEqual({
      restored: [
        '202608180001_create_drop_source',
        '202608180002_drop_collection',
      ],
    });
    expect(context.builder.inspectCollection('dropSource')).toBeUndefined();

    await expect(migrator.rollback()).resolves.toMatchObject({
      rolledBack: ['202608180002_drop_collection'],
    });
    expect(context.builder.inspectCollection('dropSource')).toBeDefined();

    await expect(migrator.rollback()).resolves.toMatchObject({
      rolledBack: ['202608180001_create_drop_source'],
    });
    expect(context.builder.inspectCollection('dropSource')).toBeUndefined();
  });

  if (context.spec.dialect === 'sqlite') {
    it('replays applied metadata before pending migrations on a fresh manager', async () => {
      const root = await createTempDirectory();
      const directory = await createTempDirectory();
      const filename = join(root, 'metadata-replay.sqlite');
      const physicalTable = 'stored_documents';
      const tableName = 'metadata_replay_history';
      const lockTableName = 'metadata_replay_lock';
      const firstMigration = '202608180001_create_mapped_documents';
      const secondMigration = '202608180002_alter_and_rename_documents';
      await writeMigration(
        directory,
        firstMigration,
        `
        import { defineMigration } from '../../../src/index.js';

        const defineDocuments = (collection) => {
          collection.tableName('${physicalTable}');
          collection.increments('id').columnName('document_id');
          collection.string('title').columnName('document_title');
        };

        export default defineMigration({
          name: '${firstMigration}',
          irreversible: true,
          async up({ builder }) {
            await builder.createCollection('documents', defineDocuments);
          },
          async restoreMetadata({ builder }) {
            await builder.registerCollectionMetadata('documents', defineDocuments);
          },
        });
        `,
      );

      const waitingManager = createSqliteManager(filename);
      const waitingMigrator = createMigrator({
        database: waitingManager,
        directory,
        tableName,
        lockTableName,
      });
      await expect(waitingMigrator.restoreMetadata()).resolves.toEqual({
        restored: [],
      });

      const firstManager = createSqliteManager(filename);
      try {
        await createMigrator({
          database: firstManager,
          directory,
          tableName,
          lockTableName,
        }).latest();
      } finally {
        await firstManager.destroy();
      }

      try {
        await expect(waitingMigrator.latest()).resolves.toEqual({
          batch: 1,
          executed: [],
          skipped: [firstMigration],
        });
        expect(
          waitingManager.builder().inspectCollection('documents'),
        ).toMatchObject({ tableName: physicalTable });
      } finally {
        await waitingManager.destroy();
      }

      await writeMigration(
        directory,
        secondMigration,
        `
        import { defineMigration } from '../../../src/index.js';

        const defineDocuments = (collection) => {
          collection.tableName('${physicalTable}');
          collection.increments('id').columnName('document_id');
        };

        export default defineMigration({
          name: '${secondMigration}',
          irreversible: true,
          async up({ builder }) {
            await builder.alterCollection('documents', (collection) => {
              collection.dropField('title');
            });
            await builder.renameCollection('documents', 'archivedDocuments');
          },
          async restoreMetadata({ builder }) {
            await builder.registerCollectionMetadata('documents', defineDocuments);
            await builder.renameCollectionMetadata('documents', 'archivedDocuments');
          },
        });
      `,
      );

      const secondManager = createSqliteManager(filename);
      try {
        expect(
          secondManager.builder().inspectCollection('documents'),
        ).toBeUndefined();
        await expect(
          createMigrator({
            database: secondManager,
            directory,
            tableName,
            lockTableName,
          }).latest(),
        ).resolves.toEqual({
          batch: 2,
          executed: [secondMigration],
          skipped: [firstMigration],
        });

        const db = await secondManager
          .connection()
          .client<import('knex').Knex>();
        await expect(db.schema.hasTable(physicalTable)).resolves.toBe(true);
        await expect(db.schema.hasTable('documents')).resolves.toBe(false);
        await expect(
          db.schema.hasColumn(physicalTable, 'document_title'),
        ).resolves.toBe(false);
        await expect(
          db.schema.hasColumn(physicalTable, 'document_id'),
        ).resolves.toBe(true);
        expect(
          secondManager.builder().inspectCollection('archivedDocuments'),
        ).toMatchObject({
          tableName: physicalTable,
          fields: expect.arrayContaining([
            expect.objectContaining({ columnName: 'document_id' }),
          ]),
        });
      } finally {
        await secondManager.destroy();
      }
    });
  }
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

function createSqliteManager(filename: string) {
  return createDatabaseManager({
    default: 'sqlite',
    connections: {
      sqlite: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename,
        pool: { min: 1, max: 1 },
      },
    },
  });
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

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createSeeder } from '../../../src/index.js';
import { describeIntegrationDatabases } from '../helpers.js';

const tempRoot = join(process.cwd(), 'tests/.tmp');
const tempDirectories: string[] = [];

describeIntegrationDatabases('seed runner', (context) => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('runs package seeds once in global name order and records history', async () => {
    const firstDirectory = await createTempDirectory();
    const secondDirectory = await createTempDirectory();
    const tableName = context.table('seedHistory');
    const lockTableName = context.table('seedLock');
    const dataTableName = context.table('seedEvents');
    await context.db.schema.createTable(dataTableName, (table) => {
      table.increments('id').primary();
      table.string('event').notNullable();
    });
    await writeEventSeed(
      firstDirectory,
      '202608210002_alpha_defaults',
      dataTableName,
    );
    await writeEventSeed(
      secondDirectory,
      '202608210001_beta_defaults',
      dataTableName,
    );

    const seeder = createSeeder({
      database: context.database,
      connection: context.spec.name,
      sources: [
        { packageName: '@nocobase/plugin-alpha', directory: firstDirectory },
        { packageName: '@nocobase/plugin-beta', directory: secondDirectory },
      ],
      tableName,
      lockTableName,
    });

    await expect(seeder.run()).resolves.toEqual({
      executed: ['202608210001_beta_defaults', '202608210002_alpha_defaults'],
      skipped: [],
    });
    await expect(seeder.run()).resolves.toEqual({
      executed: [],
      skipped: ['202608210001_beta_defaults', '202608210002_alpha_defaults'],
    });
    await expect(
      context.db(dataTableName).select('event').orderBy('id'),
    ).resolves.toEqual([
      { event: '202608210001_beta_defaults' },
      { event: '202608210002_alpha_defaults' },
    ]);
    await expect(
      context.db(tableName).select(['package_name', 'name']).orderBy('id'),
    ).resolves.toEqual([
      {
        package_name: '@nocobase/plugin-beta',
        name: '202608210001_beta_defaults',
      },
      {
        package_name: '@nocobase/plugin-alpha',
        name: '202608210002_alpha_defaults',
      },
    ]);
  });

  it('rolls back a failed seed and retries it without a history record', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('retrySeedHistory');
    const lockTableName = context.table('retrySeedLock');
    const dataTableName = context.table('retrySeedRows');
    const controlTableName = context.table('retrySeedControl');
    await context.db.schema.createTable(dataTableName, (table) => {
      table.increments('id').primary();
      table.string('status').notNullable();
    });
    await context.db.schema.createTable(controlTableName, (table) => {
      table.boolean('allow_run').notNullable();
    });
    await context.db(controlTableName).insert({ allow_run: false });
    await writeSeed(
      directory,
      '202608210001_retry_defaults',
      `
      import { defineSeed } from '../../../src/index.js';

      export default defineSeed({
        name: '202608210001_retry_defaults',
        async run({ query }) {
          await query.insertInto('${dataTableName}').values({ status: 'created' }).execute();
          const control = await query
            .selectFrom('${controlTableName}')
            .select('allow_run')
            .executeTakeFirstOrThrow();
          if (!control.allow_run) {
            throw new Error('seed failed on purpose');
          }
        },
      });
    `,
    );

    const seeder = createSeeder({
      database: context.database,
      connection: context.spec.name,
      directory,
      tableName,
      lockTableName,
    });

    await expect(seeder.run()).rejects.toThrow('seed failed on purpose');
    await expect(context.db(dataTableName).select()).resolves.toEqual([]);
    await expect(context.db(tableName).select()).resolves.toEqual([]);

    await context.db(controlTableName).update({ allow_run: true });
    await expect(seeder.run()).resolves.toMatchObject({
      executed: ['202608210001_retry_defaults'],
    });
    await expect(context.db(dataTableName).select('status')).resolves.toEqual([
      { status: 'created' },
    ]);
  });

  it('rejects checksum changes for executed seeds', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('checksumSeedHistory');
    const lockTableName = context.table('checksumSeedLock');
    const name = '202608210001_checksum_seed';
    await writeSeed(directory, name, seedSource(name));
    const seeder = createSeeder({
      database: context.database,
      connection: context.spec.name,
      directory,
      tableName,
      lockTableName,
    });
    await seeder.run();

    await writeSeed(
      directory,
      name,
      `
      import { defineSeed } from '../../../src/index.js';
      export default defineSeed({
        name: '${name}',
        async run() {
          // changed after execution
        },
      });
    `,
    );

    await expect(seeder.run()).rejects.toThrow(
      `Executed seed "${name}" checksum changed.`,
    );
  });

  it('supports seeds that explicitly run without a transaction', async () => {
    const directory = await createTempDirectory();
    const tableName = context.table('nonTransactionalSeedHistory');
    const lockTableName = context.table('nonTransactionalSeedLock');
    const dataTableName = context.table('nonTransactionalSeedRows');
    await context.db.schema.createTable(dataTableName, (table) => {
      table.increments('id').primary();
      table.string('status').notNullable();
    });
    await writeSeed(
      directory,
      '202608210001_non_transactional_seed',
      `
      import { defineSeed } from '../../../src/index.js';
      export default defineSeed({
        name: '202608210001_non_transactional_seed',
        transaction: false,
        async run({ query }) {
          await query.insertInto('${dataTableName}').values({ status: 'created' }).execute();
        },
      });
    `,
    );

    const seeder = createSeeder({
      database: context.database,
      connection: context.spec.name,
      directory,
      tableName,
      lockTableName,
    });

    await expect(seeder.run()).resolves.toMatchObject({
      executed: ['202608210001_non_transactional_seed'],
    });
    await expect(context.db(dataTableName).select('status')).resolves.toEqual([
      { status: 'created' },
    ]);
  });

  it('can install package seeds separately with shared history', async () => {
    const firstDirectory = await createTempDirectory();
    const secondDirectory = await createTempDirectory();
    const tableName = context.table('separatePackageSeedHistory');
    const lockTableName = context.table('separatePackageSeedLock');
    await writeSeed(
      firstDirectory,
      '202608210001_first_package',
      seedSource('202608210001_first_package'),
    );
    await writeSeed(
      secondDirectory,
      '202608210002_second_package',
      seedSource('202608210002_second_package'),
    );

    const firstSeeder = createSeeder({
      database: context.database,
      connection: context.spec.name,
      directory: firstDirectory,
      packageName: '@nocobase/plugin-first',
      tableName,
      lockTableName,
    });
    const secondSeeder = createSeeder({
      database: context.database,
      connection: context.spec.name,
      directory: secondDirectory,
      packageName: '@nocobase/plugin-second',
      tableName,
      lockTableName,
    });

    await expect(firstSeeder.run()).resolves.toMatchObject({
      executed: ['202608210001_first_package'],
    });
    await expect(secondSeeder.run()).resolves.toMatchObject({
      executed: ['202608210002_second_package'],
    });
    await expect(
      context.db(tableName).select(['package_name', 'name']).orderBy('id'),
    ).resolves.toEqual([
      {
        package_name: '@nocobase/plugin-first',
        name: '202608210001_first_package',
      },
      {
        package_name: '@nocobase/plugin-second',
        name: '202608210002_second_package',
      },
    ]);
  });
});

async function createTempDirectory(): Promise<string> {
  await mkdir(tempRoot, { recursive: true });
  const directory = await mkdtemp(join(tempRoot, 'seeds-'));
  tempDirectories.push(directory);
  return directory;
}

async function writeEventSeed(
  directory: string,
  name: string,
  tableName: string,
): Promise<void> {
  await writeSeed(
    directory,
    name,
    `
      import { defineSeed } from '../../../src/index.js';
      export default defineSeed({
        name: '${name}',
        async run({ query }) {
          await query.insertInto('${tableName}').values({ event: '${name}' }).execute();
        },
      });
    `,
  );
}

async function writeSeed(
  directory: string,
  name: string,
  source: string,
): Promise<void> {
  await writeFile(join(directory, `${name}.ts`), trimSource(source));
}

function seedSource(name: string): string {
  return `
      import { defineSeed } from '../../../src/index.js';
      export default defineSeed({
        name: '${name}',
        async run() {},
      });
    `;
}

function trimSource(source: string): string {
  return `${source.trim().replace(/^ {6}/gm, '')}\n`;
}

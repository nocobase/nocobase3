import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadMigrations, validateMigrations } from '../../../src/index.js';

const tempRoot = join(process.cwd(), 'tests/.tmp');
const tempDirectories: string[] = [];

describe('migration loader', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('loads only default defineMigration exports and sorts by migration name', async () => {
    const directory = await createTempDirectory();
    await writeMigration(
      directory,
      '202608180002_second',
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180002_second',
        async up() {},
        async down() {},
      });
    `,
    );
    await writeMigration(
      directory,
      '202608180001_first',
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_first',
        async up() {},
        async down() {},
      });
    `,
    );

    const migrations = await loadMigrations({ directory });

    expect(migrations.map((migration) => migration.name)).toEqual([
      '202608180001_first',
      '202608180002_second',
    ]);
    expect(migrations[0].checksum).toHaveLength(64);
  });

  it('accepts irreversible migrations without down', async () => {
    const directory = await createTempDirectory();
    await writeMigration(
      directory,
      '202608180001_cleanup_data',
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_cleanup_data',
        irreversible: true,
        async up() {},
      });
    `,
    );

    await expect(validateMigrations(directory)).resolves.toHaveLength(1);
  });

  it('rejects named up and down exports', async () => {
    const directory = await createTempDirectory();
    await writeMigration(
      directory,
      '202608180001_named_exports',
      `
      export async function up() {}
      export async function down() {}
    `,
    );

    await expect(loadMigrations({ directory })).rejects.toThrow(
      'must default export defineMigration({...}).',
    );
  });

  it('rejects default objects that did not go through defineMigration', async () => {
    const directory = await createTempDirectory();
    await writeMigration(
      directory,
      '202608180001_plain_object',
      `
      export default {
        name: '202608180001_plain_object',
        async up() {},
        async down() {},
      };
    `,
    );

    await expect(loadMigrations({ directory })).rejects.toThrow(
      'must default export defineMigration({...}).',
    );
  });

  it('rejects CommonJS module exports', async () => {
    const directory = await createTempDirectory();
    await writeMigration(
      directory,
      '202608180001_commonjs',
      `
      module.exports = {
        name: '202608180001_commonjs',
        async up() {},
        async down() {},
      };
    `,
      '.cjs',
    );

    await expect(loadMigrations({ directory })).rejects.toThrow(
      'must default export defineMigration({...}).',
    );
  });

  it('rejects missing down unless irreversible is true', async () => {
    const directory = await createTempDirectory();
    await writeMigration(
      directory,
      '202608180001_missing_down',
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_missing_down',
        async up() {},
      });
    `,
    );

    await expect(loadMigrations({ directory })).rejects.toThrow(
      'must define down(context) or set irreversible: true.',
    );
  });

  it('rejects file name and migration name mismatches', async () => {
    const directory = await createTempDirectory();
    await writeMigration(
      directory,
      '202608180001_file_name',
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_different_name',
        async up() {},
        async down() {},
      });
    `,
    );

    await expect(loadMigrations({ directory })).rejects.toThrow(
      'but file name requires "202608180001_file_name"',
    );
  });

  it('rejects duplicate migration names', async () => {
    const directory = await createTempDirectory();
    await writeMigration(
      directory,
      '202608180001_duplicate',
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_duplicate',
        async up() {},
        async down() {},
      });
    `,
    );
    await writeMigration(
      directory,
      '202608180001_duplicate',
      `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '202608180001_duplicate',
        async up() {},
        async down() {},
      });
    `,
      '.js',
    );

    await expect(loadMigrations({ directory })).rejects.toThrow(
      'Duplicate migration name "202608180001_duplicate"',
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
  extension = '.ts',
): Promise<void> {
  await writeFile(join(directory, `${name}${extension}`), trimSource(source));
}

function trimSource(source: string): string {
  return `${source.trim().replace(/^ {6}/gm, '')}\n`;
}

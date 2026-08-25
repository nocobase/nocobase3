import { createHash } from 'node:crypto';
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
    expect(migrations.map((migration) => migration.packageName)).toEqual([
      'app',
      'app',
    ]);
  });

  it('loads multiple package sources and keeps global name ordering', async () => {
    const firstDirectory = await createTempDirectory();
    const secondDirectory = await createTempDirectory();
    await writeMigration(
      firstDirectory,
      '202608180002_from_alpha',
      migrationSource('202608180002_from_alpha'),
    );
    await writeMigration(
      secondDirectory,
      '202608180001_from_beta',
      migrationSource('202608180001_from_beta'),
    );

    const migrations = await loadMigrations({
      sources: [
        { packageName: '@nocobase/plugin-alpha', directory: firstDirectory },
        { packageName: '@nocobase/plugin-beta', directory: secondDirectory },
      ],
    });

    expect(
      migrations.map(({ packageName, name }) => ({ packageName, name })),
    ).toEqual([
      { packageName: '@nocobase/plugin-beta', name: '202608180001_from_beta' },
      {
        packageName: '@nocobase/plugin-alpha',
        name: '202608180002_from_alpha',
      },
    ]);
  });

  it('preserves checksums across the app-database package rename', async () => {
    const directory = await createTempDirectory();
    const name = '202608180001_package_rename';
    const source = `import {
  defineMigration,
  type MigrationDefinition,
} from '@nocobase/app-database';

const migration: MigrationDefinition = defineMigration({
  name: '${name}',
  async up() {},
  async down() {},
});

export default migration;
`;
    await writeFile(join(directory, `${name}.ts`), source, 'utf8');

    const [migration] = await loadMigrations({ directory });
    const legacySource = source
      .replaceAll('@nocobase/app-database', '@nocobase/database')
      .replace(
        /import\s*\{\s*defineMigration,\s*type MigrationDefinition,\s*\}\s*from '@nocobase\/database';/,
        "import { defineMigration, type MigrationDefinition } from '@nocobase/database';",
      );

    expect(migration.checksum).toBe(
      createHash('sha256').update(legacySource).digest('hex'),
    );
  });

  it('supports an explicit package name for the legacy directory API', async () => {
    const directory = await createTempDirectory();
    await writeMigration(
      directory,
      '202608180001_plugin_migration',
      migrationSource('202608180001_plugin_migration'),
    );

    const migrations = await loadMigrations({
      directory,
      packageName: '@nocobase/plugin-example',
    });

    expect(migrations[0].packageName).toBe('@nocobase/plugin-example');
  });

  it('rejects duplicate names across package sources', async () => {
    const firstDirectory = await createTempDirectory();
    const secondDirectory = await createTempDirectory();
    const name = '202608180001_duplicate_across_packages';
    await writeMigration(firstDirectory, name, migrationSource(name));
    await writeMigration(secondDirectory, name, migrationSource(name));

    await expect(
      loadMigrations({
        sources: [
          { packageName: '@nocobase/plugin-alpha', directory: firstDirectory },
          { packageName: '@nocobase/plugin-beta', directory: secondDirectory },
        ],
      }),
    ).rejects.toThrow(`Duplicate migration name "${name}"`);
  });

  it('rejects empty package names', async () => {
    const directory = await createTempDirectory();

    await expect(
      loadMigrations({
        sources: [{ packageName: ' ', directory }],
      }),
    ).rejects.toThrow('Migration packageName must be a non-empty string.');
  });

  it('requires exactly one migration source shape', async () => {
    const directory = await createTempDirectory();

    await expect(loadMigrations({})).rejects.toThrow(
      'Migration options must define directory or sources.',
    );
    await expect(loadMigrations({ directory, sources: [] })).rejects.toThrow(
      'Migration options cannot define both directory and sources.',
    );
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

function migrationSource(name: string): string {
  return `
      import { defineMigration } from '../../../src/index.js';

      export default defineMigration({
        name: '${name}',
        async up() {},
        async down() {},
      });
    `;
}

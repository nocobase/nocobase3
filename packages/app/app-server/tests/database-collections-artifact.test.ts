import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';
import sqlite from '@nocobase/db-sqlite';
import {
  InMemoryCollectionMetadataStore,
  type CollectionArtifactCollectionFile,
  type CollectionArtifactManifest,
  type CollectionArtifactMetadataFile,
  type CollectionArtifactSchemaFile,
} from '@nocobase/db';
import { createConfigPaths } from '../src/config/index.js';
import {
  createAppDatabaseManager,
  generateAppCollectionsArtifact,
  runAppDatabaseTasks,
  type AppDatabaseConfig,
  type AppDatabaseTaskContributions,
} from '../src/database/index.js';

const drivers = { sqlite };
const contributions: AppDatabaseTaskContributions = {
  appPackageName: 'test-app',
  migrations: [],
  seeds: [],
};

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'collections-artifact-'));
  roots.push(root);
  const paths = createConfigPaths({ rootDir: root });
  // An external database exists before the application does; nothing here
  // prepares storage for it, so the fixture stands in for the foreign system.
  mkdirSync(paths.storage('external'), { recursive: true });
  const config: AppDatabaseConfig = {
    drivers,
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: paths.storage('main/data.sqlite') },
      analytics: {
        dialect: 'sqlite',
        filename: paths.storage('analytics/data.sqlite'),
        migrations: { autoRun: false },
        seeds: { autoRun: false },
      },
      external: {
        dialect: 'sqlite',
        filename: paths.storage('external/data.sqlite'),
        schemaManagement: 'external',
        metadataStore: new InMemoryCollectionMetadataStore(),
      },
    },
  };
  return { root, paths, config };
}

function migration(directory: string, name: string, table: string) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, `${name}.ts`),
    `import { defineMigration } from '@nocobase/db';
export default defineMigration({ name: '${name}', async up({ builder }) {
  await builder.createCollection('${table}', (c) => {
    c.title('${table} rows');
    c.increments('id');
    c.string('value', { length: 64 });
    c.index('value');
  });
}, async down({ builder }) { await builder.dropCollection('${table}'); } });`,
  );
}

async function migrate(
  config: AppDatabaseConfig,
  paths: ReturnType<typeof createConfigPaths>,
) {
  const result = await runAppDatabaseTasks(config, {
    paths,
    contributions,
    kind: 'migrations',
    all: true,
  });
  expect(result.ok).toBe(true);
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

describe('generateAppCollectionsArtifact', () => {
  it('writes three files per Collection and a manifest per connection, external ones included', async () => {
    const { config, paths } = fixture();
    migration(paths.database('main/migrations'), '001_main', 'mainRows');
    migration(
      paths.database('analytics/migrations'),
      '001_analytics',
      'events',
    );
    await migrate(config, paths);

    const result = await generateAppCollectionsArtifact(config, {
      paths,
      all: true,
    });
    expect(result.results[0].error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(
      result.results.map((entry) => [entry.connection, entry.status]),
    ).toEqual([
      ['main', 'completed'],
      ['analytics', 'completed'],
      ['external', 'completed'],
    ]);
    const main = result.results[0];
    expect(main.written).toEqual([
      '_manifest.json',
      'mainRows/collection.json',
      'mainRows/metadata.json',
      'mainRows/schema.json',
    ]);
    expect(main.manifest).toEqual({
      dialect: 'sqlite',
      schemaManagement: 'managed',
      migrationHead: '001_main',
      collections: ['mainRows'],
    });

    const directory = paths.database('main/collections');
    expect(readdirSync(directory).sort()).toEqual([
      '_manifest.json',
      'mainRows',
    ]);
    const manifest = readJson<CollectionArtifactManifest>(
      path.join(directory, '_manifest.json'),
    );
    expect(manifest).toEqual({
      formatVersion: 1,
      connection: 'main',
      dialect: 'sqlite',
      schemaManagement: 'managed',
      migrationHead: '001_main',
      collections: ['mainRows'],
    });
    const collection = readJson<CollectionArtifactCollectionFile>(
      path.join(directory, 'mainRows/collection.json'),
    );
    expect(collection.collection).toMatchObject({
      name: 'mainRows',
      title: 'mainRows rows',
    });
    expect(collection.collection.fields?.map((field) => field.name)).toEqual([
      'id',
      'value',
    ]);
    const metadata = readJson<CollectionArtifactMetadataFile>(
      path.join(directory, 'mainRows/metadata.json'),
    );
    expect(metadata.document).toMatchObject({
      name: 'mainRows',
      title: 'mainRows rows',
    });
    const schema = readJson<CollectionArtifactSchemaFile>(
      path.join(directory, 'mainRows/schema.json'),
    );
    expect(schema.physical.columns.map((column) => column.columnName)).toEqual([
      'id',
      'value',
    ]);
    expect(schema.physical.indexes.length).toBeGreaterThan(0);

    expect(
      existsSync(
        paths.database('analytics/collections/events/collection.json'),
      ),
    ).toBe(true);
    // An external connection owns no tables yet, so only its manifest exists.
    expect(result.results[2].manifest).toEqual({
      dialect: 'sqlite',
      schemaManagement: 'external',
      migrationHead: null,
      collections: [],
    });
    expect(readdirSync(paths.database('external/collections'))).toEqual([
      '_manifest.json',
    ]);
  });

  it('is idempotent and its check mode agrees', async () => {
    const { config, paths } = fixture();
    migration(paths.database('main/migrations'), '001_main', 'mainRows');
    await migrate(config, paths);
    await generateAppCollectionsArtifact(config, { paths });

    const again = await generateAppCollectionsArtifact(config, { paths });
    expect(again.results[0]).toMatchObject({
      status: 'completed',
      written: [],
      deleted: [],
      unchanged: 1,
    });

    const check = await generateAppCollectionsArtifact(config, {
      paths,
      check: true,
    });
    expect(check).toMatchObject({ ok: true, status: 'completed', check: true });
    expect(check.results[0].differences).toEqual([]);
  });

  it('reports stale, missing and unexpected files in check mode without touching them, then repairs them', async () => {
    const { config, paths } = fixture();
    migration(paths.database('main/migrations'), '001_main', 'mainRows');
    await migrate(config, paths);
    await generateAppCollectionsArtifact(config, { paths });
    const directory = paths.database('main/collections');
    const collectionFile = path.join(directory, 'mainRows/collection.json');
    const original = readFileSync(collectionFile, 'utf8');

    writeFileSync(collectionFile, '{ "edited": true }\n');
    rmSync(path.join(directory, 'mainRows/schema.json'));
    mkdirSync(path.join(directory, 'ghost'));
    writeFileSync(path.join(directory, 'ghost/collection.json'), '{}\n');
    writeFileSync(path.join(directory, 'mainRows/notes.txt'), 'keep me\n');
    writeFileSync(path.join(directory, '.DS_Store'), '');

    const check = await generateAppCollectionsArtifact(config, {
      paths,
      check: true,
    });
    expect(check).toMatchObject({ ok: false, status: 'stale' });
    expect(check.results[0].differences).toEqual([
      { path: 'ghost/collection.json', kind: 'unexpected' },
      { path: 'mainRows/collection.json', kind: 'stale' },
      { path: 'mainRows/notes.txt', kind: 'unexpected' },
      { path: 'mainRows/schema.json', kind: 'missing' },
    ]);
    expect(readFileSync(collectionFile, 'utf8')).toBe('{ "edited": true }\n');

    const refused = await generateAppCollectionsArtifact(config, { paths });
    expect(refused.results[0]).toMatchObject({ status: 'failed' });
    expect(refused.results[0].error).toContain('mainRows/notes.txt');
    expect(readFileSync(collectionFile, 'utf8')).toBe('{ "edited": true }\n');

    rmSync(path.join(directory, 'mainRows/notes.txt'));
    const repaired = await generateAppCollectionsArtifact(config, { paths });
    expect(repaired.results[0]).toMatchObject({
      status: 'completed',
      written: [
        'mainRows/collection.json',
        'mainRows/metadata.json',
        'mainRows/schema.json',
      ],
      deleted: ['ghost/collection.json'],
    });
    expect(readFileSync(collectionFile, 'utf8')).toBe(original);
    expect(existsSync(path.join(directory, 'ghost'))).toBe(false);
    expect(existsSync(path.join(directory, '.DS_Store'))).toBe(true);
  });

  it('removes the directory of a Collection that no longer exists and updates the manifest', async () => {
    const { config, paths } = fixture();
    migration(paths.database('main/migrations'), '001_main', 'mainRows');
    migration(paths.database('main/migrations'), '002_more', 'moreRows');
    await migrate(config, paths);
    const database = createAppDatabaseManager(config, paths)!;
    try {
      await generateAppCollectionsArtifact(config, { paths, database });
      await database.builder('main').dropCollection('moreRows');

      const result = await generateAppCollectionsArtifact(config, {
        paths,
        database,
      });
      expect(result.results[0]).toMatchObject({
        status: 'completed',
        written: ['_manifest.json'],
        deleted: [
          'moreRows/collection.json',
          'moreRows/metadata.json',
          'moreRows/schema.json',
        ],
        unchanged: 1,
      });
      const manifest = readJson<CollectionArtifactManifest>(
        paths.database('main/collections/_manifest.json'),
      );
      expect(manifest.collections).toEqual(['mainRows']);
      expect(manifest.migrationHead).toBe('002_more');
      expect(existsSync(paths.database('main/collections/moreRows'))).toBe(
        false,
      );
    } finally {
      await database.destroy();
    }
  });

  it('snapshots the tables another system created on an external connection', async () => {
    const { config, paths } = fixture();
    const database = createAppDatabaseManager(config, paths)!;
    try {
      // The schema belongs to the foreign system: create it as that system
      // would, with the raw client rather than the Builder.
      const knex = await database.connection('external').client<Knex>();
      await knex.schema.createTable('legacy_accounts', (table) => {
        table.increments('id');
        table.string('code', 32).notNullable();
      });

      const result = await generateAppCollectionsArtifact(config, {
        paths,
        connection: 'external',
        database,
      });
      expect(result.results[0]).toMatchObject({
        status: 'completed',
        manifest: {
          schemaManagement: 'external',
          migrationHead: null,
          collections: ['legacyAccounts'],
        },
        written: [
          '_manifest.json',
          'legacyAccounts/collection.json',
          'legacyAccounts/metadata.json',
          'legacyAccounts/schema.json',
        ],
      });
      const collection = readJson<CollectionArtifactCollectionFile>(
        paths.database('external/collections/legacyAccounts/collection.json'),
      );
      expect(collection.collection.fields?.map((field) => field.name)).toEqual([
        'id',
        'code',
      ]);
    } finally {
      await database.destroy();
    }
  });

  it('refuses conflicting flags and unknown connections', async () => {
    const { config, paths } = fixture();
    await expect(
      generateAppCollectionsArtifact(config, {
        paths,
        connection: 'main',
        all: true,
      }),
    ).rejects.toThrow(/mutually exclusive/);
    await expect(
      generateAppCollectionsArtifact(config, { paths, connection: 'nope' }),
    ).rejects.toThrow(/Unknown database connection/);
  });

  it('reports not-configured when the application has no database', async () => {
    const result = await generateAppCollectionsArtifact({
      default: 'none',
      connections: {},
    });
    expect(result).toEqual({
      ok: true,
      status: 'not-configured',
      check: false,
      results: [],
    });
  });
});

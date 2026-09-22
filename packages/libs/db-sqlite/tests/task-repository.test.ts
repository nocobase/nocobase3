import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it } from 'vitest';
import sqlite from '../src/index.js';
import { createDatabaseManager } from '@nocobase/db';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Inside the package so vitest transforms the TypeScript it writes and the
// task's `@nocobase/db` import resolves; a system temp directory does neither.
function taskDirectory(prefix: string): string {
  const parent = path.resolve(import.meta.dirname, '.tmp');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(path.join(parent, `${prefix}-`));
  directories.push(directory);
  return directory;
}

function write(directory: string, name: string, source: string): void {
  writeFileSync(path.join(directory, `${name}.ts`), source);
}

/**
 * Declares the shape both tasks write into: a JSON field whose encoding is
 * dialect-specific, and a belongsToMany whose junction rows a task would
 * otherwise have to assemble by hand.
 */
const DROP_COLLECTIONS = `await builder.dropCollections([
      'books',
      'bookTags',
      'tags',
      'owners',
    ]);`;

const CREATE_COLLECTIONS = `await builder.createCollections([
      {
        name: 'owners',
        definition: (c) => {
          c.string('id', { length: 64 }).primary().notNull();
          c.string('name', { length: 120 }).notNull();
        },
      },
      {
        name: 'tags',
        definition: (c) => {
          c.string('id', { length: 64 }).primary().notNull();
          c.string('label', { length: 120 }).notNull();
        },
      },
      {
        name: 'bookTags',
        definition: (c) => {
          c.string('bookId', { length: 64 }).notNull();
          c.string('tagId', { length: 64 }).notNull();
          c.primary(['bookId', 'tagId']);
        },
      },
      {
        name: 'books',
        definition: (c) => {
          c.string('id', { length: 64 }).primary().notNull();
          c.string('title', { length: 200 }).notNull();
          c.json('keywords');
          c.string('ownerId', { length: 64 });
          c.belongsTo('owner', 'owners')
            .targetKey('id')
            .foreignKey('ownerId')
            .constraints(false);
          c.belongsToMany('tags', 'tags')
            .through('bookTags')
            .sourceKey('id')
            .foreignKey('bookId')
            .targetKey('id')
            .otherKey('tagId');
        },
      },
    ]);`;

const WRITE_RECORDS = `await repository('owners').createOne({
      values: { id: 'owner-1', name: 'Ada' },
    });
    await repository('tags').createMany({
      values: [
        { id: 'tag-db', label: 'Database' },
        { id: 'tag-docs', label: 'Documentation' },
      ],
    });
    await repository('books').createOne({
      values: {
        id: 'book-1',
        title: 'Structure',
        keywords: ['schema', 'history'],
        owner: { connect: { id: 'owner-1' } },
        tags: { connect: [{ id: 'tag-db' }, { id: 'tag-docs' }] },
      },
    });`;

describe('repository in a migration', () => {
  it('writes a Collection the same migration created, encoding JSON and relations', async () => {
    const db = createDatabaseManager({
      drivers: { sqlite },
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const directory = taskDirectory('migration-repository');
    write(
      directory,
      '001_create_and_fill',
      `import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '001_create_and_fill',
  async up({ builder, repository }) {
    ${CREATE_COLLECTIONS}
    ${WRITE_RECORDS}
  },
  async down({ builder }) {
    ${DROP_COLLECTIONS}
  },
});
`,
    );

    await db.createMigrator({ directory }).latest();

    const book = await db.repository('books').findOne({
      filter: { id: 'book-1' },
    });
    // The JSON field decodes to the value that was written, rather than to the
    // string a migration using `query` has to parse for itself.
    expect(book).toMatchObject({
      id: 'book-1',
      title: 'Structure',
      keywords: ['schema', 'history'],
      ownerId: 'owner-1',
    });
    // Read the junction through raw knex, at its physical name: the migration
    // named only the logical `tags` relation, and the naming strategy is what
    // turned that into rows in `book_tags`.
    const knex = await db.connection().client<Knex>();
    expect(
      (await knex('book_tags').select('tag_id').orderBy('tag_id')).map(
        (row: { tag_id: string }) => row.tag_id,
      ),
    ).toEqual(['tag-db', 'tag-docs']);

    await db.disconnect();
  });

  it('discards repository writes when the migration fails', async () => {
    const db = createDatabaseManager({
      drivers: { sqlite },
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const directory = taskDirectory('migration-rollback');
    write(
      directory,
      '001_create_owners',
      `import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '001_create_owners',
  async up({ builder }) {
    await builder.createCollection('owners', (c) => {
      c.string('id', { length: 64 }).primary().notNull();
      c.string('name', { length: 120 }).notNull();
    });
  },
  async down({ builder }) {
    await builder.dropCollection('owners');
  },
});
`,
    );
    write(
      directory,
      '002_fill_then_fail',
      `import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '002_fill_then_fail',
  irreversible: true,
  async up({ repository }) {
    await repository('owners').createOne({
      values: { id: 'owner-1', name: 'Ada' },
    });
    throw new Error('migration failed after writing');
  },
});
`,
    );

    const migrator = db.createMigrator({ directory });
    await expect(migrator.latest()).rejects.toThrow(
      'migration failed after writing',
    );

    // The Repository is bound to the migration's own transaction connection,
    // so a failure takes its writes with it. One resolved from the application
    // container would have written outside the transaction and survived.
    expect(await db.repository('owners').count()).toBe(0);
    expect((await migrator.history()).map((record) => record.name)).toEqual([
      '001_create_owners',
    ]);

    await db.disconnect();
  });
});

describe('repository in a seed', () => {
  it('writes installation data in Collection terms', async () => {
    const db = createDatabaseManager({
      drivers: { sqlite },
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const migrations = taskDirectory('seed-repository-migrations');
    const seeds = taskDirectory('seed-repository-seeds');
    write(
      migrations,
      '001_create_library',
      `import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '001_create_library',
  async up({ builder }) {
    ${CREATE_COLLECTIONS}
  },
  async down({ builder }) {
    ${DROP_COLLECTIONS}
  },
});
`,
    );
    write(
      seeds,
      '001_fill_library',
      `import { defineSeed } from '@nocobase/db';
export default defineSeed({
  name: '001_fill_library',
  async run({ repository }) {
    ${WRITE_RECORDS}
  },
});
`,
    );

    await db.createMigrator({ directory: migrations }).latest();
    const result = await db.createSeeder({ directory: seeds }).run();
    expect(result.executed).toEqual(['001_fill_library']);

    expect(
      await db.repository('books').findOne({ filter: { id: 'book-1' } }),
    ).toMatchObject({ keywords: ['schema', 'history'], ownerId: 'owner-1' });
    const knex = await db.connection().client<Knex>();
    expect(
      (await knex('book_tags').select('tag_id').orderBy('tag_id')).map(
        (row: { tag_id: string }) => row.tag_id,
      ),
    ).toEqual(['tag-db', 'tag-docs']);

    await db.disconnect();
  });
});

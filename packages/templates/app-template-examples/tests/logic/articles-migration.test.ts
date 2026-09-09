// @vitest-environment node
import path from 'node:path';
import { createDatabaseManager } from '@nocobase/db';
import type { Knex } from 'knex';
import { expect, it } from 'vitest';

it('creates article schema and metadata, preserves migration history, and reverses the schema', async () => {
  const database = createDatabaseManager({
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  try {
    const migrator = database.createMigrator({
      connection: 'main',
      directory: path.resolve(
        import.meta.dirname,
        '../../database/main/migrations',
      ),
      packageName: 'articles-test',
    });
    await migrator.latest();
    const connection = database.connection('main');
    const client = await connection.client<Knex>();
    const columns = await client('articles').columnInfo();
    expect(Object.keys(columns)).toEqual([
      'id',
      'title',
      'summary',
      'content',
      'status',
      'published_at',
      'created_at',
      'updated_at',
    ]);
    expect(columns.title).toMatchObject({ nullable: false, type: 'varchar' });
    expect(columns.content.type).toBe('text');
    expect(columns.published_at.nullable).toBe(true);
    expect(
      await client('sqlite_master')
        .where({ type: 'index', tbl_name: 'articles' })
        .pluck('name'),
    ).toEqual(
      expect.arrayContaining([
        'idx_articles_status_published_at',
        'idx_articles_created_at',
      ]),
    );
    const timestamp = new Date('2026-09-08T00:00:00Z');
    await database
      .query()
      .insertInto('articles')
      .values({
        title: 'First article',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .execute();
    expect(
      await database
        .query()
        .selectFrom('articles')
        .selectAll()
        .executeTakeFirst(),
    ).toMatchObject({
      title: 'First article',
      status: 'draft',
      content: '',
      publishedAt: null,
    });
    await expect(
      database
        .query()
        .insertInto('articles')
        .values({ createdAt: timestamp, updatedAt: timestamp })
        .execute(),
    ).rejects.toThrow();
    await expect(migrator.latest()).resolves.toMatchObject({ executed: [] });
    const metadata = await connection.collectionMetadata.get('articles');
    expect(metadata?.document).toMatchObject({
      name: 'articles',
      title: '文章',
    });
    await migrator.rollback();
    expect(await client.schema.hasTable('articles')).toBe(false);
    expect(await connection.collectionMetadata.get('articles')).toBeUndefined();
  } finally {
    await database.destroy();
  }
});

// @vitest-environment node
import path from 'node:path';
import { createDatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import type { Knex } from 'knex';
import { expect, it } from 'vitest';

it('creates the tasks collection and reverses it', async () => {
  const database = createDatabaseManager({
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  try {
    const migrator = database.createMigrator({
      directory: path.resolve(import.meta.dirname, '../database/migrations'),
      packageName: '@nocobase/app-plugin-authorization-example',
    });
    await migrator.latest();
    const client = await database.connection().client<Knex>();
    const columns = await client('authorization_example_tasks').columnInfo();
    expect(Object.keys(columns)).toEqual([
      'id',
      'title',
      'status',
      'owner_id',
      'created_at',
      'updated_at',
    ]);
    expect(columns.title).toMatchObject({ nullable: false });
    expect(columns.owner_id).toMatchObject({ nullable: false });
    expect(
      await client('sqlite_master')
        .where({ type: 'index', tbl_name: 'authorization_example_tasks' })
        .pluck('name'),
    ).toEqual(
      expect.arrayContaining(['idx_authorization_example_tasks_owner_id']),
    );

    await migrator.rollback();
    expect(await client.schema.hasTable('authorization_example_tasks')).toBe(
      false,
    );
  } finally {
    await database.destroy();
  }
});

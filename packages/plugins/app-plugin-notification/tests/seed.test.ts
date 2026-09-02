import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import seed from '../database/seeds/202609010001_notification_grant_system_administrator.js';

describe('notification administrator permission seed', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
    await database
      .connection()
      .builder.createCollection('authorizationPermissionSets', (collection) => {
        collection.string('key').primary();
        collection.json('grants').notNull();
        collection.datetime('updatedAt').notNull();
      });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('adds the notification test grant once to the system administrator', async () => {
    const query = database.connection().query;
    await query
      .insertInto('authorizationPermissionSets')
      .values({
        key: 'system-administrator',
        grants: JSON.stringify([
          {
            resource: { type: 'page', id: '*' },
            actions: [{ action: 'access' }],
          },
        ]),
        updatedAt: new Date(),
      })
      .execute();

    await seed.run({ query, connection: database.connection() });
    await seed.run({ query, connection: database.connection() });

    const row = await query
      .selectFrom('authorizationPermissionSets')
      .select('grants')
      .where('key', '=', 'system-administrator')
      .executeTakeFirstOrThrow();
    expect(jsonValue(row.grants)).toEqual([
      {
        resource: { type: 'page', id: '*' },
        actions: [{ action: 'access' }],
      },
      {
        resource: { type: 'notification', id: 'test' },
        actions: [{ action: 'send' }],
      },
    ]);
  });

  it('does nothing when authorization has not created the administrator set', async () => {
    await expect(
      seed.run({
        query: database.connection().query,
        connection: database.connection(),
      }),
    ).resolves.toBeUndefined();
  });
});

function jsonValue(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

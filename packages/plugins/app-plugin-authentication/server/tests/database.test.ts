import addUserDeletionRecord from '../../database/migrations/202609170002_add_user_deletion_record.js';
// @vitest-environment node

import sqlite from '@nocobase/db-sqlite';
import type { Knex } from 'knex';
import { createDatabaseManager } from '@nocobase/db';
import { afterEach, describe, expect, it } from 'vitest';

import createAuthenticationTables from '../../database/migrations/202608200001_create_authentication_tables.js';
import addUserDisabledAt from '../../database/migrations/202609080001_add_user_disabled_at.js';

interface SqliteClient {
  readonly schema: {
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}

describe('@nocobase/app-plugin-authentication database migrations', () => {
  const databases: ReturnType<typeof createDatabaseManager>[] = [];

  afterEach(async () => {
    await Promise.all(
      databases.splice(0).map((database) => database.destroy()),
    );
  });

  it('uses provider-scoped account identities without an issuer column', async () => {
    const database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    databases.push(database);
    const connection = database.connection();
    const context = {
      builder: connection.builder,
      query: connection.query,
      connection,
    };
    await createAuthenticationTables.up(context);
    const client = await connection.client<Knex>();
    expect(await client.schema.hasColumn('account', 'issuer')).toBe(false);
    const collection = await connection.collections.get('account');
    expect(collection?.fields?.map((field) => field.name)).not.toContain(
      'issuer',
    );
    expect(collection?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'providerId', nullable: false }),
        expect.objectContaining({ name: 'accountId', nullable: false }),
      ]),
    );
    const now = new Date();
    const account = {
      accountId: 'subject-1',
      providerId: 'company-a',
      userId: 'user-1',
      createdAt: now,
      updatedAt: now,
    };
    await connection.query
      .insertInto('account')
      .values({ ...account, id: 'account-1' })
      .execute();
    await connection.query
      .insertInto('account')
      .values({ ...account, id: 'account-2', providerId: 'company-b' })
      .execute();
    await expect(
      connection.query
        .insertInto('account')
        .values({ ...account, id: 'duplicate', userId: 'user-2' })
        .execute(),
    ).rejects.toThrow();
    expect(
      await connection.query
        .selectFrom('account')
        .select(['providerId', 'accountId'])
        .execute(),
    ).toHaveLength(2);
    await createAuthenticationTables.down?.(context);
    expect(await client.schema.hasTable('account')).toBe(false);
    expect(await connection.collections.get('account')).toBeUndefined();
  });

  it('adds and removes the user disabledAt field', async () => {
    const database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    databases.push(database);
    const connection = database.connection();
    const context = {
      builder: connection.builder,
      query: connection.query,
      connection,
    };
    await createAuthenticationTables.up(context);
    await addUserDisabledAt.up(context);
    const client = await connection.client<SqliteClient>();

    await expect(client.schema.hasColumn('user', 'disabled_at')).resolves.toBe(
      true,
    );

    await connection.query
      .insertInto('user')
      .values({
        id: 'existing',
        name: 'Existing',
        email: 'existing@example.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    await addUserDeletionRecord.up(context);
    expect(await client.schema.hasColumn('user', 'deleted_at')).toBe(true);
    expect(await client.schema.hasColumn('user', 'deleted_by')).toBe(true);
    expect(
      await connection.query
        .selectFrom('user')
        .select(['id', 'deletedAt', 'deletedBy'])
        .execute(),
    ).toEqual([{ id: 'existing', deletedAt: null, deletedBy: null }]);
    await addUserDeletionRecord.down?.(context);
    expect(await client.schema.hasColumn('user', 'deleted_at')).toBe(false);
    expect(await client.schema.hasColumn('user', 'deleted_by')).toBe(false);
    expect(
      await connection.query.selectFrom('user').select('id').execute(),
    ).toEqual([{ id: 'existing' }]);
    await addUserDisabledAt.down?.(context);
    await expect(client.schema.hasColumn('user', 'disabled_at')).resolves.toBe(
      false,
    );
  });
});

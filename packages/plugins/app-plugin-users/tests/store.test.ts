import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';

import { createUserStore } from '../server/store.js';
import type { UserCondition } from '../server/store-types.js';
import { UserService } from '../server/service.js';
import {
  UserLifecycleRegistry,
  type UserLifecycleContext,
} from '../server/lifecycle.js';

const databases: DatabaseManager[] = [];

/**
 * The physical `user` table as the historical authentication migrations leave
 * it. This is a test fixture only; installing users on its own is not a
 * capability this package claims.
 */
async function setup(): Promise<DatabaseConnection> {
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  databases.push(database);
  const connection = database.connection();
  await connection.builder.createCollection('user', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('name', { length: 255 }).notNull();
    collection.string('username', { length: 255 }).nullable();
    collection.string('email', { length: 320 }).notNull();
    collection.boolean('emailVerified').notNull().defaultTo(false);
    collection.text('image').nullable();
    collection.datetime('disabledAt').nullable();
    collection.datetime('deletedAt').nullable();
    collection.string('deletedBy', { length: 64 }).nullable();
    collection.integer('loginCount').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id', { name: 'pk_user' });
    collection.unique('username', { name: 'uq_user_username' });
    collection.unique('email', { name: 'uq_user_email' });
  });
  return connection;
}

afterEach(async () => {
  for (const database of databases.splice(0)) await database.destroy();
});

function eq(field: string, value: UserCondition['value']): UserCondition {
  return { field, value, operator: 'eq', connector: 'AND', mode: 'sensitive' };
}

function record(id: string, email: string, username?: string) {
  const now = new Date();
  return {
    id,
    name: id,
    email,
    username: username ?? null,
    emailVerified: false,
    disabledAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('user store', () => {
  it('normalizes identities on create and reports the conflicting field', async () => {
    const connection = await setup();
    const store = createUserStore(connection);

    const created = await store.create({
      data: record('u1', '  Alice@Example.COM ', 'Alice.Admin'),
    });
    expect(created).toMatchObject({
      id: 'u1',
      email: 'alice@example.com',
      username: 'alice.admin',
    });
    await expect(
      store.create({ data: record('u2', 'ALICE@example.com') }),
    ).rejects.toMatchObject({ code: 'USER_EMAIL_CONFLICT' });
    await expect(
      store.create({ data: record('u3', 'other@example.com', 'ALICE.ADMIN') }),
    ).rejects.toMatchObject({ code: 'USER_USERNAME_CONFLICT' });
    await expect(
      store.create({ data: { ...record('u4', 'x@example.com'), name: '  ' } }),
    ).rejects.toThrow('User name must not be empty');
  });

  it('hides soft-deleted users from every read, including OR branches', async () => {
    const connection = await setup();
    const store = createUserStore(connection, {
      lifecycle: new UserLifecycleRegistry({ enabled: true }),
    });
    await store.create({ data: record('live', 'live@example.com') });
    await store.create({ data: record('gone', 'gone@example.com') });
    expect(await store.deleteMany({ where: [eq('id', 'gone')] })).toBe(1);

    expect(await store.findOne({ where: [eq('id', 'gone')] })).toBeNull();
    expect(
      await store.findMany<{ id: string }>({
        where: [eq('id', 'live'), { ...eq('id', 'gone'), connector: 'OR' }],
        select: ['id'],
      }),
    ).toEqual([{ id: 'live' }]);
    expect(await store.count({ where: [] })).toBe(1);
    expect(
      await store.findOne({
        where: [
          {
            field: 'email',
            value: 'GONE@EXAMPLE.COM',
            operator: 'eq',
            connector: 'AND',
            mode: 'insensitive',
          },
        ],
      }),
    ).toBeNull();
    expect(
      await store.findOne<{ id: string }>({
        where: [
          {
            field: 'email',
            value: 'LIVE@EXAMPLE.COM',
            operator: 'eq',
            connector: 'AND',
            mode: 'insensitive',
          },
        ],
        select: ['id'],
      }),
    ).toEqual({ id: 'live' });
    // The identity stays reserved after deletion.
    await expect(
      store.create({ data: record('again', 'gone@example.com') }),
    ).rejects.toMatchObject({ code: 'USER_EMAIL_CONFLICT' });
    expect(
      await store.update({ where: [eq('id', 'gone')], update: { name: 'x' } }),
    ).toBeNull();
    expect(await store.deleteMany({ where: [eq('id', 'gone')] })).toBe(0);
  });

  it('locks the row before handlers run and executes before, write, after in one transaction', async () => {
    const connection = await setup();
    const events: string[] = [];
    const lifecycle = new UserLifecycleRegistry({
      enabled: true,
      requiredHandlers: ['second'],
    });
    const seen = async (name: string, context: UserLifecycleContext) => {
      const row = await context.connection.query
        .selectFrom('user')
        .select(['deletedAt', 'disabledAt'])
        .where('id', '=', context.userId)
        .executeTakeFirstOrThrow();
      events.push(
        `${name}:${context.operation}:${row.deletedAt == null ? 'live' : 'deleted'}:${context.actorId ?? '-'}`,
      );
    };
    lifecycle.register({
      key: 'second',
      order: 10,
      before: (context) => seen('second.before', context),
      after: (context) => seen('second.after', context),
    });
    lifecycle.register({
      key: 'first',
      order: -10,
      before: (context) => seen('first.before', context),
      after: (context) => seen('first.after', context),
    });
    const users = new UserService(connection, { lifecycle });
    const user = await users.create({ name: 'Bob', email: 'bob@example.com' });

    await users.disable(user.id);
    await users.disable(user.id); // already disabled: no second lifecycle run
    await users.remove(user.id, 'operator');
    await users.remove(user.id, 'operator');

    expect(events).toEqual([
      'first.before:disable:live:-',
      'second.before:disable:live:-',
      'first.after:disable:live:-',
      'second.after:disable:live:-',
      'first.before:delete:live:operator',
      'second.before:delete:live:operator',
      'first.after:delete:deleted:operator',
      'second.after:delete:deleted:operator',
    ]);
    await expect(
      connection.query
        .selectFrom('user')
        .select(['deletedBy', 'disabledAt'])
        .where('id', '=', user.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toMatchObject({ deletedBy: 'operator' });
    expect(await users.get(user.id)).toBeUndefined();
    await expect(users.enable(user.id)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });

  it('rolls back the status write when a handler fails and refuses unconfigured deletion', async () => {
    const connection = await setup();
    const lifecycle = new UserLifecycleRegistry({
      enabled: true,
      requiredHandlers: ['guard'],
    });
    const users = new UserService(connection, { lifecycle });
    const user = await users.create({
      name: 'Carol',
      email: 'carol@example.com',
    });

    await expect(users.remove(user.id, 'operator')).rejects.toMatchObject({
      code: 'USER_DELETION_NOT_CONFIGURED',
    });
    lifecycle.register({
      key: 'guard',
      before: async ({ operation }) => {
        if (operation === 'disable') throw new Error('protected account');
      },
      after: async ({ operation }) => {
        if (operation === 'delete') throw new Error('cleanup failed');
      },
    });
    await expect(users.disable(user.id)).rejects.toThrow('protected account');
    await expect(users.remove(user.id, 'operator')).rejects.toThrow(
      'cleanup failed',
    );
    await expect(users.get(user.id)).resolves.toMatchObject({
      id: user.id,
      disabledAt: null,
    });
    // Without any registry the store never deletes.
    await expect(
      createUserStore(connection).deleteMany({ where: [eq('id', user.id)] }),
    ).rejects.toMatchObject({ code: 'USER_DELETION_NOT_CONFIGURED' });
  });

  it('updates profiles under the same constraints and keeps counters away from identity fields', async () => {
    const connection = await setup();
    const users = new UserService(connection);
    const alice = await users.create({
      name: 'Alice',
      email: 'alice@example.com',
    });
    await users.create({
      name: 'Bob',
      email: 'bob@example.com',
      username: 'bob',
    });

    await expect(
      users.updateProfile(alice.id, { email: 'BOB@example.com' }),
    ).rejects.toMatchObject({ code: 'USER_EMAIL_CONFLICT' });
    await expect(
      users.updateProfile(alice.id, { username: 'BOB' }),
    ).rejects.toMatchObject({ code: 'USER_USERNAME_CONFLICT' });
    await expect(
      users.updateProfile(alice.id, {
        email: ' Alice2@Example.com ',
        username: 'Alice',
      }),
    ).resolves.toMatchObject({
      email: 'alice2@example.com',
      username: 'alice',
    });
    await expect(
      users.updateProfile(alice.id, { username: null }),
    ).resolves.not.toHaveProperty('username');
    await expect(
      users.updateProfile('missing', { name: 'x' }),
    ).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });

    const store = createUserStore(connection);
    await expect(
      store.incrementOne({
        where: [eq('id', alice.id)],
        increment: { emailVerified: 1 },
      }),
    ).rejects.toThrow('cannot be incremented');
    await connection.query
      .updateTable('user')
      .set({ loginCount: 1 })
      .where('id', '=', alice.id)
      .execute();
    await expect(
      store.incrementOne<{ loginCount: number }>({
        where: [eq('id', alice.id)],
        increment: { loginCount: 2 },
      }),
    ).resolves.toMatchObject({ loginCount: 3 });
  });

  it('pages a stable order and counts without paging', async () => {
    const connection = await setup();
    const store = createUserStore(connection);
    for (const id of ['c', 'a', 'b']) {
      await store.create({ data: record(id, `${id}@example.com`) });
    }
    expect(
      await store.findMany<{ id: string }>({
        where: [],
        select: ['id'],
        offset: 1,
        limit: 1,
      }),
    ).toEqual([{ id: 'b' }]);
    expect(
      await store.findMany<{ id: string }>({
        where: [],
        select: ['id'],
        sortBy: { field: 'id', direction: 'desc' },
        limit: 2,
      }),
    ).toEqual([{ id: 'c' }, { id: 'b' }]);
    expect(await store.count({ where: [], limit: 1 })).toBe(3);
  });
});

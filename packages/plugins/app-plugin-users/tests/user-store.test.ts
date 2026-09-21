import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';

import type { UserStoreCondition } from '@nocobase/app-plugin-authentication';

import { createUserStore } from '../server/user-store.js';

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

function eq(
  field: string,
  value: UserStoreCondition['value'],
): UserStoreCondition {
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
    const store = createUserStore(connection);
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

  it('updates under the same identity rules and keeps counters away from identity fields', async () => {
    const connection = await setup();
    const store = createUserStore(connection);
    const alice = await store.create({
      data: record('alice', 'alice@example.com'),
    });
    await store.create({ data: record('bob', 'bob@example.com', 'bob') });

    await expect(
      store.update({
        where: [eq('id', alice.id)],
        update: { email: 'BOB@example.com' },
      }),
    ).rejects.toMatchObject({ code: 'USER_EMAIL_CONFLICT' });
    await expect(
      store.update({
        where: [eq('id', alice.id)],
        update: { username: 'BOB' },
      }),
    ).rejects.toMatchObject({ code: 'USER_USERNAME_CONFLICT' });
    await expect(
      store.update<{ email: string; username: string | null }>({
        where: [eq('id', alice.id)],
        update: { email: ' Alice2@Example.com ', username: 'Alice' },
      }),
    ).resolves.toMatchObject({
      email: 'alice2@example.com',
      username: 'alice',
    });
    expect(
      await store.updateMany({
        where: [eq('id', 'missing')],
        update: { name: 'x' },
      }),
    ).toBe(0);

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

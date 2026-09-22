// @vitest-environment node
import { fileURLToPath } from 'node:url';
import {
  createDatabaseManager,
  createMigrator,
  createSeeder,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';
import { Auth } from '../../auth.js';

const plugins = ['app-plugin-authentication', 'app-plugin-authorization'];
const sources = (kind: string) =>
  plugins.map((plugin) => ({
    packageName: `@nocobase/${plugin}`,
    directory: fileURLToPath(
      new URL(`../../../../${plugin}/database/${kind}`, import.meta.url),
    ),
  }));

describe('configured initial administrator', () => {
  const databases: ReturnType<typeof createDatabaseManager>[] = [];
  afterEach(async () => {
    await Promise.all(
      databases.splice(0).map((database) => database.destroy()),
    );
  });
  async function setup() {
    const database = createDatabaseManager({
      drivers: { sqlite },
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    databases.push(database);
    await createMigrator({ database, sources: sources('migrations') }).latest();
    return database;
  }
  function seed(
    database: ReturnType<typeof createDatabaseManager>,
    initialAdmin?: unknown,
  ) {
    return createSeeder({
      database,
      sources: sources('seeds'),
      config: {
        get<T>(key: string): T | undefined {
          return (
            key === 'users.initialAdmin'
              ? initialAdmin
              : key === 'users.initialAdmin.username' &&
                  initialAdmin &&
                  typeof initialAdmin === 'object'
                ? (initialAdmin as { username?: unknown }).username
                : undefined
          ) as T | undefined;
        },
      },
    }).run();
  }

  it.each([
    { initialAdmin: undefined, username: 'nocobase', password: 'admin123' },
    {
      initialAdmin: { username: 'Custom.Admin', password: 'custom-password' },
      username: 'custom.admin',
      password: 'custom-password',
    },
    {
      initialAdmin: { password: 'only-password' },
      username: 'nocobase',
      password: 'only-password',
    },
  ])(
    'creates working credentials and root permission for $username',
    async ({ initialAdmin, username, password }) => {
      const database = await setup();
      await seed(database, initialAdmin);
      const connection = database.connection();
      const users = await connection.query
        .selectFrom('user')
        .selectAll()
        .execute();
      expect(users).toHaveLength(1);
      expect(users[0]?.username).toBe(username);
      const accounts = await connection.query
        .selectFrom('account')
        .selectAll()
        .execute();
      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.password).not.toBe(password);
      const auth = new Auth({
        connection,
        baseURL: 'http://localhost/api/auth',
        secret: 'initial-admin-test-secret-at-least-32-characters',
      });
      const response = await auth.handler(
        new Request('http://localhost/api/auth/sign-in/username', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password }),
        }),
      );
      expect(response.status).toBe(200);
      const assignments = await connection.query
        .selectFrom('authorizationPermissionSetAssignments')
        .selectAll()
        .where('permissionSetKey', '=', 'root')
        .execute();
      expect(assignments).toHaveLength(1);
      expect(assignments[0]?.subjectId).toBe(users[0]?.id);
      await seed(database, {
        username: 'changed',
        password: 'changed-password',
      });
      expect(
        await connection.query.selectFrom('account').selectAll().execute(),
      ).toEqual(accounts);
      expect(
        await connection.query.selectFrom('user').selectAll().execute(),
      ).toEqual(users);
    },
  );

  it.each([
    {},
    { username: 'admin' },
    { password: '' },
    { password: '   ' },
    { password: 123 },
    null,
    'bad',
    { username: 'x', password: 'secret' },
  ])(
    'rejects invalid explicit config without falling back, and permits retry: %j',
    async (initialAdmin) => {
      const database = await setup();
      await expect(seed(database, initialAdmin)).rejects.toThrow(
        'users.initialAdmin',
      );
      expect(
        await database
          .connection()
          .query.selectFrom('user')
          .selectAll()
          .execute(),
      ).toEqual([]);
      expect(
        await database
          .connection()
          .query.selectFrom('account')
          .selectAll()
          .execute(),
      ).toEqual([]);
      await seed(database, { username: 'valid', password: 'valid-password' });
      expect(
        await database
          .connection()
          .query.selectFrom('user')
          .select('username')
          .execute(),
      ).toEqual([{ username: 'valid' }]);
    },
  );

  it('assigns the custom root user the Hub administrator role in the same seed run', async () => {
    const database = await setup();
    const hubSource = (kind: string) => ({
      packageName: '@nocobase/app-plugin-hub',
      directory: fileURLToPath(
        new URL(`../../../../app-plugin-hub/database/${kind}`, import.meta.url),
      ),
    });
    await createMigrator({
      database,
      sources: [hubSource('migrations')],
    }).latest();
    await createSeeder({
      database,
      sources: [...sources('seeds'), hubSource('seeds')],
      config: {
        get<T>(key: string): T | undefined {
          return (
            key === 'users.initialAdmin'
              ? { username: 'hub_admin', password: 'hub-password' }
              : key === 'users.initialAdmin.username'
                ? 'hub_admin'
                : undefined
          ) as T | undefined;
        },
      },
    }).run();
    const query = database.connection().query;
    const user = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'hub_admin')
      .executeTakeFirst();
    expect(
      await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('subjectId')
        .where('permissionSetKey', '=', 'hub-administrator')
        .execute(),
    ).toEqual([{ subjectId: user?.id }]);
  });

  it('rolls back the user if credential insertion fails and can retry', async () => {
    const database = await setup();
    const connection = database.connection();
    const client = await connection.client<Knex>();
    await client.raw(
      "CREATE TRIGGER reject_initial_credential BEFORE INSERT ON account BEGIN SELECT RAISE(ABORT, 'credential insert failed'); END",
    );
    await expect(
      seed(database, { username: 'admin', password: 'custom-password' }),
    ).rejects.toThrow('credential insert failed');
    expect(
      await connection.query.selectFrom('user').selectAll().execute(),
    ).toEqual([]);
    await client.raw('DROP TRIGGER reject_initial_credential');
    await seed(database, { username: 'admin', password: 'custom-password' });
    expect(
      await connection.query.selectFrom('account').selectAll().execute(),
    ).toHaveLength(1);
  });

  it('does not reset an existing account when credentials are configured', async () => {
    const database = await setup();
    const query = database.connection().query;
    const now = new Date();
    await query
      .insertInto('user')
      .values({
        id: 'existing',
        name: 'Existing',
        username: 'existing',
        email: 'existing@example.com',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await seed(database, { username: 'existing', password: 'new-password' });
    expect(await query.selectFrom('account').selectAll().execute()).toEqual([]);
    expect(
      await query.selectFrom('user').select(['id', 'username']).execute(),
    ).toEqual([{ id: 'existing', username: 'existing' }]);
  });
});

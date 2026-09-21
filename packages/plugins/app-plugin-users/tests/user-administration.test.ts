// @vitest-environment node
import { fileURLToPath } from 'node:url';
import {
  Auth,
  createUserAuthenticationService,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createUserAdministrationService,
  type UserAdministrationService,
} from '../server/user-administration.js';
import { createUserStore } from '../server/user-store.js';

const password = 'correct horse battery staple';

describe('user administration owns the user record', () => {
  let database: DatabaseManager;
  let auth: Auth;
  let users: UserAdministrationService;
  let router: Hono<AuthEnv>;
  const disconnectUser = vi.fn();

  beforeEach(async () => {
    disconnectUser.mockReset();
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    await createMigrator({
      database,
      packageName: '@nocobase/app-plugin-authentication',
      directory: fileURLToPath(
        new URL(
          '../../app-plugin-authentication/database/migrations',
          import.meta.url,
        ),
      ),
    }).latest();
    const connection = database.connection();
    auth = new Auth({
      connection,
      // Better Auth reads and writes users through this plugin's store.
      userStore: createUserStore,
      baseURL: 'http://localhost/api/auth',
      secret: 'development-secret-at-least-32-characters',
      appName: 'NocoBase3',
    });
    users = createUserAdministrationService({
      connection,
      credentials: createUserAuthenticationService({
        auth,
        connection,
        realtime: { disconnectUser } as never,
      }),
    });
    router = new Hono<AuthEnv>();
    router.on(['GET', 'POST'], '/api/auth/*', (context) =>
      auth.handler(context.req.raw),
    );
    router.get('/api/private', auth.required(), (context) =>
      context.json({ ok: true }),
    );
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function signIn(email: string) {
    return router.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  }

  function rows(table: 'session' | 'account', userId: string) {
    return database
      .connection()
      .query.selectFrom(table)
      .select('id')
      .where('userId', '=', userId)
      .execute();
  }

  it('creates a user with normalized identity and a working credential, and reports conflicts', async () => {
    const alice = await users.create({
      name: ' Alice ',
      username: 'Alice.Admin',
      email: 'Alice@Example.com',
      password,
    });
    expect(alice).toMatchObject({
      name: 'Alice',
      username: 'alice.admin',
      email: 'alice@example.com',
      disabledAt: null,
    });
    expect((await signIn('alice@example.com')).status).toBe(200);

    await expect(
      users.create({
        name: 'Duplicate email',
        username: 'another.user',
        email: 'ALICE@EXAMPLE.COM',
        password,
      }),
    ).rejects.toMatchObject({ code: 'USER_EMAIL_CONFLICT' });
    await expect(
      users.create({
        name: 'Duplicate username',
        username: 'ALICE.ADMIN',
        email: 'another@example.com',
        password,
      }),
    ).rejects.toMatchObject({ code: 'USER_USERNAME_CONFLICT' });
    // A refused password writes nothing.
    await expect(
      users.create({
        name: 'Short',
        email: 'short@example.com',
        password: 'x',
      }),
    ).rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
    expect((await users.list({ search: 'short' })).total).toBe(0);
    await expect(
      users.update(alice.id, { email: 'ANOTHER@example.com', username: null }),
    ).resolves.toMatchObject({ email: 'another@example.com' });
    await expect(
      users.update(alice.id, { email: 'alice@example.com' }),
    ).resolves.toMatchObject({ email: 'alice@example.com' });
  });

  it('disabling revokes sessions and blocks sign-in until the user is enabled again', async () => {
    const alice = await users.create({
      name: 'Alice',
      email: 'alice@example.com',
      password,
    });
    const signedIn = await signIn('alice@example.com');
    const cookie = signedIn.headers.get('set-cookie') ?? '';
    expect((await rows('session', alice.id)).length).toBeGreaterThan(0);

    await users.disable(alice.id);

    expect(disconnectUser).toHaveBeenCalledWith(alice.id);
    await expect(rows('session', alice.id)).resolves.toEqual([]);
    expect(
      (await router.request('/api/private', { headers: { cookie } })).status,
    ).toBe(401);
    const refused = await signIn('alice@example.com');
    expect(refused.status).toBe(403);
    await expect(refused.json()).resolves.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
    await expect(users.list({ status: 'disabled' })).resolves.toMatchObject({
      total: 1,
    });

    await users.enable(alice.id);
    expect((await signIn('alice@example.com')).status).toBe(200);
  });

  it('removing soft-deletes the user, clears credentials and keeps the identity reserved', async () => {
    const alice = await users.create({
      name: 'Alice',
      email: 'alice@example.com',
      password,
    });
    const cookie =
      (await signIn('alice@example.com')).headers.get('set-cookie') ?? '';

    await expect(users.remove(alice.id, alice.id)).rejects.toThrow(
      'You cannot delete your own account.',
    );
    await users.remove(alice.id, 'operator');
    await users.remove(alice.id, 'operator');

    expect(disconnectUser).toHaveBeenCalledWith(alice.id);
    expect(await users.get(alice.id)).toBeUndefined();
    expect((await users.list()).total).toBe(0);
    await expect(rows('session', alice.id)).resolves.toEqual([]);
    await expect(rows('account', alice.id)).resolves.toEqual([]);
    await expect(
      database
        .connection()
        .query.selectFrom('user')
        .select(['deletedBy'])
        .where('id', '=', alice.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({ deletedBy: 'operator' });
    // Better Auth no longer sees the user: the cached session is refused and
    // sign-in fails, while the email stays reserved.
    expect(
      (await router.request('/api/private', { headers: { cookie } })).status,
    ).toBe(401);
    expect((await signIn('alice@example.com')).status).toBeGreaterThanOrEqual(
      400,
    );
    await expect(
      users.create({
        name: 'Alice again',
        email: 'alice@example.com',
        password,
      }),
    ).rejects.toMatchObject({ code: 'USER_EMAIL_CONFLICT' });
    await expect(users.enable(alice.id)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
    await expect(users.resetPassword(alice.id, password)).rejects.toMatchObject(
      { code: 'USER_NOT_FOUND' },
    );
  });
});

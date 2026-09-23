// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUserAdministrationService } from '../../user-administration.js';
import { createAuthFixture } from './support.js';

describe('user administration', () => {
  const fixtures: Awaited<ReturnType<typeof createAuthFixture>>[] = [];
  const setup = async () => {
    const fixture = await createAuthFixture();
    fixtures.push(fixture);
    const disconnectUser = vi.fn();
    const users = createUserAdministrationService({
      auth: fixture.auth,
      connection: fixture.connection,
      realtime: { disconnectUser } as never,
    });
    return { ...fixture, users, disconnectUser };
  };
  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((fixture) => fixture.dispose()));
  });

  it('reports stable conflicts for duplicate email and username', async () => {
    const { users, signUp } = await setup();
    await signUp();
    await expect(
      users.create({
        name: 'Duplicate email',
        username: 'another.user',
        email: 'ALICE@EXAMPLE.COM',
        password: 'strong-password',
      }),
    ).rejects.toMatchObject({ code: 'USER_EMAIL_CONFLICT' });
    await expect(
      users.create({
        name: 'Duplicate username',
        username: 'ALICE.ADMIN',
        email: 'another@example.com',
        password: 'strong-password',
      }),
    ).rejects.toMatchObject({ code: 'USER_USERNAME_CONFLICT' });
  });

  it('updates an identity without treating its own values as conflicts', async () => {
    const { users, signUp, connection } = await setup();
    await signUp();
    const alice = await connection.query
      .selectFrom('user')
      .select('id')
      .where('email', '=', 'alice@example.com')
      .executeTakeFirstOrThrow();
    const bob = await users.create({
      name: 'Bob',
      username: 'bob',
      email: 'bob@example.com',
      password: 'strong-password',
    });
    await expect(
      users.update(String(alice.id), {
        email: 'ALICE@EXAMPLE.COM',
        username: 'ALICE.ADMIN',
      }),
    ).resolves.toMatchObject({
      email: 'alice@example.com',
      username: 'alice.admin',
    });
    await expect(
      users.update(String(alice.id), { email: bob.email }),
    ).rejects.toMatchObject({ code: 'USER_EMAIL_CONFLICT' });
    await expect(
      users.update(String(alice.id), { username: bob.username }),
    ).rejects.toMatchObject({ code: 'USER_USERNAME_CONFLICT' });
    await expect(
      users.update('unknown', { name: 'Nobody' }),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('disables a user, revokes sessions, disconnects realtime, and permits login after enabling', async () => {
    const { users, signUp, connection, router, disconnectUser } = await setup();
    const { cookie } = await signUp();
    const user = await connection.query
      .selectFrom('user')
      .select('id')
      .where('email', '=', 'alice@example.com')
      .executeTakeFirstOrThrow();
    const id = String(user.id);
    expect(
      (await router.request('/private', { headers: { cookie } })).status,
    ).toBe(200);
    await users.disable(id);
    expect(disconnectUser).toHaveBeenCalledWith(id);
    expect(
      await connection.query
        .selectFrom('session')
        .select('id')
        .where('userId', '=', id)
        .execute(),
    ).toEqual([]);
    expect(
      (await router.request('/private', { headers: { cookie } })).status,
    ).toBe(401);
    await users.enable(id);
    const response = await router.request('/api/auth/sign-in/username', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'alice.admin',
        password: 'correct horse battery staple',
      }),
    });
    expect(response.status).toBe(200);
  });

  it('validates a new password and revokes existing sessions after reset', async () => {
    const { users, signUp, connection, router } = await setup();
    const { cookie } = await signUp();
    const user = await connection.query
      .selectFrom('user')
      .select('id')
      .where('email', '=', 'alice@example.com')
      .executeTakeFirstOrThrow();
    const id = String(user.id);
    await expect(users.resetPassword(id, 'short')).rejects.toMatchObject({
      code: 'PASSWORD_TOO_SHORT',
    });
    await users.resetPassword(id, 'replacement-password');
    expect(
      (await router.request('/private', { headers: { cookie } })).status,
    ).toBe(401);
    const response = await router.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'replacement-password',
      }),
    });
    expect(response.status).toBe(200);
  });

  it('adds credential login when resetting a user who has no password account', async () => {
    const { users, connection, router } = await setup();
    await connection.query
      .insertInto('user')
      .values({
        id: 'sso-user',
        name: 'SSO User',
        username: 'sso-user',
        email: 'sso@example.com',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    await users.resetPassword('sso-user', 'replacement-password');
    const response = await router.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'sso@example.com',
        password: 'replacement-password',
      }),
    });
    expect(response.status).toBe(200);
  });

  it('soft deletes another user and removes login records', async () => {
    const { users, signUp, connection, disconnectUser } = await setup();
    await signUp();
    const user = await connection.query
      .selectFrom('user')
      .select('id')
      .where('email', '=', 'alice@example.com')
      .executeTakeFirstOrThrow();
    const id = String(user.id);
    await expect(users.remove(id, id)).rejects.toThrow(
      'You cannot delete your own account',
    );
    await users.remove(id, 'actor');
    expect(await users.get(id)).toBeUndefined();
    expect(
      await connection.query
        .selectFrom('user')
        .select(['deletedAt', 'deletedBy'])
        .where('id', '=', id)
        .executeTakeFirst(),
    ).toMatchObject({
      deletedAt: expect.any(String),
      deletedBy: 'actor',
    });
    expect(
      await connection.query
        .selectFrom('account')
        .select('id')
        .where('userId', '=', id)
        .execute(),
    ).toEqual([]);
    expect(disconnectUser).toHaveBeenCalledWith(id);
  });

  it('filters and pages users by status and search', async () => {
    const { users } = await setup();
    const alice = await users.create({
      name: 'Alice',
      username: 'alice',
      email: 'alice@example.com',
      password: 'strong-password',
    });
    await users.create({
      name: 'Bob',
      username: 'bob',
      email: 'bob@example.com',
      password: 'strong-password',
    });
    await users.disable(alice.id);
    expect(
      (await users.list({ status: 'disabled' })).items.map((user) => user.id),
    ).toEqual([alice.id]);
    expect(
      (await users.list({ search: 'bob' })).items.map((user) => user.name),
    ).toEqual(['Bob']);
    const page = await users.list({ pageSize: 1, page: 2 });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
  });
});

import { fileURLToPath } from 'node:url';

import { createDatabaseManager, createMigrator } from '@nocobase/database';
import { Hono } from 'hono';
import type { Knex } from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Auth, type AuthEnv } from '../../../index.js';
import { databaseAdapter } from '../../better-auth/database-adapter.js';

async function migrateAuthentication(
  database: ReturnType<typeof createDatabaseManager>,
): Promise<void> {
  const migrator = createMigrator({
    database,
    packageName: '@nocobase/app-plugin-authentication',
    directory: fileURLToPath(
      new URL('../../../database/migrations', import.meta.url),
    ),
  });
  await migrator.latest();
}

describe('Authentication', () => {
  const database = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: ':memory:',
      },
    },
  });
  const app = new Hono<AuthEnv>();
  let cookie = '';

  beforeAll(async () => {
    const connection = database.connection();
    await migrateAuthentication(database);

    const auth = new Auth({
      connection,
      baseURL: 'http://localhost/api/auth',
      secret: 'development-secret-at-least-32-characters',
      appName: 'NocoBase3',
      advanced: {
        cookiePrefix: 'nocobase3',
        defaultCookieAttributes: { path: '/test-app' },
      },
    });

    app.on(['GET', 'POST'], '/api/auth/*', (context) =>
      auth.handler(context.req.raw),
    );
    app.get('/api/private', auth.required(), (context) =>
      context.json({ ok: true, auth: context.get('auth') }),
    );
    app.get('/api/optional', auth.optional(), (context) =>
      context.json({ auth: context.get('auth') }),
    );
  });

  it('requires an explicit authentication secret', () => {
    expect(() => new Auth({ connection: database.connection() })).toThrow(
      'Authentication secret is required',
    );
  });

  afterAll(async () => {
    await database.destroy();
  });

  it('signs up and resolves the Better Auth session', async () => {
    const signedUp = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'correct horse battery staple',
        name: 'Alice',
        username: 'Alice.Admin',
      }),
    });

    expect(signedUp.status).toBe(200);
    expect(await signedUp.json()).toMatchObject({
      user: {
        email: 'alice@example.com',
        name: 'Alice',
        username: 'alice.admin',
      },
    });
    cookie = signedUp.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('nocobase3.session_token');
    expect(cookie).toContain('Path=/test-app');

    const session = await app.request('/api/auth/get-session', {
      headers: { cookie },
    });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({
      user: { email: 'alice@example.com' },
    });
  });

  it('signs in with a normalized username without a display username field', async () => {
    const response = await app.request('/api/auth/sign-in/username', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'ALICE.ADMIN',
        password: 'correct horse battery staple',
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { name: 'Alice', username: 'alice.admin' },
    });

    const knex = await database.connection().client<Knex>();
    expect(await knex.schema.hasColumn('user', 'username')).toBe(true);
    expect(await knex.schema.hasColumn('user', 'display_username')).toBe(false);
    expect(await knex.schema.hasColumn('user', 'displayUsername')).toBe(false);
  });

  it('keeps authentication relations free of physical foreign keys', async () => {
    const knex = await database.connection().client<Knex>();
    const tables = ['session', 'account'];
    for (const table of tables) {
      expect(await knex.raw(`PRAGMA foreign_key_list(${table})`)).toEqual([]);
    }
  });

  it('exposes the Better Auth session to protected routes', async () => {
    const response = await app.request('/api/private', { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      auth: {
        user: { id: expect.any(String), email: 'alice@example.com' },
        session: { id: expect.any(String), userId: expect.any(String) },
      },
    });
  });

  it('supports optional sessions', async () => {
    const anonymous = await app.request('/api/optional');
    expect(anonymous.status).toBe(200);
    expect(await anonymous.json()).toEqual({ auth: null });

    const authenticated = await app.request('/api/optional', {
      headers: { cookie },
    });
    expect(authenticated.status).toBe(200);
    expect(await authenticated.json()).toMatchObject({
      auth: {
        user: { id: expect.any(String) },
        session: { id: expect.any(String) },
      },
    });
  });

  it('matches email credentials case-insensitively', async () => {
    const response = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'ALICE@EXAMPLE.COM',
        password: 'correct horse battery staple',
      }),
    });
    expect(response.status).toBe(200);

    const factory = databaseAdapter(database.connection());
    const adapter = factory({
      database: factory,
      secret: 'development-secret-at-least-32-characters',
    });
    await expect(
      adapter.findOne({
        model: 'user',
        where: [
          { field: 'email', value: 'ALICE@EXAMPLE.COM', mode: 'insensitive' },
        ],
      }),
    ).resolves.toMatchObject({ email: 'alice@example.com' });
  });

  it('rejects invalid credentials', async () => {
    const response = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'wrong-password',
      }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'INVALID_EMAIL_OR_PASSWORD',
    });
  });

  it('requires a session on protected routes', async () => {
    const response = await app.request('/api/private');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  });
});

describe('Authentication naming strategy', () => {
  it('supports underscored: false', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
          naming: { underscored: false },
        },
      },
    });

    try {
      const connection = database.connection();
      await migrateAuthentication(database);
      const auth = new Auth({
        connection,
        baseURL: 'http://localhost/api/auth',
        secret: 'development-secret-at-least-32-characters',
      });
      const app = new Hono();
      app.on(['GET', 'POST'], '/api/auth/*', (context) =>
        auth.handler(context.req.raw),
      );

      const response = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'camel@example.com',
          password: 'correct horse battery staple',
          name: 'Camel Case',
          username: 'CamelCase',
        }),
      });
      expect(response.status).toBe(200);
      await expect(
        connection.query
          .selectFrom('user')
          .select(['name', 'username'])
          .where('email', '=', 'camel@example.com')
          .executeTakeFirst(),
      ).resolves.toEqual({ name: 'Camel Case', username: 'camelcase' });
      await expect(
        connection.query
          .selectFrom('session')
          .select(['userId', 'expiresAt'])
          .executeTakeFirst(),
      ).resolves.toMatchObject({ userId: expect.any(String) });

      const factory = databaseAdapter(connection);
      const adapter = factory({
        database: factory,
        secret: 'development-secret-at-least-32-characters',
      });
      await expect(
        adapter.findOne({
          model: 'user',
          where: [
            { field: 'email', value: 'CAMEL@EXAMPLE.COM', mode: 'insensitive' },
          ],
        }),
      ).resolves.toMatchObject({ email: 'camel@example.com' });
    } finally {
      await database.destroy();
    }
  });
});

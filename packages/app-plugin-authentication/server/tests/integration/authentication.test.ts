// @vitest-environment node

import { fileURLToPath } from 'node:url';

import {
  createDatabaseManager,
  createMigrator,
  createSeeder,
} from '@nocobase/app-database';
import { Hono } from 'hono';
import type { Knex } from 'knex';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  Auth,
  type AuthEnv,
  PasswordUserCreationError,
} from '../../../index.js';
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

async function seedAuthentication(
  database: ReturnType<typeof createDatabaseManager>,
): Promise<void> {
  const seeder = createSeeder({
    database,
    sources: [
      {
        packageName: '@nocobase/app-plugin-authentication',
        directory: fileURLToPath(
          new URL('../../../database/seeds', import.meta.url),
        ),
      },
    ],
  });
  await seeder.run();
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

describe('Authentication transactional password user creation', () => {
  it('creates a login-capable user in the caller transaction without a session', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });

    try {
      await migrateAuthentication(database);
      const auth = new Auth({
        connection: database.connection(),
        baseURL: 'http://localhost/api/auth',
        secret: 'development-secret-at-least-32-characters',
      });

      const user = await database.connection().transaction((connection) =>
        auth.createPasswordUser(
          {
            email: 'INVITED@EXAMPLE.COM',
            password: 'correct horse battery staple',
            name: 'Invited Member',
            username: 'Invited.Member',
          },
          { connection },
        ),
      );

      expect(user).toMatchObject({
        id: expect.any(String),
        email: 'invited@example.com',
        name: 'Invited Member',
        username: 'invited.member',
      });
      await expect(
        database
          .connection()
          .query.selectFrom('user')
          .select(['id', 'email', 'username'])
          .where('id', '=', user.id)
          .executeTakeFirst(),
      ).resolves.toMatchObject({
        id: user.id,
        email: 'invited@example.com',
        username: 'invited.member',
      });
      await expect(
        database
          .connection()
          .query.selectFrom('account')
          .select(['issuer', 'accountId', 'providerId', 'userId', 'password'])
          .where('userId', '=', user.id)
          .executeTakeFirst(),
      ).resolves.toMatchObject({
        issuer: 'local:credential',
        accountId: user.id,
        providerId: 'credential',
        userId: user.id,
        password: expect.any(String),
      });
      await expect(
        database
          .connection()
          .query.selectFrom('session')
          .select('id')
          .execute(),
      ).resolves.toEqual([]);

      const app = new Hono();
      app.on(['GET', 'POST'], '/api/auth/*', (context) =>
        auth.handler(context.req.raw),
      );
      const response = await app.request('/api/auth/sign-in/username', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'INVITED.MEMBER',
          password: 'correct horse battery staple',
        }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        user: { id: user.id, email: 'invited@example.com' },
      });
    } finally {
      await database.destroy();
    }
  });

  it('rolls back both the user and credential account with the caller transaction', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });

    try {
      await migrateAuthentication(database);
      const auth = new Auth({
        connection: database.connection(),
        baseURL: 'http://localhost/api/auth',
        secret: 'development-secret-at-least-32-characters',
      });

      await expect(
        database.connection().transaction(async (connection) => {
          await auth.createPasswordUser(
            {
              email: 'rollback@example.com',
              password: 'correct horse battery staple',
              name: 'Rollback Member',
              username: 'rollback.member',
            },
            { connection },
          );
          throw new Error('abort transaction');
        }),
      ).rejects.toThrow('abort transaction');

      await expect(
        database.connection().query.selectFrom('user').select('id').execute(),
      ).resolves.toEqual([]);
      await expect(
        database
          .connection()
          .query.selectFrom('account')
          .select('id')
          .execute(),
      ).resolves.toEqual([]);
    } finally {
      await database.destroy();
    }
  });

  it('rejects a duplicate email before invoking sign-up side effects', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });
    const sendVerificationEmail = vi.fn(async () => undefined);
    const onExistingUserSignUp = vi.fn(async () => undefined);

    try {
      await migrateAuthentication(database);
      const auth = new Auth({
        connection: database.connection(),
        baseURL: 'http://localhost/api/auth',
        secret: 'development-secret-at-least-32-characters',
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: true,
          onExistingUserSignUp,
        },
        emailVerification: {
          sendOnSignUp: true,
          sendVerificationEmail,
        },
      });

      await database.connection().transaction((connection) =>
        auth.createPasswordUser(
          {
            email: 'member@example.com',
            password: 'correct horse battery staple',
            name: 'First Member',
            username: 'first.member',
          },
          { connection },
        ),
      );
      const duplicate = await database
        .connection()
        .transaction((connection) =>
          auth.createPasswordUser(
            {
              email: 'MEMBER@EXAMPLE.COM',
              password: 'a different valid password',
              name: 'Duplicate Member',
              username: 'duplicate.member',
            },
            { connection },
          ),
        )
        .catch((error: unknown) => error);

      expect(duplicate).toBeInstanceOf(PasswordUserCreationError);
      expect(duplicate).toMatchObject({
        name: 'PasswordUserCreationError',
        code: 'EMAIL_ALREADY_EXISTS',
      });
      expect(sendVerificationEmail).not.toHaveBeenCalled();
      expect(onExistingUserSignUp).not.toHaveBeenCalled();
      await expect(
        database.connection().query.selectFrom('user').select('id').execute(),
      ).resolves.toHaveLength(1);
      await expect(
        database
          .connection()
          .query.selectFrom('verification')
          .select('id')
          .execute(),
      ).resolves.toEqual([]);
      await expect(
        database
          .connection()
          .query.selectFrom('session')
          .select('id')
          .execute(),
      ).resolves.toEqual([]);
    } finally {
      await database.destroy();
    }
  });

  it('returns stable errors for duplicate and invalid usernames', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });

    try {
      await migrateAuthentication(database);
      const auth = new Auth({
        connection: database.connection(),
        baseURL: 'http://localhost/api/auth',
        secret: 'development-secret-at-least-32-characters',
      });
      await database.connection().transaction((connection) =>
        auth.createPasswordUser(
          {
            email: 'first@example.com',
            password: 'correct horse battery staple',
            name: 'First Member',
            username: 'Shared.Name',
          },
          { connection },
        ),
      );

      const duplicate = await database
        .connection()
        .transaction((connection) =>
          auth.createPasswordUser(
            {
              email: 'second@example.com',
              password: 'correct horse battery staple',
              name: 'Second Member',
              username: 'SHARED.NAME',
            },
            { connection },
          ),
        )
        .catch((error: unknown) => error);
      expect(duplicate).toBeInstanceOf(PasswordUserCreationError);
      expect(duplicate).toMatchObject({ code: 'USERNAME_ALREADY_EXISTS' });

      const invalid = await database
        .connection()
        .transaction((connection) =>
          auth.createPasswordUser(
            {
              email: 'invalid@example.com',
              password: 'correct horse battery staple',
              name: 'Invalid Member',
              username: 'invalid username!',
            },
            { connection },
          ),
        )
        .catch((error: unknown) => error);
      expect(invalid).toBeInstanceOf(PasswordUserCreationError);
      expect(invalid).toMatchObject({ code: 'INVALID_USERNAME' });

      await expect(
        database.connection().query.selectFrom('user').select('id').execute(),
      ).resolves.toHaveLength(1);
      await expect(
        database
          .connection()
          .query.selectFrom('account')
          .select('id')
          .execute(),
      ).resolves.toHaveLength(1);
    } finally {
      await database.destroy();
    }
  });

  it('uses the configured password hashing and verification functions', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });
    const hash = vi.fn(
      async (password: string): Promise<string> => `custom:${password}`,
    );
    const verify = vi.fn(
      async (input: { hash: string; password: string }): Promise<boolean> =>
        input.hash === `custom:${input.password}`,
    );

    try {
      await migrateAuthentication(database);
      const auth = new Auth({
        connection: database.connection(),
        baseURL: 'http://localhost/api/auth',
        secret: 'development-secret-at-least-32-characters',
        emailAndPassword: { enabled: true, password: { hash, verify } },
      });
      const password = 'correct horse battery staple';
      const user = await database.connection().transaction((connection) =>
        auth.createPasswordUser(
          {
            email: 'custom-hash@example.com',
            password,
            name: 'Custom Hash',
            username: 'custom.hash',
          },
          { connection },
        ),
      );

      expect(hash).toHaveBeenCalledExactlyOnceWith(password);
      await expect(
        database
          .connection()
          .query.selectFrom('account')
          .select('password')
          .where('userId', '=', user.id)
          .executeTakeFirst(),
      ).resolves.toEqual({ password: `custom:${password}` });
      await expect(
        database
          .connection()
          .query.selectFrom('session')
          .select('id')
          .execute(),
      ).resolves.toEqual([]);

      const response = await auth.handler(
        new Request('http://localhost/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: 'custom-hash@example.com',
            password,
          }),
        }),
      );
      expect(response.status).toBe(200);
      expect(verify).toHaveBeenCalledWith({
        hash: `custom:${password}`,
        password,
      });
    } finally {
      await database.destroy();
    }
  });

  it('rejects and rolls back a missing credential account', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });

    try {
      await migrateAuthentication(database);
      const auth = new Auth({
        connection: database.connection(),
        baseURL: 'http://localhost/api/auth',
        secret: 'development-secret-at-least-32-characters',
        databaseHooks: {
          account: { create: { before: async () => false } },
        },
      });

      const error = await database
        .connection()
        .transaction((connection) =>
          auth.createPasswordUser(
            {
              email: 'missing-account@example.com',
              password: 'correct horse battery staple',
              name: 'Missing Account',
              username: 'missing.account',
            },
            { connection },
          ),
        )
        .catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(PasswordUserCreationError);
      expect(error).toMatchObject({
        name: 'PasswordUserCreationError',
        code: 'CREDENTIAL_ACCOUNT_NOT_PERSISTED',
      });
      await expect(
        database.connection().query.selectFrom('user').select('id').execute(),
      ).resolves.toEqual([]);
      await expect(
        database
          .connection()
          .query.selectFrom('account')
          .select('id')
          .execute(),
      ).resolves.toEqual([]);
    } finally {
      await database.destroy();
    }
  });

  it('rolls back a missing credential account when given a regular connection', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });

    try {
      await migrateAuthentication(database);
      const auth = new Auth({
        connection: database.connection(),
        baseURL: 'http://localhost/api/auth',
        secret: 'development-secret-at-least-32-characters',
        databaseHooks: {
          account: { create: { before: async () => false } },
        },
      });

      const error = await auth
        .createPasswordUser(
          {
            email: 'regular-connection@example.com',
            password: 'correct horse battery staple',
            name: 'Regular Connection',
            username: 'regular.connection',
          },
          { connection: database.connection() },
        )
        .catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(PasswordUserCreationError);
      expect(error).toMatchObject({
        name: 'PasswordUserCreationError',
        code: 'CREDENTIAL_ACCOUNT_NOT_PERSISTED',
      });
      await expect(
        database.connection().query.selectFrom('user').select('id').execute(),
      ).resolves.toEqual([]);
      await expect(
        database
          .connection()
          .query.selectFrom('account')
          .select('id')
          .execute(),
      ).resolves.toEqual([]);
    } finally {
      await database.destroy();
    }
  });

  it('creates an invited password user that can sign in when verification is required', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });
    const sendVerificationEmail = vi.fn(async () => undefined);

    try {
      await migrateAuthentication(database);
      const auth = new Auth({
        connection: database.connection(),
        baseURL: 'http://localhost/api/auth',
        secret: 'development-secret-at-least-32-characters',
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: true,
        },
        emailVerification: {
          sendOnSignUp: true,
          sendVerificationEmail,
        },
      });

      const user = await database.connection().transaction((connection) =>
        auth.createPasswordUser(
          {
            email: 'verified-invitation@example.com',
            password: 'correct horse battery staple',
            name: 'Verified Invitation',
            username: 'verified.invitation',
          },
          { connection },
        ),
      );

      expect(Boolean(user.emailVerified)).toBe(true);
      expect(sendVerificationEmail).not.toHaveBeenCalled();
      const response = await auth.handler(
        new Request('http://localhost/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: 'verified-invitation@example.com',
            password: 'correct horse battery staple',
          }),
        }),
      );
      expect(response.status).toBe(200);
      const signedIn = await response.json();
      expect(signedIn.user.id).toBe(user.id);
      expect(Boolean(signedIn.user.emailVerified)).toBe(true);
    } finally {
      await database.destroy();
    }
  });
});

describe('Authentication seed', () => {
  it('creates the default admin with working hashed credentials', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });

    try {
      await migrateAuthentication(database);
      await seedAuthentication(database);

      const connection = database.connection();
      const user = await connection.query
        .selectFrom('user')
        .select(['id', 'name', 'username', 'email', 'emailVerified'])
        .where('email', '=', 'admin@nocobase.com')
        .executeTakeFirst();
      expect(user).toMatchObject({
        name: 'nocobase',
        username: 'nocobase',
        email: 'admin@nocobase.com',
        emailVerified: 1,
      });

      const account = await connection.query
        .selectFrom('account')
        .select(['issuer', 'accountId', 'providerId', 'userId', 'password'])
        .where('userId', '=', user?.id)
        .executeTakeFirst();
      expect(account).toMatchObject({
        issuer: 'local:credential',
        accountId: user?.id,
        providerId: 'credential',
        userId: user?.id,
      });
      expect(account?.password).not.toBe('admin123');

      const auth = new Auth({
        connection,
        baseURL: 'http://localhost/api/auth',
        secret: 'development-secret-at-least-32-characters',
      });
      const app = new Hono();
      app.on(['GET', 'POST'], '/api/auth/*', (context) =>
        auth.handler(context.req.raw),
      );

      const response = await app.request('/api/auth/sign-in/username', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'nocobase',
          password: 'admin123',
        }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        user: {
          name: 'nocobase',
          username: 'nocobase',
          email: 'admin@nocobase.com',
        },
      });
    } finally {
      await database.destroy();
    }
  });

  it('does not add a default credential to an existing installation', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });

    try {
      await migrateAuthentication(database);
      const now = new Date();
      await database
        .connection()
        .query.insertInto('user')
        .values({
          id: crypto.randomUUID(),
          name: 'Existing User',
          username: 'existing',
          email: 'existing@example.com',
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      await seedAuthentication(database);

      await expect(
        database
          .connection()
          .query.selectFrom('user')
          .select('id')
          .where('email', '=', 'admin@nocobase.com')
          .executeTakeFirst(),
      ).resolves.toBeUndefined();
      await expect(
        database
          .connection()
          .query.selectFrom('account')
          .select('id')
          .execute(),
      ).resolves.toEqual([]);
    } finally {
      await database.destroy();
    }
  });
});

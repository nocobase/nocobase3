import { fileURLToPath } from 'node:url';
import { createCaching } from '@nocobase/caching';
import { createDatabaseManager, createMigrator } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { Hono } from 'hono';
import { Auth, type AuthEnv, type AuthOptions } from '../../auth.js';
import { createAuthStorage } from '../../auth-storage.js';

export const testSecret = 'development-secret-at-least-32-characters';

export async function createAuthFixture(
  options: Partial<Omit<AuthOptions, 'connection'>> = {},
) {
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  await createMigrator({
    database,
    packageName: '@nocobase/app-plugin-authentication',
    directory: fileURLToPath(
      new URL('../../../database/migrations', import.meta.url),
    ),
  }).latest();
  const caching = createCaching();
  const connection = database.connection();
  const auth = new Auth({
    connection,
    baseURL: 'http://localhost/api/auth',
    secret: testSecret,
    advanced: { cookiePrefix: 'nocobase3' },
    secondaryStorage: createAuthStorage(caching),
    session: { storeSessionInDatabase: true },
    ...options,
  });
  const router = new Hono<AuthEnv>();
  router.on(['GET', 'POST'], '/api/auth/*', (context) =>
    auth.handler(context.req.raw),
  );
  router.get('/private', auth.required(), (context) =>
    context.json({ auth: context.get('auth') }),
  );
  router.post('/private', auth.required(), (context) =>
    context.json({ ok: true }),
  );
  router.get('/optional', auth.optional(), (context) =>
    context.json({ auth: context.get('auth') }),
  );
  router.post('/optional', auth.optional(), (context) =>
    context.json({ ok: true }),
  );
  router.post('/skipped', auth.required({ skip: () => true }), (context) =>
    context.json({ ok: true }),
  );

  async function signUp(
    input: { email?: string; username?: string; password?: string } = {},
  ) {
    const response = await router.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: input.email ?? 'alice@example.com',
        username: input.username ?? 'Alice.Admin',
        password: input.password ?? 'correct horse battery staple',
        name: 'Alice',
      }),
    });
    return { response, cookie: response.headers.get('set-cookie') ?? '' };
  }

  return {
    auth,
    connection,
    database,
    router,
    signUp,
    async dispose() {
      await caching.dispose();
      await database.destroy();
    },
  };
}

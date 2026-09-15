import path from 'node:path';
import { Auth, authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  createAppAuthorization,
  type AppAuthorizationService,
} from '@nocobase/app-plugin-authorization';
import { createApiClient, type ApiClient } from '@nocobase/app-client';
import { createConfigPaths } from '@nocobase/app-server/config';
import {
  createDatabaseManager,
  databaseManagerToken,
  type DatabaseManager,
  type QueryAdapter,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { vi } from 'vitest';
import grantSeed from '../database/seeds/202609150002_authorization_example_grant_members.js';
import { AuthorizationExampleProvider } from '../server/providers/authorization-example.js';
import { apiRoutes, createRoutes } from '../server/routes/index.js';

/** The Permission Set `createAppAuthorization` protects as unrestricted. */
const ROOT_SET = 'root';

export interface FixtureOptions {
  /** Leave the example's Permission Set unseeded to test an ungranted caller. */
  grant?: boolean;
  /** Give this user id the root set, which bypasses every grant. */
  root?: string;
}

export interface Fixture {
  readonly database: DatabaseManager;
  readonly authorization: AppAuthorizationService;
  readonly router: Hono;
  /** An API client signed in as `userId`. */
  client(userId: string): ApiClient;
}

export async function createFixture(
  options: FixtureOptions = {},
): Promise<Fixture> {
  const database = createDatabaseManager({
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  await database
    .createMigrator({
      directory: path.resolve(import.meta.dirname, '../database/migrations'),
      packageName: '@nocobase/app-plugin-authorization-example',
    })
    .latest();
  // The routes are authorized, so the tables the grants live in have to be in
  // place before a request reaches them. Its own ledger, so this example's
  // migrator never sees these entries.
  await database
    .createMigrator({
      directory: path.resolve(
        import.meta.dirname,
        '../../../plugins/app-plugin-authorization/database/migrations',
      ),
      packageName: '@nocobase/app-plugin-authorization',
      tableName: 'authorizationMigrations',
    })
    .latest();
  const connection = database.connection();
  if (options.grant !== false)
    await grantSeed.run({ query: connection.query, connection });
  if (options.root) await grantRootSet(connection.query, options.root);

  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
  const authorization = createAppAuthorization({ connection });
  container.instance(authorizationToken, authorization);
  const authentication = new Auth({
    connection,
    secret: 'authorization-example-test-secret-at-least-32-characters',
    baseURL: 'http://example.test',
  });
  vi.spyOn(authentication, 'getSession').mockImplementation(async (headers) => {
    const id = headers.get('x-test-user');
    if (!id) return null;
    return {
      user: {
        id,
        name: id,
        email: `${id}@example.test`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {
        id: `session-${id}`,
        token: `token-${id}`,
        userId: id,
        expiresAt: new Date(Date.now() + 60000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  });
  container.instance(authenticationToken, authentication);

  const router = new Hono();
  const app = {
    appName: 'example',
    publicBasePath: '/main',
    config: { app: { name: 'example', publicBasePath: '/main' } },
    paths: createConfigPaths({ rootDir: '/tmp/authorization-example' }),
    container,
    router,
  };
  // The provider registers the Collection at boot; the routes only authorize.
  await new AuthorizationExampleProvider(app).boot();
  for (const contribution of [apiRoutes, createRoutes])
    router.route('/main/api', await contribution.createRouter(app));

  return {
    database,
    authorization,
    router,
    client: (userId) =>
      createApiClient({
        baseURL: 'http://example.test/main/api',
        headers: { 'x-test-user': userId },
        fetch: async (input, init) => router.fetch(new Request(input, init)),
      }),
  };
}

/** The root set confers unrestricted access; holding it skips every grant. */
async function grantRootSet(
  query: QueryAdapter,
  userId: string,
): Promise<void> {
  const now = new Date();
  await query
    .insertInto('authorizationPermissionSets')
    .values({
      id: crypto.randomUUID(),
      key: ROOT_SET,
      title: 'Root',
      grants: JSON.stringify([]),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id: `user:${userId}:${ROOT_SET}`,
      subjectType: 'user',
      subjectId: userId,
      permissionSetKey: ROOT_SET,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

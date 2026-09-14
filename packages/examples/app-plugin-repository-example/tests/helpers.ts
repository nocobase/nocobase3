import path from 'node:path';
import { createDatabaseManager, databaseManagerToken } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { Auth, authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  createAppAuthorization,
  databaseAuthorization,
} from '@nocobase/app-plugin-authorization';
import { createConfigPaths } from '@nocobase/app-server/config';
import { ServiceContainer } from '@nocobase/service-provider';
import { createApiClient } from '@nocobase/app-client';
import { Hono } from 'hono';
import { vi } from 'vitest';
import grantSeed from '../database/seeds/202609140001_repository_example_grant_members.js';
import { apiRoutes } from '../server/routes/index.js';

export interface FixtureOptions {
  /** Leave the example's Permission Set unseeded to test an ungranted caller. */
  grant?: boolean;
}

export async function createFixture(options: FixtureOptions = {}) {
  const database = createDatabaseManager({
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  const migrator = database.createMigrator({
    directory: path.resolve(import.meta.dirname, '../database/migrations'),
    packageName: '@nocobase/app-plugin-repository-example',
  });
  await migrator.latest();
  // The routes are authorized, so the tables the grants live in and the seed
  // that writes them have to be in place before a request reaches them.
  await database
    .createMigrator({
      directory: path.resolve(
        import.meta.dirname,
        '../../../plugins/app-plugin-authorization/database/migrations',
      ),
      packageName: '@nocobase/app-plugin-authorization',
      // Its own ledger, so this example's migrator never sees these entries.
      tableName: 'authorizationMigrations',
    })
    .latest();
  const connection = database.connection();
  if (options.grant !== false)
    await grantSeed.run({ query: connection.query, connection });
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
  container.instance(
    authorizationToken,
    createAppAuthorization({
      connection,
      config: { plugins: [databaseAuthorization()] },
    }),
  );
  const authentication = new Auth({
    connection: database.connection(),
    secret: 'repository-example-test-secret-at-least-32-characters',
    baseURL: 'http://example.test',
  });
  vi.spyOn(authentication, 'getSession').mockImplementation(async (headers) =>
    headers.get('x-test-user')
      ? {
          user: {
            id: 'tester',
            name: 'Tester',
            email: 'tester@example.test',
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          session: {
            id: 'test-session',
            token: 'test-token',
            userId: 'tester',
            expiresAt: new Date(Date.now() + 60000),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }
      : null,
  );
  container.instance(authenticationToken, authentication);
  const router = new Hono();
  const app = {
    appName: 'example',
    publicBasePath: '/main',
    config: { app: { name: 'example', publicBasePath: '/main' } },
    paths: createConfigPaths({ rootDir: '/tmp/repository-example' }),
    container,
    router,
  };
  router.route('/main/api', await apiRoutes.createRouter(app));
  router.get('/main/api/unrelated', (context) => context.json({ ok: true }));
  const requests: { path: string; body: unknown; accept: string | null }[] = [];
  const api = createApiClient({
    baseURL: 'http://example.test/main/api',
    headers: { 'x-test-user': 'tester' },
    fetch: async (input, init) => {
      requests.push({
        path: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        accept: new Headers(init?.headers).get('accept'),
      });
      return router.fetch(new Request(input, init));
    },
  });
  return { database, migrator, router, api, requests };
}

import path from 'node:path';
import { createDatabaseManager, databaseManagerToken } from '@nocobase/db';
import { Auth, authenticationToken } from '@nocobase/app-plugin-authentication';
import { createConfigPaths } from '@nocobase/app-server/config';
import { ServiceContainer } from '@nocobase/service-provider';
import { createApiClient } from '@nocobase/app-client';
import { Hono } from 'hono';
import { vi } from 'vitest';
import { apiRoutes } from '../server/routes/index.js';

export async function createFixture() {
  const database = createDatabaseManager({
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  const migrator = database.createMigrator({
    directory: path.resolve(import.meta.dirname, '../database/migrations'),
    packageName: '@nocobase/app-plugin-repository-example',
  });
  await migrator.latest();
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
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
  const requests: { path: string; body: unknown }[] = [];
  const api = createApiClient({
    baseURL: 'http://example.test/main/api',
    headers: { 'x-test-user': 'tester' },
    fetch: async (input, init) => {
      requests.push({
        path: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return router.fetch(new Request(input, init));
    },
  });
  return { database, migrator, router, api, requests };
}

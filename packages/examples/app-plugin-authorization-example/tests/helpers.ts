import { defaultAccess } from '@nocobase/app-plugin-authz-default-access/server';
import { sharingRules } from '@nocobase/app-plugin-authz-sharing-rules/server';
import { restrictionRules } from '@nocobase/app-plugin-authz-restriction-rules/server';
import defaultRoutes from '../../../plugins/app-plugin-authz-default-access/server/routes.js';
import sharingRoutes from '../../../plugins/app-plugin-authz-sharing-rules/server/routes.js';
import restrictionRoutes from '../../../plugins/app-plugin-authz-restriction-rules/server/routes.js';
import { apiRoutes as authorizationRoutes } from '../../../plugins/app-plugin-authorization/server/routes/index.js';
import path from 'node:path';
import { Auth, authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  createAppAuthorization,
} from '@nocobase/app-plugin-authorization';
import { createAppPaths } from '@nocobase/app-server/config';
import { createDatabaseManager, databaseManagerToken } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { vi } from 'vitest';
import setupSeed from '../database/seeds/202609220002_sales_permissions.js';
import { AuthorizationExampleProvider } from '../server/providers/authorization-example.js';
import { apiRoutes } from '../server/routes/index.js';
export async function createFixture() {
  const database = createDatabaseManager({
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  for (const name of [
    'authentication',
    'authorization',
    'authz-default-access',
    'authz-sharing-rules',
    'authz-restriction-rules',
  ])
    await database
      .createMigrator({
        directory: path.resolve(
          import.meta.dirname,
          `../../../plugins/app-plugin-${name}/database/migrations`,
        ),
        packageName: `@nocobase/app-plugin-${name}`,
        tableName: `${name}Migrations`,
      })
      .latest();
  await database
    .createMigrator({
      directory: path.resolve(import.meta.dirname, '../database/migrations'),
      packageName: '@nocobase/app-plugin-authorization-example',
    })
    .latest();
  const connection = database.connection();
  await setupSeed.run({ query: connection.query, connection });
  const users = Object.fromEntries(
    (
      await connection.query
        .selectFrom('user')
        .select(['id', 'username'])
        .execute()
    ).map((row) => [
      String(row.username).replace('sales_', ''),
      String(row.id),
    ]),
  );
  const authorization = createAppAuthorization({
    connection,
    config: { plugins: [defaultAccess(), sharingRules(), restrictionRules()] },
  });
  users.admin = 'test-administrator';
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
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
  container.instance(authorizationToken, authorization);
  container.instance(authenticationToken, authentication);
  const router = new Hono();
  const app = {
    appName: 'example',
    publicBasePath: '/main',
    config: { app: { name: 'example', publicBasePath: '/main' } },
    paths: createAppPaths({ rootDir: '/tmp/authorization-example' }),
    container,
    router,
  };
  await new AuthorizationExampleProvider(app).boot();
  router.route('/api', await apiRoutes.createRouter(app));
  router.route('/api', await authorizationRoutes.createRouter(app));
  for (const route of [
    ...defaultRoutes,
    ...sharingRoutes,
    ...restrictionRoutes,
  ])
    router.route('/api', await route.createRouter(app));
  return {
    database,
    authorization,
    users,
    router,
    request: (user: string, path: string, body?: unknown) =>
      router.request(`/api/authorization-example/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'x-test-user': users[user] ?? user,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
  };
}

// @vitest-environment node
import path from 'node:path';
import { createDatabaseManager, databaseManagerToken } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import {
  createAppAuthorization,
  authorizationToken,
} from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';
import { Hono, type MiddlewareHandler } from 'hono';
import { beforeEach, afterEach, expect, it } from 'vitest';
import ArticlesProvider from '../../server/providers/articles.ts';
import { articlesRoutes } from '../../server/routes/articles.ts';

const database = () =>
  createDatabaseManager({
    default: 'main',
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
let db: ReturnType<typeof database>;
let router: Hono;
let authz: ReturnType<typeof createAppAuthorization>;
let app: Application;
beforeEach(async () => {
  db = database();
  await db
    .createMigrator({
      sources: [
        {
          packageName: 'authentication',
          directory: path.resolve(
            import.meta.dirname,
            '../../../../plugins/app-plugin-authentication/database/migrations',
          ),
        },
        {
          packageName: 'articles',
          directory: path.resolve(
            import.meta.dirname,
            '../../database/main/migrations',
          ),
        },
        {
          packageName: 'authorization',
          directory: path.resolve(
            import.meta.dirname,
            '../../../../plugins/app-plugin-authorization/database/migrations',
          ),
        },
      ],
    })
    .latest();
  authz = createAppAuthorization({ connection: db.connection() });
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, db);
  container.instance(authorizationToken, authz);
  const required = (): MiddlewareHandler => async (c, next) => {
    const user = c.req.header('x-test-user');
    if (!user) return c.json({ error: 'unauthenticated' }, 401);
    c.set('auth', { user: { id: user } });
    await next();
  };
  container.instance(authenticationToken, {
    required,
  } as unknown as typeof authenticationToken extends ServiceToken<infer T>
    ? T
    : never);
  app = { container } as Application;
  await new ArticlesProvider(app).boot();
  router = await articlesRoutes.createRouter(app);
  router.get('/unrelated', (c) => c.text('public'));
});
afterEach(async () => {
  await db.destroy();
});
const body = {
  title: 'A new article',
  summary: 'Summary',
  content: 'Text',
  status: 'draft',
};
const request = (
  url: string,
  method = 'GET',
  input?: object,
  user: string | null = 'alice',
) =>
  router.request(url, {
    method,
    headers: {
      ...(user ? { 'x-test-user': user } : {}),
      ...(input ? { 'content-type': 'application/json' } : {}),
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
async function grant(filter = 'allRecords') {
  await authz.permissionSets.create({
    key: 'editor',
    grants: [
      authz.database.grant('articles', {
        read: { fields: { output: '*' }, recordAccess: [filter] },
        create: { fields: { input: '*' } },
        update: { fields: { input: '*' }, recordAccess: [filter] },
      }),
    ],
  });
  await authz.permissionSets.assign({
    permissionSet: 'editor',
    subject: { type: 'user', id: 'alice' },
  });
}
it('rejects anonymous and unauthorized access without leaking middleware', async () => {
  expect((await request('/articles', 'GET', undefined, null)).status).toBe(401);
  expect((await request('/articles')).status).toBe(403);
  expect((await request('/articles', 'POST', body)).status).toBe(403);
  expect((await request('/unrelated', 'GET', undefined, null)).status).toBe(
    200,
  );
});
it('creates, filters, edits and publishes articles with server timestamps', async () => {
  await grant();
  expect((await request('/articles', 'POST', body)).status).toBe(201);
  expect(
    (await request('/articles', 'POST', { ...body, title: '' })).status,
  ).toBe(400);
  expect((await request('/articles?page=0')).status).toBe(400);
  const response = await request('/articles?search=new&status=draft');
  expect(response.status).toBe(200);
  const result = (await response.json()) as {
    data: { id: number; publishedAt: string | null }[];
    total: number;
  };
  expect(result.total).toBe(1);
  expect(result.data[0].publishedAt).toBeNull();
  expect(
    (
      await request(`/articles/${result.data[0].id}`, 'PUT', {
        ...body,
        status: 'published',
      })
    ).status,
  ).toBe(200);
  const saved = await db
    .query()
    .selectFrom('articles')
    .selectAll()
    .executeTakeFirst();
  expect(saved?.publishedAt).toBeTruthy();
  expect((await request('/articles?status=draft')).status).toBe(200);
  expect(await (await request('/articles?status=draft')).json()).toMatchObject({
    total: 0,
  });
});
it('applies authorized record ranges to counts, lists and updates', async () => {
  await authz.permissionSets.create({
    key: 'restricted',
    grants: [
      authz.database.grant('articles', {
        read: {
          fields: { output: '*' },
          recordAccess: [
            {
              key: 'customFilter',
              params: { filter: { $and: [{ status: { $eq: 'published' } }] } },
            },
          ],
        },
        update: {
          fields: { input: '*' },
          recordAccess: [
            {
              key: 'customFilter',
              params: { filter: { $and: [{ status: { $eq: 'published' } }] } },
            },
          ],
        },
      }),
    ],
  });
  await authz.permissionSets.assign({
    permissionSet: 'restricted',
    subject: { type: 'user', id: 'alice' },
  });
  const seeder = db.createSeeder({
    directory: path.resolve(import.meta.dirname, '../../database/main/seeds'),
    packageName: 'articles',
  });
  await seeder.run();
  expect(await (await request('/articles')).json()).toMatchObject({
    total: 3,
    data: expect.arrayContaining([
      expect.objectContaining({ updatedAt: '2026-09-08T00:00:00.000Z' }),
    ]),
  });
  const draft = await db
    .query()
    .selectFrom('articles')
    .select('id')
    .where('status', '=', 'draft')
    .executeTakeFirstOrThrow();
  expect((await request(`/articles/${draft.id}`, 'PUT', body)).status).toBe(
    404,
  );
});
it('seeds six articles once and preserves user edits', async () => {
  const seeder = db.createSeeder({
    directory: path.resolve(import.meta.dirname, '../../database/main/seeds'),
    packageName: 'articles',
  });
  await seeder.run();
  await db
    .query()
    .updateTable('articles')
    .set({ content: 'User edit' })
    .where('title', '=', '欢迎来到文章中心')
    .execute();
  expect(await seeder.run()).toMatchObject({ executed: [] });
  const rows = await db.query().selectFrom('articles').selectAll().execute();
  expect(rows).toHaveLength(6);
  expect(rows.filter((row) => row.status === 'draft')).toHaveLength(2);
  expect(rows.find((row) => row.title === '欢迎来到文章中心')?.content).toBe(
    'User edit',
  );
});
it('initializes article permissions for administrators only and preserves later revocations', async () => {
  await authz.permissionSets.create({
    key: 'system-administrator',
    grants: [],
  });
  await authz.permissionSets.assign({
    permissionSet: 'system-administrator',
    subject: { type: 'user', id: 'admin' },
  });
  // Collection has already been registered during the first boot.
  await new ArticlesProvider(app).boot();
  expect((await request('/articles', 'GET', undefined, 'admin')).status).toBe(
    200,
  );
  expect((await request('/articles')).status).toBe(403);
  const [assignment] =
    await authz.permissionSets.listAssignments('articles-manager');
  await authz.permissionSets.revoke(assignment.id);
  await new ArticlesProvider(app).boot();
  expect((await request('/articles', 'GET', undefined, 'admin')).status).toBe(
    403,
  );
});

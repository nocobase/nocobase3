import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  appAuthorizationDatabase,
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { databaseManagerToken, type RepositoryPolicy } from '@nocobase/db';
import { ArticlesService } from '../providers/articles-service.js';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';

const fields = [
  'id',
  'title',
  'summary',
  'content',
  'status',
  'publishedAt',
  'createdAt',
  'updatedAt',
];
const inputFields = ['title', 'summary', 'content', 'status'];
// What the service actually writes: the caller's fields plus the timestamps
// the server stamps. A grant that does not cover them cannot serve the route.
const createFields = [...inputFields, 'publishedAt', 'createdAt', 'updatedAt'];
const updateFields = [...inputFields, 'publishedAt', 'updatedAt'];
const statuses = ['draft', 'published', 'archived'];

/** The fields one Policy node allows, or `undefined` when it allows every field. */
function allowedFields(
  node: true | false | { readonly fields?: false | readonly string[] },
): readonly string[] | undefined {
  if (node === true) return undefined;
  if (node === false) return [];
  return node.fields === undefined || node.fields === false ? [] : node.fields;
}
function parseInput(value: unknown): {
  title: string;
  summary: string;
  content: string;
  status: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HTTPException(400);
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => !inputFields.includes(key)) ||
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.trim().length > 255 ||
    typeof input.summary !== 'string' ||
    input.summary.length > 2000 ||
    typeof input.content !== 'string' ||
    input.content.length > 100000 ||
    typeof input.status !== 'string' ||
    !statuses.includes(input.status)
  )
    throw new HTTPException(400, { message: 'Invalid article fields.' });
  return {
    title: input.title.trim(),
    summary: input.summary.trim(),
    content: input.content,
    status: input.status,
  };
}

export const articlesRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    if (!app.container.has(databaseManagerToken)) {
      routes.all('*', (c) => c.json({ code: 'DATABASE_UNAVAILABLE' }, 503));
      return router.route('/articles', routes);
    }
    const articles = new ArticlesService(
      app.container.resolve(databaseManagerToken),
    );
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const authzDatabase = appAuthorizationDatabase(authorization);
    if (!authzDatabase) {
      routes.all('*', (c) =>
        c.json({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503),
      );
      return router.route('/articles', routes);
    }
    const policyFor = (c: {
      get(name: 'authz'): AuthorizationEnv['Variables']['authz'];
    }): Promise<RepositoryPolicy> =>
      authzDatabase.policyFor('articles', c.get('authz'));
    routes.use(
      '*',
      auth.required(),
      authorization.middleware(),
      bodyLimit({ maxSize: 512 * 1024 }),
    );
    routes.get('/', async (c) => {
      const policy = await policyFor(c);
      const readable = allowedFields(policy.read);
      const allowed =
        readable === undefined
          ? fields
          : fields.filter((field) => readable.includes(field));
      if (!allowed.length) return c.json({ code: 'FORBIDDEN' }, 403);
      const page = Number(c.req.query('page') ?? '1');
      const search = (c.req.query('search') ?? '').trim();
      const status = c.req.query('status');
      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > 10000 ||
        search.length > 255 ||
        (status && !statuses.includes(status))
      )
        return c.json({ code: 'INVALID_QUERY' }, 400);
      return c.json(
        await articles.list({ page, search, status }, allowed, policy),
      );
    });
    for (const method of ['post', 'put'] as const) {
      routes[method](method === 'post' ? '/' : '/:id', async (c) => {
        const input = parseInput(
          await c.req.json().catch(() => {
            throw new HTTPException(400);
          }),
        );
        const policy = await policyFor(c);
        const writable = allowedFields(
          method === 'post' ? policy.create : policy.update,
        );
        const written = method === 'post' ? createFields : updateFields;
        if (writable && written.some((field) => !writable.includes(field)))
          return c.json({ code: 'FORBIDDEN' }, 403);
        if (method === 'post') {
          await articles.create(input, policy);
          return c.json({ ok: true }, 201);
        }
        const id = Number(c.req.param('id'));
        if (!Number.isSafeInteger(id) || id < 1)
          return c.json({ code: 'INVALID_ID' }, 400);
        return (await articles.update(id, input, policy))
          ? c.json({ ok: true })
          : c.json({ code: 'NOT_FOUND' }, 404);
      });
    }
    return router.route('/articles', routes);
  });

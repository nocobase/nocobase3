import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
  type DatabaseAuthorizationParams,
  type DatabaseAuthorizationConditions,
} from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
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
const statuses = ['draft', 'published', 'archived'];
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
    routes.use(
      '*',
      auth.required(),
      authorization.middleware(),
      bodyLimit({ maxSize: 512 * 1024 }),
    );
    routes.get('/', async (c) => {
      const decision = await c
        .get('authz')
        .authorize<DatabaseAuthorizationParams>({
          resource: { type: 'database.collection', id: 'main.articles' },
          action: 'read',
          params: {
            fields: {
              output: fields,
              filter: ['title', 'status'],
              sort: ['updatedAt', 'id'],
            },
          },
        });
      if (
        decision.effect !== 'conditional' ||
        decision.conditions?.type !== 'database'
      )
        return c.json({ code: 'FORBIDDEN' }, 403);
      const conditions = decision.conditions as DatabaseAuthorizationConditions;
      const allowed =
        conditions.fields.output === '*'
          ? fields
          : fields.filter((field) => conditions.fields.output.includes(field));
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
        await articles.list({ page, search, status }, allowed, conditions),
      );
    });
    for (const method of ['post', 'put'] as const) {
      routes[method](method === 'post' ? '/' : '/:id', async (c) => {
        const input = parseInput(
          await c.req.json().catch(() => {
            throw new HTTPException(400);
          }),
        );
        const decision = await c
          .get('authz')
          .authorize<DatabaseAuthorizationParams>({
            resource: { type: 'database.collection', id: 'main.articles' },
            action: method === 'post' ? 'create' : 'update',
            params: { fields: { input: inputFields } },
          });
        if (
          decision.effect !== 'conditional' ||
          decision.conditions?.type !== 'database'
        )
          return c.json({ code: 'FORBIDDEN' }, 403);
        const conditions =
          decision.conditions as DatabaseAuthorizationConditions;
        if (
          conditions.fields.input !== '*' &&
          inputFields.some((field) => !conditions.fields.input.includes(field))
        )
          return c.json({ code: 'FORBIDDEN' }, 403);
        if (method === 'post') {
          await articles.create(input);
          return c.json({ ok: true }, 201);
        }
        const id = Number(c.req.param('id'));
        if (!Number.isSafeInteger(id) || id < 1)
          return c.json({ code: 'INVALID_ID' }, 400);
        return (await articles.update(id, input, conditions))
          ? c.json({ ok: true })
          : c.json({ code: 'NOT_FOUND' }, 404);
      });
    }
    return router.route('/articles', routes);
  });

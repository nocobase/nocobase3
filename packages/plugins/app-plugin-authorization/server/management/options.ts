import { Hono, type Context } from 'hono';
import type { AuthorizationEnv } from '@nocobase/authorization/core';
import type { AppAuthorizationService } from '../tokens.js';
import type { AuthorizationAdministration } from '../administration.js';
import type { DatabaseConnection } from '@nocobase/db';
import { databaseScopeRuleOptions } from '../routes/options.js';

export function createSubjectRoutes(
  authorization: AppAuthorizationService,
  settings: string,
  action = 'read',
): Hono<AuthorizationEnv> {
  const routes = new Hono<AuthorizationEnv>();
  routes.get(`/${settings}/subjects/:type`, async (context) => {
    await admin(context, settings, action);
    const selection = authorization.subjects.get(context.req.param('type'))
      ?.administration?.selection;
    if (!selection || selection.type !== 'collection')
      return context.json({ code: 'UNKNOWN_SUBJECT_TYPE' }, 404);
    const page = Number(context.req.query('page') ?? 1);
    const pageSize = Number(context.req.query('pageSize') ?? 30);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    )
      return context.json({ code: 'INVALID_PAGINATION' }, 400);
    const data = await selection.list(
      { search: context.req.query('search'), page, pageSize },
      { authz: context.get('authz') },
    );
    return context.json({ data });
  });
  routes.post(`/${settings}/subjects/:type/resolve`, async (context) => {
    await admin(context, settings, action);
    const selection = authorization.subjects.get(context.req.param('type'))
      ?.administration?.selection;
    if (!selection || selection.type !== 'collection')
      return context.json({ code: 'UNKNOWN_SUBJECT_TYPE' }, 404);
    const input = await body(context);
    const ids: unknown =
      input && typeof input === 'object'
        ? Reflect.get(input, 'ids')
        : undefined;
    if (
      !Array.isArray(ids) ||
      ids.length > 100 ||
      !ids.every((id): id is string => typeof id === 'string' && id.length > 0)
    )
      return context.json({ code: 'INVALID_SUBJECT_IDS' }, 400);
    return context.json({
      data: await selection.resolve(ids, { authz: context.get('authz') }),
    });
  });
  return routes;
}

export function createRuleOptionsRoutes(
  authorization: AppAuthorizationService,
  administration: AuthorizationAdministration,
  connection: DatabaseConnection | undefined,
  settings: string,
): Hono<AuthorizationEnv> {
  const routes = createSubjectRoutes(authorization, settings);
  routes.get(`/${settings}/options`, async (context) => {
    await admin(context, settings, 'read');
    return context.json({
      data: await databaseScopeRuleOptions(authorization, connection),
    });
  });
  routes.get(`/${settings}/records/:collection`, async (context) => {
    await admin(context, settings, 'read');
    return context.json({
      data: await administration.listRecords(
        decodeURIComponent(context.req.param('collection')),
      ),
    });
  });
  return routes;
}
async function admin(
  context: {
    get(name: 'authz'): {
      require(input: {
        resource: { type: string; id: string };
        action: string;
      }): Promise<void>;
    };
  },
  resourceId: string,
  action: string,
): Promise<void> {
  await context.get('authz').require({
    resource: { type: 'settings', id: `authorization.${resourceId}` },
    action,
  });
}

async function body(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

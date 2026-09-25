import type { Hono } from 'hono';
import { createAuthorizationAdministration } from '../administration.js';
import { databaseHost } from '../database/api.js';
import type { AuthorizationExtensionHost } from '../host.js';
import { authorizationOptions } from '../options.js';
import {
  createSettingsRouter,
  jsonBody,
  requireSettings,
  type SettingsRouterEnv,
} from './http.js';

/** `page` and `pageSize` from the query, or `undefined` when out of range. */
function pagination(
  query: (name: string) => string | undefined,
): { page: number; pageSize: number } | undefined {
  const page = Number(query('page') ?? 1);
  const pageSize = Number(query('pageSize') ?? 30);
  return Number.isSafeInteger(page) &&
    page >= 1 &&
    Number.isSafeInteger(pageSize) &&
    pageSize >= 1 &&
    pageSize <= 100
    ? { page, pageSize }
    : undefined;
}

/**
 * `GET <prefix>/subjects/:type`, `POST <prefix>/subjects/:type/resolve` and
 * `GET <prefix>/subjects/:type/:id/members`, gated by `settings:<settings>`
 * `<action>`.
 */
export function createSubjectRoutes(
  authz: Pick<AuthorizationExtensionHost, 'subjects'>,
  prefix: string,
  settings: string,
  action: string,
): Hono<SettingsRouterEnv> {
  const routes = createSettingsRouter();
  const administrationOf = (type: string) =>
    authz.subjects.get(type)?.administration;
  const selectionOf = (type: string) => {
    const selection = administrationOf(type)?.selection;
    return selection?.type === 'collection' ? selection : undefined;
  };
  routes.get(`${prefix}/subjects/:type`, async (context) => {
    await requireSettings(context.env.authorization, settings, action);
    const selection = selectionOf(context.req.param('type'));
    if (!selection) return context.json({ code: 'UNKNOWN_SUBJECT_TYPE' }, 404);
    const paging = pagination((name) => context.req.query(name));
    if (!paging) return context.json({ code: 'INVALID_PAGINATION' }, 400);
    const search = context.req.query('search');
    return context.json({
      data: await selection.list(
        { ...(search === undefined ? {} : { search }), ...paging },
        { authz: context.env.authorization },
      ),
    });
  });
  routes.get(`${prefix}/subjects/:type/:id/members`, async (context) => {
    await requireSettings(context.env.authorization, settings, action);
    const administration = administrationOf(context.req.param('type'));
    if (!administration?.members)
      return context.json({ code: 'UNKNOWN_SUBJECT_TYPE' }, 404);
    const paging = pagination((name) => context.req.query(name));
    if (!paging) return context.json({ code: 'INVALID_PAGINATION' }, 400);
    const search = context.req.query('search');
    const page = await administration.members(
      context.req.param('id'),
      { ...(search === undefined ? {} : { search }), ...paging },
      { authz: context.env.authorization },
    );
    return context.json({ data: { items: page.items, total: page.total } });
  });
  routes.post(`${prefix}/subjects/:type/resolve`, async (context) => {
    await requireSettings(context.env.authorization, settings, action);
    const administration = administrationOf(context.req.param('type'));
    const selection = selectionOf(context.req.param('type'));
    if (!administration || !selection)
      return context.json({ code: 'UNKNOWN_SUBJECT_TYPE' }, 404);
    const input = await jsonBody(context.req);
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
    const items = await selection.resolve(ids, {
      authz: context.env.authorization,
    });
    return context.json({
      data: administration.manage
        ? items.map((item) => {
            const path = administration.manage?.(item.id);
            return path === undefined ? item : { ...item, manage: path };
          })
        : items,
    });
  });
  return routes;
}

/**
 * `/<rule>/options`, `/<rule>/subjects/...` and `/<rule>/records/:collection`
 * for a rule plugin, each gated by `settings:authorization.<rule>` `read`.
 */
export function createRuleSupportRoutes(
  authz: AuthorizationExtensionHost,
  rule: string,
): Hono<SettingsRouterEnv> {
  const settings = `authorization.${rule}`;
  const routes = createSubjectRoutes(authz, `/${rule}`, settings, 'read');
  routes.get(`/${rule}/options`, async (context) => {
    await requireSettings(context.env.authorization, settings, 'read');
    return context.json({
      data: await authorizationOptions(authz, { rules: true }),
    });
  });
  routes.get(`/${rule}/records/:collection`, async (context) => {
    await requireSettings(context.env.authorization, settings, 'read');
    const database = databaseHost(authz.database);
    const administration = createAuthorizationAdministration({
      ...(database?.connection ? { connection: database.connection } : {}),
      resolveCollection: async (name) => database?.describe(name),
    });
    return context.json({
      data: await administration.listRecords(
        decodeURIComponent(context.req.param('collection')),
      ),
    });
  });
  return routes;
}

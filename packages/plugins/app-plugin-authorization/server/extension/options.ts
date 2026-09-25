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

/**
 * `GET <prefix>/subjects/:type` and `POST <prefix>/subjects/:type/resolve`,
 * gated by `settings:<settings>` `<action>`.
 */
export function createSubjectRoutes(
  authz: Pick<AuthorizationExtensionHost, 'subjects'>,
  prefix: string,
  settings: string,
  action: string,
): Hono<SettingsRouterEnv> {
  const routes = createSettingsRouter();
  const selectionOf = (type: string) => {
    const selection = authz.subjects.get(type)?.administration?.selection;
    return selection?.type === 'collection' ? selection : undefined;
  };
  routes.get(`${prefix}/subjects/:type`, async (context) => {
    await requireSettings(context.env.authorization, settings, action);
    const selection = selectionOf(context.req.param('type'));
    if (!selection) return context.json({ code: 'UNKNOWN_SUBJECT_TYPE' }, 404);
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
    const search = context.req.query('search');
    return context.json({
      data: await selection.list(
        { ...(search === undefined ? {} : { search }), page, pageSize },
        { authz: context.env.authorization },
      ),
    });
  });
  routes.post(`${prefix}/subjects/:type/resolve`, async (context) => {
    await requireSettings(context.env.authorization, settings, action);
    const selection = selectionOf(context.req.param('type'));
    if (!selection) return context.json({ code: 'UNKNOWN_SUBJECT_TYPE' }, 404);
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
    return context.json({
      data: await selection.resolve(ids, {
        authz: context.env.authorization,
      }),
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

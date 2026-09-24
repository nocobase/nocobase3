import type { AuthorizationRouteHandler } from '@nocobase/authorization/core';
import {
  DefaultAccessConflictError,
  type DefaultAccessApi,
  type DefaultAccessRule,
} from '@nocobase/authorization/default-access';
import {
  createRouteHandler,
  createRuleSupportRoutes,
  createSettingsRouter,
  parse,
  requireSettings,
  validateDataScopeRule,
  type AuthorizationExtensionHost,
} from '@nocobase/app-plugin-authorization/server/extension';

/** The rule name, route prefix and settings item suffix. */
export const DEFAULT_ACCESS_RULE = 'default-access';
export const DEFAULT_ACCESS_SETTINGS: string = `authorization.${DEFAULT_ACCESS_RULE}`;
const PATH = `/${DEFAULT_ACCESS_RULE}`;

type DefaultAccessAdministrationApi = Omit<DefaultAccessApi, 'withTransaction'>;

/** Every `/default-access` route, gated by `settings:authorization.default-access`. */
export function createDefaultAccessHandler(
  authz: AuthorizationExtensionHost,
  api: DefaultAccessAdministrationApi,
): AuthorizationRouteHandler {
  const routes = createSettingsRouter();
  const checked = (value: unknown): DefaultAccessRule => {
    const { key, resource, actions } = parse.rule(value);
    const rule = { key, resource, actions };
    validateDataScopeRule(authz, rule);
    return rule;
  };
  const conflict = (error: unknown): Response | undefined =>
    error instanceof DefaultAccessConflictError
      ? Response.json(
          { code: 'DEFAULT_ACCESS_CONFLICT', message: error.message },
          { status: 409 },
        )
      : undefined;
  routes.route('/', createRuleSupportRoutes(authz, DEFAULT_ACCESS_RULE));
  routes.get(PATH, async (context) => {
    await requireSettings(
      context.env.authorization,
      DEFAULT_ACCESS_SETTINGS,
      'read',
    );
    return context.json({ data: await api.list() });
  });
  routes.post(PATH, async (context) => {
    await requireSettings(
      context.env.authorization,
      DEFAULT_ACCESS_SETTINGS,
      'create',
    );
    const rule = checked(await context.req.json());
    try {
      return context.json({ data: await api.create(rule) }, 201);
    } catch (error) {
      const response = conflict(error);
      if (response) return response;
      throw error;
    }
  });
  routes.put(`${PATH}/:key`, async (context) => {
    await requireSettings(
      context.env.authorization,
      DEFAULT_ACCESS_SETTINGS,
      'update',
    );
    const key = context.req.param('key');
    if (!(await api.get(key)))
      return context.json({ code: 'RULE_NOT_FOUND' }, 404);
    const rule = checked(await context.req.json());
    try {
      return context.json({ data: await api.update(key, rule) });
    } catch (error) {
      const response = conflict(error);
      if (response) return response;
      throw error;
    }
  });
  routes.delete(`${PATH}/:key`, async (context) => {
    await requireSettings(
      context.env.authorization,
      DEFAULT_ACCESS_SETTINGS,
      'delete',
    );
    await api.delete(context.req.param('key'));
    return context.body(null, 204);
  });
  return createRouteHandler(routes);
}

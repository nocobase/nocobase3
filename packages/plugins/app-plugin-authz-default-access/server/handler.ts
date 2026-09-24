import type { AuthorizationRouteHandler } from '@nocobase/authorization/core';
import type {
  DefaultAccessApi,
  DefaultAccessRule,
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
    return context.json(
      { data: await api.create(checked(await context.req.json())) },
      201,
    );
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
    return context.json({
      data: await api.update(key, checked(await context.req.json())),
    });
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

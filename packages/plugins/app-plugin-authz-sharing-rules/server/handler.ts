import type { AuthorizationRouteHandler } from '@nocobase/authorization/core';
import type {
  SharingRule,
  SharingRulesApi,
} from '@nocobase/authorization/sharing-rules';
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
export const SHARING_RULES_RULE = 'sharing-rules';
export const SHARING_RULES_SETTINGS: string = `authorization.${SHARING_RULES_RULE}`;
const PATH = `/${SHARING_RULES_RULE}`;

type SharingRulesAdministrationApi = Omit<SharingRulesApi, 'withTransaction'>;

/** Every `/sharing-rules` route, gated by `settings:authorization.sharing-rules`. */
export function createSharingRulesHandler(
  authz: AuthorizationExtensionHost,
  api: SharingRulesAdministrationApi,
): AuthorizationRouteHandler {
  const routes = createSettingsRouter();
  const checked = (value: unknown): SharingRule => {
    const rule = parse.rule(value, { withSubjects: true });
    validateDataScopeRule(authz, rule);
    return { ...rule, subjects: rule.subjects ?? [] };
  };
  routes.route('/', createRuleSupportRoutes(authz, SHARING_RULES_RULE));
  routes.get(PATH, async (context) => {
    await requireSettings(
      context.env.authorization,
      SHARING_RULES_SETTINGS,
      'read',
    );
    return context.json({ data: await api.list() });
  });
  routes.post(PATH, async (context) => {
    await requireSettings(
      context.env.authorization,
      SHARING_RULES_SETTINGS,
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
      SHARING_RULES_SETTINGS,
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
      SHARING_RULES_SETTINGS,
      'delete',
    );
    await api.delete(context.req.param('key'));
    return context.body(null, 204);
  });
  return createRouteHandler(routes);
}

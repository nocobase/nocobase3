import type { AuthorizationRouteHandler } from '@nocobase/authorization/core';
import type {
  RestrictionRule,
  RestrictionRulesApi,
} from '@nocobase/authorization/restriction-rules';
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
export const RESTRICTION_RULES_RULE = 'restriction-rules';
export const RESTRICTION_RULES_SETTINGS: string = `authorization.${RESTRICTION_RULES_RULE}`;
const PATH = `/${RESTRICTION_RULES_RULE}`;

type RestrictionRulesAdministrationApi = Omit<
  RestrictionRulesApi,
  'withTransaction'
>;

/** Every `/restriction-rules` route, gated by `settings:authorization.restriction-rules`. */
export function createRestrictionRulesHandler(
  authz: AuthorizationExtensionHost,
  api: RestrictionRulesAdministrationApi,
): AuthorizationRouteHandler {
  const routes = createSettingsRouter();
  const checked = (value: unknown): RestrictionRule => {
    const rule = parse.rule(value, { withSubjects: true });
    validateDataScopeRule(authz, rule);
    return { ...rule, subjects: rule.subjects ?? [] };
  };
  routes.route('/', createRuleSupportRoutes(authz, RESTRICTION_RULES_RULE));
  routes.get(PATH, async (context) => {
    await requireSettings(
      context.env.authorization,
      RESTRICTION_RULES_SETTINGS,
      'read',
    );
    return context.json({ data: await api.list() });
  });
  routes.post(PATH, async (context) => {
    await requireSettings(
      context.env.authorization,
      RESTRICTION_RULES_SETTINGS,
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
      RESTRICTION_RULES_SETTINGS,
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
      RESTRICTION_RULES_SETTINGS,
      'delete',
    );
    await api.delete(context.req.param('key'));
    return context.body(null, 204);
  });
  return createRouteHandler(routes);
}

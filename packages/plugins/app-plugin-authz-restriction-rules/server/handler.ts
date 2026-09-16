import type { AuthorizationRouteHandler } from '@nocobase/authorization/core';
import {
  createRouteHandler,
  createSettingsRouter,
  requireSettings,
} from '@nocobase/app-plugin-authorization/server/management';
import {
  actionScopes,
  object,
  ruleBase,
} from '@nocobase/app-plugin-authorization/server/management';
import type { RestrictionRule } from '@nocobase/authorization/restriction-rules';
import type { RestrictionRulesApi } from '@nocobase/authorization/restriction-rules';

/** Where the plugin registers its routes, and the prefix every path below carries. */
export const RESTRICTION_RULES_ROUTE_PATH = '/restriction-rules';

type RestrictionRulesAdministrationApi = Omit<
  RestrictionRulesApi,
  'withTransaction'
>;

export function createRestrictionRulesHandler(
  api: RestrictionRulesAdministrationApi,
): AuthorizationRouteHandler {
  const routes = createSettingsRouter();

  routes.get(RESTRICTION_RULES_ROUTE_PATH, async (context) => {
    await requireSettings(
      context.env.authorization,
      'restriction-rules',
      'read',
    );
    return context.json({ data: await api.list() });
  });

  routes.post(RESTRICTION_RULES_ROUTE_PATH, async (context) => {
    await requireSettings(
      context.env.authorization,
      'restriction-rules',
      'create',
    );
    return context.json(
      {
        data: await api.create(parseRestrictionRule(await context.req.json())),
      },
      201,
    );
  });

  routes.put(`${RESTRICTION_RULES_ROUTE_PATH}/:key`, async (context) => {
    await requireSettings(
      context.env.authorization,
      'restriction-rules',
      'update',
    );
    return context.json({
      data: await api.update(
        context.req.param('key'),
        parseRestrictionRule(await context.req.json()),
      ),
    });
  });

  routes.delete(`${RESTRICTION_RULES_ROUTE_PATH}/:key`, async (context) => {
    await requireSettings(
      context.env.authorization,
      'restriction-rules',
      'delete',
    );
    await api.delete(context.req.param('key'));
    return context.body(null, 204);
  });

  return createRouteHandler(routes);
}

function parseRestrictionRule(value: unknown): RestrictionRule {
  const input = object(value, 'restriction rule');
  return { ...ruleBase(input), actions: actionScopes(input.actions) };
}

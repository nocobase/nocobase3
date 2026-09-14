import type { AuthorizationRouteHandler } from '../../core/index.js';
import {
  createRouteHandler,
  createSettingsRouter,
  requireSettings,
} from '../internal/http.js';
import { actionScopes, object, ruleBase } from '../internal/parsing.js';
import type { RestrictionRule } from './model.js';
import type { RestrictionRulesApi } from './service.js';

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

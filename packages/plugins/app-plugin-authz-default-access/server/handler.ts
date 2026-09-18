import type { AuthorizationRouteHandler } from '@nocobase/authorization/core';
import {
  createRouteHandler,
  createSettingsRouter,
  requireSettings,
} from '@nocobase/app-plugin-authorization/server/management';
import {
  actionScopes,
  object,
  resource,
} from '@nocobase/app-plugin-authorization/server/management';
import type { DefaultAccessRule } from '@nocobase/authorization/default-access';
import type { DefaultAccessApi } from '@nocobase/authorization/default-access';

/** Where the plugin registers its routes, and the prefix every path below carries. */
export const DEFAULT_ACCESS_ROUTE_PATH = '/default-access';

type DefaultAccessAdministrationApi = Omit<DefaultAccessApi, 'withTransaction'>;

export function createDefaultAccessHandler(
  api: DefaultAccessAdministrationApi,
  validate: (rule: DefaultAccessRule) => void = () => {},
): AuthorizationRouteHandler {
  const routes = createSettingsRouter();

  routes.get(DEFAULT_ACCESS_ROUTE_PATH, async (context) => {
    await requireSettings(context.env.authorization, 'default-access', 'read');
    return context.json({ data: await api.list() });
  });

  routes.put(DEFAULT_ACCESS_ROUTE_PATH, async (context) => {
    const rule = parseDefaultAccessRule(await context.req.json());
    await requireSettings(
      context.env.authorization,
      'default-access',
      'configure',
    );
    validate(rule);
    return context.json({ data: await api.set(rule) });
  });

  routes.delete(`${DEFAULT_ACCESS_ROUTE_PATH}/:type/:id`, async (context) => {
    await requireSettings(
      context.env.authorization,
      'default-access',
      'configure',
    );
    await api.delete(context.req.param('type'), context.req.param('id'));
    return context.body(null, 204);
  });

  return createRouteHandler(routes);
}

function parseDefaultAccessRule(value: unknown): DefaultAccessRule {
  const input = object(value, 'Default Access Rule');
  return {
    resource: resource(input.resource),
    actions: actionScopes(input.actions),
  };
}

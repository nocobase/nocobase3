import type { AuthorizationRouteHandler } from '../../core/index.js';
import {
  createRouteHandler,
  createSettingsRouter,
  requireSettings,
} from '../internal/http.js';
import { actionScopes, object, resource } from '../internal/parsing.js';
import type { DefaultAccessRule } from './model.js';
import type { DefaultAccessApi } from './plugin.js';

/** Where the plugin registers its routes, and the prefix every path below carries. */
export const DEFAULT_ACCESS_ROUTE_PATH = '/default-access';

type DefaultAccessAdministrationApi = Omit<DefaultAccessApi, 'withTransaction'>;

export function createDefaultAccessHandler(
  api: DefaultAccessAdministrationApi,
): AuthorizationRouteHandler {
  const routes = createSettingsRouter();

  routes.get(DEFAULT_ACCESS_ROUTE_PATH, async (context) => {
    await requireSettings(context.env.authorization, 'default-access', 'read');
    return context.json({ data: await api.list() });
  });

  // An upsert: which permission it needs depends on whether the rule is there.
  routes.put(DEFAULT_ACCESS_ROUTE_PATH, async (context) => {
    const rule = parseDefaultAccessRule(await context.req.json());
    const existing = await api.get(rule.resource.type, rule.resource.id);
    await requireSettings(
      context.env.authorization,
      'default-access',
      existing ? 'update' : 'create',
    );
    return context.json({ data: await api.set(rule) });
  });

  routes.delete(`${DEFAULT_ACCESS_ROUTE_PATH}/:type/:id`, async (context) => {
    await requireSettings(
      context.env.authorization,
      'default-access',
      'delete',
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

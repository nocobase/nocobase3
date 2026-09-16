import type { AuthorizationRouteHandler } from '@nocobase/authorization/core';
import {
  createRouteHandler,
  createSettingsRouter,
  requireSettings,
} from '@nocobase/app-plugin-authorization/server/management';
import {
  object,
  ruleBase,
  scope,
  string,
  strings,
} from '@nocobase/app-plugin-authorization/server/management';
import type { SharingRule } from '@nocobase/authorization/sharing-rules';
import type { SharingRulesApi } from '@nocobase/authorization/sharing-rules';

/** Where the plugin registers its routes, and the prefix every path below carries. */
export const SHARING_RULES_ROUTE_PATH = '/sharing-rules';

type SharingRulesAdministrationApi = Omit<SharingRulesApi, 'withTransaction'>;

export function createSharingRulesHandler(
  api: SharingRulesAdministrationApi,
): AuthorizationRouteHandler {
  const routes = createSettingsRouter();

  routes.get(SHARING_RULES_ROUTE_PATH, async (context) => {
    await requireSettings(context.env.authorization, 'sharing-rules', 'read');
    return context.json({ data: await api.list() });
  });

  routes.post(SHARING_RULES_ROUTE_PATH, async (context) => {
    await requireSettings(context.env.authorization, 'sharing-rules', 'create');
    return context.json(
      { data: await api.create(parseSharingRule(await context.req.json())) },
      201,
    );
  });

  routes.put(`${SHARING_RULES_ROUTE_PATH}/:key`, async (context) => {
    await requireSettings(context.env.authorization, 'sharing-rules', 'update');
    return context.json({
      data: await api.update(
        context.req.param('key'),
        parseSharingRule(await context.req.json()),
      ),
    });
  });

  routes.delete(`${SHARING_RULES_ROUTE_PATH}/:key`, async (context) => {
    await requireSettings(context.env.authorization, 'sharing-rules', 'delete');
    await api.delete(context.req.param('key'));
    return context.body(null, 204);
  });

  return createRouteHandler(routes);
}

function parseSharingRule(value: unknown): SharingRule {
  const input = object(value, 'sharing rule');
  return { ...ruleBase(input), actions: sharingActions(input.actions) };
}

function sharingActions(value: unknown): SharingRule['actions'] {
  if (!Array.isArray(value)) throw new TypeError('actions must be an array');
  return value.map((entry) => {
    const item = object(entry, 'action');
    const selection = object(item.selection, 'selection');
    if (selection.type !== 'records' && selection.type !== 'policy') {
      throw new TypeError('selection type must be records or policy');
    }
    if (selection.type === 'records') {
      return {
        action: string(item.action, 'action'),
        selection: {
          type: 'records' as const,
          ids: strings(selection.ids, 'ids'),
        },
      };
    }
    const policy = scope(selection.policy);
    if (policy.type === 'ids') {
      throw new TypeError(
        'Sharing policy cannot use specific IDs; use records selection instead',
      );
    }
    return {
      action: string(item.action, 'action'),
      selection: { type: 'policy' as const, policy },
    };
  });
}

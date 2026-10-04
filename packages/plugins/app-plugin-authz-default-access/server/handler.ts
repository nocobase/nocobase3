import { ApiError, parseApiInput } from '@nocobase/app-server/router';
import type { AuthorizationRouteHandler } from '@nocobase/authorization/core';
import {
  DefaultAccessConflictError,
  type DefaultAccessApi,
  type DefaultAccessRule,
} from '@nocobase/authorization/default-access';
import {
  AUTHORIZATION_ERROR_DOMAIN,
  createRouteHandler,
  createRuleSupportRoutes,
  createSettingsRouter,
  DataScopeRuleBody,
  DataScopeRulePatchBody,
  parse,
  requireSettings,
  settingsAccess,
  RuleParams,
  validateDataScopeRule,
  type AuthorizationExtensionHost,
} from '@nocobase/app-plugin-authorization/server/extension';
import { validator } from 'hono/validator';

/** The settings item suffix, and the rule name stored grants refer to. */
export const DEFAULT_ACCESS_RULE = 'default-access';
export const DEFAULT_ACCESS_SETTINGS: string = `authorization.${DEFAULT_ACCESS_RULE}`;
/** The route prefix under `/api/authorization`. */
export const DEFAULT_ACCESS_PATH = '/defaultAccess';

type DefaultAccessAdministrationApi = Omit<DefaultAccessApi, 'withTransaction'>;

/** Every `/defaultAccess` route, gated by `settings:authorization.default-access`. */
export function createDefaultAccessHandler(
  authz: AuthorizationExtensionHost,
  api: DefaultAccessAdministrationApi,
): AuthorizationRouteHandler {
  const routes = createSettingsRouter((error) =>
    error instanceof DefaultAccessConflictError
      ? new ApiError({
          status: 'ALREADY_EXISTS',
          reason: 'DEFAULT_ACCESS_CONFLICT',
          domain: AUTHORIZATION_ERROR_DOMAIN,
          message: error.message,
          metadata: { existing: error.existing },
          cause: error,
        })
      : undefined,
  );
  const checked = (value: unknown): DefaultAccessRule => {
    const { key, resource, actions } = parse.rule(value);
    const rule = { key, resource, actions };
    validateDataScopeRule(authz, rule);
    return rule;
  };
  const existing = async (key: string): Promise<DefaultAccessRule> => {
    const rule = await api.get(key);
    if (rule) return rule;
    throw new ApiError({
      status: 'NOT_FOUND',
      reason: 'RULE_NOT_FOUND',
      domain: AUTHORIZATION_ERROR_DOMAIN,
      message: `Default-access rule ${key} was not found.`,
    });
  };
  // Fixed segments (`options`, `subjects`, `records`) are registered before `/:key`.
  routes.route(
    '/',
    createRuleSupportRoutes(authz, {
      path: DEFAULT_ACCESS_PATH,
      settings: DEFAULT_ACCESS_SETTINGS,
    }),
  );
  routes.get(DEFAULT_ACCESS_PATH, async (context) => {
    await requireSettings(
      context.env.authorization,
      DEFAULT_ACCESS_SETTINGS,
      'read',
    );
    return context.json({ data: await api.list() });
  });
  routes.post(
    DEFAULT_ACCESS_PATH,
    settingsAccess(DEFAULT_ACCESS_SETTINGS, 'create'),
    validator('json', (value) => parseApiInput(DataScopeRuleBody, value)),
    async (context) => {
      const rule = checked(context.req.valid('json'));
      return context.json({ data: await api.create(rule) }, 201);
    },
  );
  routes.patch(
    `${DEFAULT_ACCESS_PATH}/:key`,
    settingsAccess(DEFAULT_ACCESS_SETTINGS, 'update'),
    validator('param', (value) => parseApiInput(RuleParams, value)),
    validator('json', (value) => parseApiInput(DataScopeRulePatchBody, value)),
    async (context) => {
      const { key } = context.req.valid('param');
      const rule = checked({
        ...(await existing(key)),
        ...context.req.valid('json'),
      });
      return context.json({ data: await api.update(key, rule) });
    },
  );
  routes.delete(
    `${DEFAULT_ACCESS_PATH}/:key`,
    settingsAccess(DEFAULT_ACCESS_SETTINGS, 'delete'),
    validator('param', (value) => parseApiInput(RuleParams, value)),
    async (context) => {
      const { key } = context.req.valid('param');
      await existing(key);
      await api.delete(key);
      return context.body(null, 204);
    },
  );
  return createRouteHandler(routes);
}

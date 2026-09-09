import {
  authenticationToken,
  UserAdministrationError,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { loggingToken } from '@nocobase/app-server/logging';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { Hono } from 'hono';

import {
  UserManagementError,
  UserRoleScopeError,
  userManagementServiceToken,
  type CreateManagedUserInput,
  type UserRoleValue,
} from '../tokens.js';

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const users = container.resolve(userManagementServiceToken);
    const securityLogger = container.has(loggingToken)
      ? container.resolve(loggingToken).getLogger('security')
      : undefined;

    routes.onError((error, context) => {
      if (error instanceof AuthorizationDeniedError) {
        return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
      }
      if (error instanceof UserManagementError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status,
        );
      }
      if (error instanceof UserRoleScopeError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status,
        );
      }
      if (error instanceof UserAdministrationError) {
        const status =
          error.code === 'USER_NOT_FOUND'
            ? 404
            : error.code.endsWith('_CONFLICT')
              ? 409
              : 400;
        return context.json(
          { code: error.code, message: error.message },
          status,
        );
      }
      if (error instanceof TypeError) {
        return context.json(
          { code: 'INVALID_USER_INPUT', message: error.message },
          400,
        );
      }
      throw error;
    });

    routes.use('*', authentication.required(), authorization.middleware());

    routes.get('/options', async (context) => {
      await requireUserAction(context, '*', 'read');
      return context.json({ data: await users.options() });
    });

    routes.get('/', async (context) => {
      await requireUserAction(context, '*', 'read');
      return context.json({
        data: await users.list({
          page: optionalNumber(context.req.query('page')),
          pageSize: optionalNumber(context.req.query('pageSize')),
          search: context.req.query('search'),
          status: optionalStatus(context.req.query('status')),
          roleScope: context.req.query('roleScope'),
          role: context.req.query('role'),
        }),
      });
    });

    routes.post('/', async (context) => {
      await requireUserAction(context, '*', 'create');
      await requireUserAction(context, '*', 'assign-role');
      const input = parseCreateUser(await context.req.json());
      const user = await users.create(input);
      logSecurityEvent(securityLogger, context, 'user.create', user.id, {
        roleScopes: Object.keys(input.roleScopes ?? {}).sort(),
      });
      return context.json({ data: user }, 201);
    });

    routes.patch('/:userId', async (context) => {
      const userId = context.req.param('userId');
      await requireUserAction(context, userId, 'update');
      const input = record(await context.req.json(), 'User');
      const user = await users.update(userId, {
        ...(input.name === undefined
          ? {}
          : { name: string(input.name, 'User name') }),
        ...(input.username === undefined
          ? {}
          : input.username === null
            ? { username: null }
            : { username: string(input.username, 'Username') }),
        ...(input.email === undefined
          ? {}
          : { email: string(input.email, 'User email') }),
      });
      logSecurityEvent(securityLogger, context, 'user.update', userId);
      return context.json({
        data: user,
      });
    });

    routes.post('/:userId/disable', async (context) => {
      const userId = context.req.param('userId');
      await requireUserAction(context, userId, 'disable');
      const user = await users.disable(userId);
      logSecurityEvent(securityLogger, context, 'user.disable', userId);
      return context.json({ data: user });
    });

    routes.post('/:userId/enable', async (context) => {
      const userId = context.req.param('userId');
      await requireUserAction(context, userId, 'enable');
      const user = await users.enable(userId);
      logSecurityEvent(securityLogger, context, 'user.enable', userId);
      return context.json({ data: user });
    });

    routes.put('/:userId/role-scopes/:scope', async (context) => {
      const userId = context.req.param('userId');
      await requireUserAction(context, userId, 'assign-role');
      const input = record(await context.req.json(), 'User role scope');
      const scope = context.req.param('scope');
      const value = parseRoleValue(input.value);
      const user = await users.replaceRoleScope(userId, scope, value);
      logSecurityEvent(securityLogger, context, 'user.role.update', userId, {
        roleScope: scope,
        roles: typeof value === 'string' ? [value] : [...value],
      });
      return context.json({
        data: user,
      });
    });

    routes.post('/:userId/reset-password', async (context) => {
      const userId = context.req.param('userId');
      await requireUserAction(context, userId, 'reset-password');
      const input = record(await context.req.json(), 'Password reset');
      await users.resetPassword(userId, string(input.password, 'Password'));
      logSecurityEvent(securityLogger, context, 'user.password.reset', userId);
      return context.json({ data: { success: true } });
    });

    routes.post('/:userId/revoke-sessions', async (context) => {
      const userId = context.req.param('userId');
      await requireUserAction(context, userId, 'revoke-sessions');
      await users.revokeSessions(userId);
      logSecurityEvent(securityLogger, context, 'user.sessions.revoke', userId);
      return context.json({ data: { success: true } });
    });

    router.route('/users', routes);
    return router;
  });

function logSecurityEvent(
  logger:
    | {
        info(
          bindings: Readonly<Record<string, unknown>>,
          message: string,
        ): void;
      }
    | undefined,
  context: {
    get(key: 'authz'): AuthorizationEnv['Variables']['authz'];
  },
  event: string,
  targetUserId: string,
  details: Readonly<Record<string, unknown>> = {},
): void {
  logger?.info(
    {
      event,
      actorId: context.get('authz').identity.principal.id,
      targetUserId,
      ...details,
    },
    event,
  );
}

async function requireUserAction(
  context: {
    get(key: 'authz'): AuthorizationEnv['Variables']['authz'];
  },
  userId: string,
  action: string,
): Promise<void> {
  await context.get('authz').require({
    resource: { type: 'user', id: userId },
    action,
  });
}

function parseCreateUser(value: unknown): CreateManagedUserInput {
  const input = record(value, 'User');
  const roleScopes = input.roleScopes;
  return {
    name: string(input.name, 'User name'),
    ...(input.username === undefined
      ? {}
      : { username: string(input.username, 'Username') }),
    email: string(input.email, 'User email'),
    password: string(input.password, 'Password'),
    ...(roleScopes === undefined
      ? {}
      : {
          roleScopes: Object.fromEntries(
            Object.entries(record(roleScopes, 'User role scopes')).map(
              ([key, role]) => [key, parseRoleValue(role)],
            ),
          ),
        }),
  };
}

function parseRoleValue(value: unknown): UserRoleValue {
  if (typeof value === 'string' && value.length > 0) return value;
  if (isStringArray(value)) {
    return value;
  }
  throw new TypeError('User role scope value must be a role or role list');
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown): item is string =>
        typeof item === 'string' && item.length > 0,
    )
  );
}

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new TypeError('Pagination values must be positive integers');
  }
  return number;
}

function optionalStatus(
  value: string | undefined,
): 'enabled' | 'disabled' | undefined {
  if (value === undefined) return undefined;
  if (value === 'enabled' || value === 'disabled') return value;
  throw new TypeError('User status must be enabled or disabled');
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;

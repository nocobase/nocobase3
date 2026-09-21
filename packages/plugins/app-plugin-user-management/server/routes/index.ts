import {
  authenticationToken,
  AuthenticationCredentialError,
} from '@nocobase/app-plugin-authentication';
import {
  UserError,
  UserLifecycleError,
} from '@nocobase/app-plugin-users/server';
import { TransactionPostCommitError } from '@nocobase/db';
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
import { PermissionSetLastAssignmentError } from '@nocobase/authorization/permissions';
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
      // The database change is committed; only a post-commit effect such as a
      // realtime disconnect failed. Tell the client not to retry the write.
      if (error instanceof TransactionPostCommitError) {
        securityLogger?.warn(
          {
            event: 'user.post-commit-failed',
            errors: error.errors.map((cause) =>
              cause instanceof Error ? cause.message : String(cause),
            ),
          },
          error.message,
        );
        return context.json(
          {
            code: 'USER_POST_COMMIT_FAILED',
            committed: true,
            retryScheduled: false,
            message: error.message,
          },
          202,
        );
      }
      if (error instanceof AuthorizationDeniedError) {
        return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
      }
      if (error instanceof UserManagementError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status,
        );
      }
      // Disabling an account can take away the last assignment of a
      // Permission Set the application must keep someone able to use.
      if (error instanceof PermissionSetLastAssignmentError) {
        return context.json(
          { code: 'LAST_ASSIGNMENT', message: error.message },
          409,
        );
      }
      // Role scopes and lifecycle handlers reject with their own code and status.
      if (
        error instanceof UserRoleScopeError ||
        error instanceof UserLifecycleError
      ) {
        return context.json(
          { code: error.code, message: error.message },
          error.status,
        );
      }
      // Identity errors come from users, credential errors from authentication.
      if (
        error instanceof UserError ||
        error instanceof AuthenticationCredentialError
      ) {
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

    /**
     * Audits a change once it is committed, which includes the case where a
     * post-commit effect failed afterwards: the record changed either way.
     */
    const audited = async <T>(
      context: Parameters<typeof logSecurityEvent>[1],
      event: string,
      targetUserId: string | ((result: T) => string),
      run: () => Promise<T>,
      details?: Readonly<Record<string, unknown>>,
    ): Promise<T> => {
      const target = (result?: T): string =>
        typeof targetUserId === 'string'
          ? targetUserId
          : result === undefined
            ? 'unknown'
            : targetUserId(result);
      try {
        const result = await run();
        logSecurityEvent(
          securityLogger,
          context,
          event,
          target(result),
          details,
        );
        return result;
      } catch (error) {
        if (error instanceof TransactionPostCommitError) {
          logSecurityEvent(securityLogger, context, event, target(), {
            ...details,
            postCommitFailed: true,
          });
        }
        throw error;
      }
    };

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
      const user = await audited(
        context,
        'user.create',
        (created) => created.id,
        () => users.create(input),
        { roleScopes: Object.keys(input.roleScopes ?? {}).sort() },
      );
      return context.json({ data: user }, 201);
    });

    routes.patch('/:userId', async (context) => {
      const userId = context.req.param('userId');
      await requireUserAction(context, userId, 'update');
      const input = record(await context.req.json(), 'User');
      const user = await audited(context, 'user.update', userId, () =>
        users.update(userId, {
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
        }),
      );
      return context.json({
        data: user,
      });
    });

    routes.delete('/:userId', async (context) => {
      const userId = context.req.param('userId');
      await requireUserAction(context, userId, 'delete');
      const input = record(await context.req.json(), 'User deletion');
      if (input.confirm !== true) throw new TypeError('Confirm user deletion.');
      await audited(context, 'user.delete', userId, () =>
        users.remove(userId, context.get('authz').identity.principal.id),
      );
      return context.json({ data: { success: true } });
    });

    routes.post('/:userId/disable', async (context) => {
      const userId = context.req.param('userId');
      await requireUserAction(context, userId, 'disable');
      const user = await audited(context, 'user.disable', userId, () =>
        users.disable(userId),
      );
      return context.json({ data: user });
    });

    routes.post('/:userId/enable', async (context) => {
      const userId = context.req.param('userId');
      await requireUserAction(context, userId, 'enable');
      const user = await audited(context, 'user.enable', userId, () =>
        users.enable(userId),
      );
      return context.json({ data: user });
    });

    routes.put('/:userId/role-scopes/:scope', async (context) => {
      const userId = context.req.param('userId');
      await requireUserAction(context, userId, 'assign-role');
      const input = record(await context.req.json(), 'User role scope');
      const scope = context.req.param('scope');
      const value = parseRoleValue(input.value);
      const user = await audited(
        context,
        'user.role.update',
        userId,
        () => users.replaceRoleScope(userId, scope, value),
        {
          roleScope: scope,
          roles: typeof value === 'string' ? [value] : [...value],
        },
      );
      return context.json({
        data: user,
      });
    });

    routes.post('/:userId/reset-password', async (context) => {
      const userId = context.req.param('userId');
      await requireUserAction(context, userId, 'reset-password');
      const input = record(await context.req.json(), 'Password reset');
      await audited(context, 'user.password.reset', userId, () =>
        users.resetPassword(userId, string(input.password, 'Password')),
      );
      return context.json({ data: { success: true } });
    });

    routes.post('/:userId/revoke-sessions', async (context) => {
      const userId = context.req.param('userId');
      await requireUserAction(context, userId, 'revoke-sessions');
      await audited(context, 'user.sessions.revoke', userId, () =>
        users.revokeSessions(userId),
      );
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

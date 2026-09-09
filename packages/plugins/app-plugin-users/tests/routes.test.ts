import {
  authenticationToken,
  type Auth,
  UserAdministrationError,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import { loggingToken } from '@nocobase/app-server/logging';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import { apiRoutes } from '../server/routes/index.js';
import {
  userManagementServiceToken,
  type UserManagementService,
} from '../server/tokens.js';

describe('@nocobase/app-plugin-users API routes', () => {
  it('rejects anonymous requests before calling the service', async () => {
    const service = userService();
    const router = await apiRoutes.createRouter(
      createApplication('anonymous', service),
    );

    const response = await router.request('/users');

    expect(response.status).toBe(401);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('rejects authenticated users without the requested action', async () => {
    const service = userService();
    const router = await apiRoutes.createRouter(
      createApplication('forbidden', service),
    );

    const response = await router.request('/users');

    expect(response.status).toBe(403);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('requires create and assign-role before creating an account', async () => {
    const service = userService();
    const requireAction = vi.fn(async (request: { action: string }) => {
      if (request.action === 'assign-role') throw denied();
    });
    const router = await apiRoutes.createRouter(
      createApplication('allowed', service, { requireAction }),
    );

    const response = await router.request('/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'secret123',
        roleScopes: { hub: 'hub-viewer' },
      }),
    });

    expect(response.status).toBe(403);
    expect(requireAction.mock.calls.map(([request]) => request.action)).toEqual(
      ['create', 'assign-role'],
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('writes a safe structured event after account creation', async () => {
    const service = userService();
    const logger = { info: vi.fn() };
    const router = await apiRoutes.createRouter(
      createApplication('allowed', service, { logger }),
    );

    const response = await router.request('/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'do-not-log-this',
        roleScopes: { hub: 'hub-viewer' },
      }),
    });

    expect(response.status).toBe(201);
    expect(logger.info).toHaveBeenCalledWith(
      {
        event: 'user.create',
        actorId: 'admin-1',
        targetUserId: 'user-1',
        roleScopes: ['hub'],
      },
      'user.create',
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(
      'do-not-log-this',
    );
  });

  it('returns 409 when an administrator creates a duplicate identity', async () => {
    const service = userService();
    vi.mocked(service.create).mockRejectedValue(
      new UserAdministrationError(
        'USER_EMAIL_CONFLICT',
        'A user with this email already exists',
      ),
    );
    const router = await apiRoutes.createRouter(
      createApplication('allowed', service),
    );

    const response = await router.request('/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'secret123',
        roleScopes: { hub: 'hub-viewer' },
      }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: 'USER_EMAIL_CONFLICT',
      message: 'A user with this email already exists',
    });
  });

  it.each([
    ['PATCH', '/users/user-1', 'update'],
    ['POST', '/users/user-1/disable', 'disable'],
    ['POST', '/users/user-1/enable', 'enable'],
    ['PUT', '/users/user-1/role-scopes/hub', 'assign-role'],
    ['POST', '/users/user-1/reset-password', 'reset-password'],
    ['POST', '/users/user-1/revoke-sessions', 'revoke-sessions'],
  ] as const)('checks %s %s with user:%s', async (method, path, action) => {
    const requireAction = vi.fn(() => Promise.resolve());
    const router = await apiRoutes.createRouter(
      createApplication('allowed', userService(), { requireAction }),
    );
    const body = path.endsWith('reset-password')
      ? { password: 'secret123' }
      : path.includes('role-scopes')
        ? { value: 'hub-viewer' }
        : method === 'PATCH'
          ? { name: 'Updated' }
          : undefined;

    const response = await router.request(path, {
      method,
      ...(body
        ? {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    });

    expect(response.status).toBe(200);
    expect(requireAction).toHaveBeenCalledWith({
      resource: { type: 'user', id: 'user-1' },
      action,
    });
  });

  it('allows an optional multi-role scope to be cleared', async () => {
    const service = userService();
    const router = await apiRoutes.createRouter(
      createApplication('allowed', service),
    );

    const response = await router.request('/users/user-1/role-scopes/teams', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: [] }),
    });

    expect(response.status).toBe(200);
    expect(service.replaceRoleScope).toHaveBeenCalledWith(
      'user-1',
      'teams',
      [],
    );
  });
});

function createApplication(
  mode: 'anonymous' | 'forbidden' | 'allowed',
  service: UserManagementService,
  options: {
    readonly requireAction?: (request: {
      readonly resource: { readonly type: string; readonly id: string };
      readonly action: string;
    }) => Promise<void>;
    readonly logger?: { info: ReturnType<typeof vi.fn> };
  } = {},
): AppPluginApplication {
  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required: () => async (context, next) => {
      if (mode === 'anonymous') {
        return context.json({ code: 'UNAUTHORIZED' }, 401);
      }
      await next();
    },
  } as Auth);
  container.instance(authorizationToken, {
    middleware: () => async (context, next) => {
      context.set('authz', {
        identity: { principal: { type: 'user', id: 'admin-1' } },
        require:
          options.requireAction ??
          (() =>
            mode === 'forbidden'
              ? Promise.reject(denied())
              : Promise.resolve()),
      });
      await next();
    },
  } as AppAuthorization);
  container.instance(userManagementServiceToken, service);
  if (options.logger) {
    container.instance(loggingToken, {
      getLogger: () => options.logger,
    } as never);
  }
  return {
    appName: 'test',
    publicBasePath: '',
    config: {} as AppPluginApplication['config'],
    paths: {} as AppPluginApplication['paths'],
    router: {} as AppPluginApplication['router'],
    container,
  };
}

function userService(): UserManagementService {
  const now = new Date();
  const user = {
    id: 'user-1',
    name: 'Alice',
    email: 'alice@example.com',
    emailVerified: false,
    disabledAt: null,
    createdAt: now,
    updatedAt: now,
    roleScopes: { hub: 'hub-viewer' },
  } as const;
  return {
    options: vi.fn(() => Promise.resolve({ roleScopes: [] })),
    list: vi.fn(() =>
      Promise.resolve({ items: [user], total: 1, page: 1, pageSize: 20 }),
    ),
    create: vi.fn(() => Promise.resolve(user)),
    update: vi.fn(() => Promise.resolve(user)),
    disable: vi.fn(() => Promise.resolve({ ...user, disabledAt: now })),
    enable: vi.fn(() => Promise.resolve(user)),
    replaceRoleScope: vi.fn(() => Promise.resolve(user)),
    resetPassword: vi.fn(() => Promise.resolve()),
    revokeSessions: vi.fn(() => Promise.resolve()),
  };
}

function denied(): AuthorizationDeniedError {
  return new AuthorizationDeniedError({
    effect: 'deny',
    reasons: [{ code: 'USER_ACCESS_DENIED', message: 'Forbidden' }],
  });
}

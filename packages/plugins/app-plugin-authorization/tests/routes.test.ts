import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createConfigPaths } from '@nocobase/app-server/config';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';

import {
  authorizationToken,
  protectedPermissionSetRegistryToken,
  type AppAuthorization,
} from '../server/index.js';
import { createProtectedPermissionSetRegistry } from '../server/protected-permission-sets.js';
import { apiRoutes } from '../server/routes/index.js';

describe('@nocobase/app-plugin-authorization routes', () => {
  it('protects its HTTP routes with authentication', async () => {
    const container = new ServiceContainer();
    container.instance(authenticationToken, {
      required: () => (context) =>
        Promise.resolve(
          context.json(
            { code: 'UNAUTHORIZED', message: 'Authentication required' },
            401,
          ),
        ),
    } as unknown as Auth);
    container.instance(authorizationToken, {
      middleware: () => async (_context, next) => next(),
    } as unknown as AppAuthorization);
    container.instance(
      protectedPermissionSetRegistryToken,
      createProtectedPermissionSetRegistry(),
    );

    const router = await apiRoutes.createRouter({
      appName: 'main',
      publicBasePath: '/main',
      config: { app: { name: 'main', publicBasePath: '/main' } },
      paths: createConfigPaths({ rootDir: '/missing' }),
      router: new Hono(),
      container,
    });

    const response = await router.request('/authz/permissions');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  });

  it.each([
    { existing: undefined, expected: 'create' },
    {
      existing: {
        resource: { type: 'database.collection', id: 'main.orders' },
        actions: [],
      },
      expected: 'update',
    },
  ])(
    'checks $expected when setting default access',
    async ({ existing, expected }) => {
      const container = new ServiceContainer();
      const require = vi.fn(() => Promise.resolve());
      const set = vi.fn((rule: object) => Promise.resolve(rule));
      container.instance(authenticationToken, {
        required: () => async (_context, next) => next(),
      } as unknown as Auth);
      container.instance(authorizationToken, {
        middleware: () => async (context, next) => {
          context.set('authz', { require });
          await next();
        },
        defaultAccess: {
          get: () => Promise.resolve(existing),
          set,
        },
      } as unknown as AppAuthorization);
      container.instance(
        protectedPermissionSetRegistryToken,
        createProtectedPermissionSetRegistry(),
      );
      const router = await apiRoutes.createRouter({
        appName: 'main',
        publicBasePath: '/main',
        config: { app: { name: 'main', publicBasePath: '/main' } },
        paths: createConfigPaths({ rootDir: '/missing' }),
        router: new Hono(),
        container,
      });

      const response = await router.request('/authz/default-access', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resource: { type: 'database.collection', id: 'main.orders' },
          actions: [{ action: 'read', scope: { type: 'all' } }],
        }),
      });

      expect(response.status).toBe(200);
      expect(require).toHaveBeenCalledWith({
        resource: { type: 'authorization.settings', id: 'default-access' },
        action: expected,
      });
      expect(set).toHaveBeenCalledOnce();
    },
  );

  it('rejects generic writes to protected Permission Sets and assignments', async () => {
    const container = new ServiceContainer();
    const update = vi.fn();
    const assign = vi.fn();
    const handler = vi.fn();
    const registry = createProtectedPermissionSetRegistry();
    registry.register('@nocobase/app-plugin-hub', ['hub-viewer']);
    container.instance(authenticationToken, {
      required: () => async (_context, next) => next(),
    } as unknown as Auth);
    container.instance(authorizationToken, {
      middleware: () => async (context, next) => {
        context.set('authz', { require: vi.fn(() => Promise.resolve()) });
        await next();
      },
      permissionSets: {
        update,
        assign,
        handler,
        listAssignments: vi.fn(() =>
          Promise.resolve([
            {
              id: 'protected-assignment',
              subject: { type: 'user', id: 'alice' },
              permissionSet: 'hub-viewer',
            },
          ]),
        ),
      },
    } as unknown as AppAuthorization);
    container.instance(protectedPermissionSetRegistryToken, registry);
    const router = await apiRoutes.createRouter({
      appName: 'main',
      publicBasePath: '',
      config: { app: { name: 'main', publicBasePath: '' } },
      paths: createConfigPaths({ rootDir: '/missing' }),
      router: new Hono(),
      container,
    });

    const responses = await Promise.all([
      router.request('/authz/permission-sets/hub-viewer', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'hub-viewer', grants: [] }),
      }),
      router.request('/authz/permission-sets/hub-viewer/assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject: { type: 'user', id: 'alice' },
        }),
      }),
      router.request(
        '/authz/permission-sets/assignments/protected-assignment',
        { method: 'DELETE' },
      ),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([403, 403, 403]);
    for (const response of responses) {
      await expect(response.json()).resolves.toMatchObject({
        code: 'PROTECTED_PERMISSION_SET',
      });
    }
    expect(update).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('preserves the existing ability to add a System Administrator', async () => {
    const container = new ServiceContainer();
    const assign = vi.fn(() =>
      Promise.resolve({
        id: 'system-admin-assignment',
        subject: { type: 'user', id: 'alice' },
        permissionSet: 'system-administrator',
      }),
    );
    const registry = createProtectedPermissionSetRegistry();
    registry.register('@nocobase/app-plugin-authorization', [
      'system-administrator',
    ]);
    container.instance(authenticationToken, {
      required: () => async (_context, next) => next(),
    } as unknown as Auth);
    container.instance(authorizationToken, {
      middleware: () => async (context, next) => {
        context.set('authz', { require: vi.fn(() => Promise.resolve()) });
        await next();
      },
      permissionSets: { assign },
    } as unknown as AppAuthorization);
    container.instance(protectedPermissionSetRegistryToken, registry);
    const router = await apiRoutes.createRouter({
      appName: 'main',
      publicBasePath: '',
      config: { app: { name: 'main', publicBasePath: '' } },
      paths: createConfigPaths({ rootDir: '/missing' }),
      router: new Hono(),
      container,
    });

    const response = await router.request(
      '/authz/permission-sets/system-administrator/assignments',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: { type: 'user', id: 'alice' } }),
      },
    );

    expect(response.status).toBe(201);
    expect(assign).toHaveBeenCalledWith({
      subject: { type: 'user', id: 'alice' },
      permissionSet: 'system-administrator',
    });
  });
});

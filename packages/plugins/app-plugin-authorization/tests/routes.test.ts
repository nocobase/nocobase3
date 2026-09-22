import { createAuthorization } from './authorization-fixture.js';
import { createPermissionSetHandler } from '../server/management/permission-sets.js';
import sqlite from '@nocobase/db-sqlite';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import { createAppPaths } from '@nocobase/app-server/config';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';

import { permissionSets } from '@nocobase/authorization';
import {
  AuthorizationRouteRegistry,
  type AuthorizationPlugin,
} from '@nocobase/authorization/core';
import {
  createDefaultAccessHandler,
  DEFAULT_ACCESS_ROUTE_PATH,
} from '../../app-plugin-authz-default-access/server/handler.js';

import {
  authorizationToken,
  createAppAuthorization,
  type Authorization,
} from '../server/index.js';
import { apiRoutes } from '../server/routes/index.js';
import { MockPermissionSetStore } from './mock-permission-set-store.js';

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
    } as unknown as Authorization);

    const router = await apiRoutes.createRouter({
      appName: 'main',
      publicBasePath: '/main',
      config: { app: { name: 'main', publicBasePath: '/main' } },
      paths: createAppPaths({ rootDir: '/missing' }),
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
    { existing: undefined, expected: 'configure' },
    {
      existing: {
        resource: { type: 'database.collection', id: 'orders' },
        actions: [],
      },
      expected: 'configure',
    },
  ])(
    'checks $expected when setting default access',
    async ({ existing, expected }) => {
      const container = new ServiceContainer();
      const require = vi.fn(() => Promise.resolve());
      const set = vi.fn((rule: object) => Promise.resolve(rule));
      const routes = new AuthorizationRouteRegistry();
      routes.add(
        DEFAULT_ACCESS_ROUTE_PATH,
        createDefaultAccessHandler({
          list: () => Promise.resolve([]),
          get: () => Promise.resolve(existing),
          set,
          delete: () => Promise.resolve(),
        }),
      );
      container.instance(authenticationToken, {
        required: () => async (_context, next) => next(),
      } as unknown as Auth);
      container.instance(authorizationToken, {
        middleware: () => async (context, next) => {
          context.set('authz', { require });
          await next();
        },
        routes,
      } as unknown as Authorization);
      const router = await protectedRouter(container);

      const response = await router.request('/api/authz/default-access', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resource: { type: 'database.collection', id: 'orders' },
          actions: [{ action: 'read', scope: { type: 'all' } }],
        }),
      });

      expect(response.status).toBe(200);
      expect(require).toHaveBeenCalledWith({
        resource: { type: 'settings', id: 'authorization.default-access' },
        action: expected,
      });
      expect(set).toHaveBeenCalledOnce();
    },
  );

  it('rejects generic writes to protected Permission Sets and assignments', async () => {
    const { container, authorization } = await protectedFixture();
    authorization.permissionSets.protect({
      owner: '@nocobase/app-plugin-hub',
      keys: ['hub-viewer'],
    });
    const router = await protectedRouter(container);

    const responses = await Promise.all([
      router.request('/api/authz/permission-sets/hub-viewer', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'hub-viewer', grants: [] }),
      }),
      router.request('/api/authz/permission-sets/hub-viewer/assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject: { type: 'user', id: 'bob' },
        }),
      }),
      router.request(
        '/api/authz/permission-sets/assignments/hub-viewer-alice',
        {
          method: 'DELETE',
        },
      ),
      router.request('/api/authz/permission-sets/hub-viewer', {
        method: 'DELETE',
      }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([403, 403, 403, 403]);
    for (const response of responses) {
      await expect(response.json()).resolves.toMatchObject({
        code: 'PROTECTED_PERMISSION_SET',
      });
    }
    expect(
      (await authorization.permissionSets.listAssignments('hub-viewer')).map(
        ({ id }) => id,
      ),
    ).toEqual(['hub-viewer-alice']);
  });

  it('assigns and revokes System Administrators but keeps the last one', async () => {
    const { container, authorization } = await protectedFixture();
    authorization.permissionSets.protect({
      owner: '@nocobase/app-plugin-authorization',
      keys: ['root'],
      allow: ['assign', 'revoke'],
      requireActiveAssignment: true,
      unrestricted: true,
    });
    const router = await protectedRouter(container);

    const response = await router.request(
      '/api/authz/permission-sets/root/assignments',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: { type: 'user', id: 'alice' } }),
      },
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: { permissionSet: 'root' },
    });

    const revoked = await router.request(
      '/api/authz/permission-sets/assignments/user:alice:root',
      { method: 'DELETE' },
    );
    expect(revoked.status).toBe(204);

    const last = await router.request(
      '/api/authz/permission-sets/assignments/user:admin:root',
      { method: 'DELETE' },
    );
    expect(last.status).toBe(409);
    await expect(last.json()).resolves.toMatchObject({
      code: 'LAST_ASSIGNMENT',
    });
  });

  it('no longer answers user lists; the Users API serves them', async () => {
    const { container } = await protectedFixture();
    const router = await protectedRouter(container);

    const responses = await Promise.all(
      [
        '/api/authz/permission-sets/users',
        '/api/authz/sharing-rules/users',
        '/api/authz/restriction-rules/users',
      ].map((path) => router.request(path)),
    );

    expect(responses.map(({ status }) => status)).toEqual([404, 404, 404]);
  });

  it('lets the seeded superuser administer without holding any grant', async () => {
    const identity: AuthorizationPlugin = {
      id: 'test-identity',
      setup(authz) {
        authz.use(async (request, next) => {
          request.principal = { type: 'user', id: 'root' };
          await next();
        });
      },
    };
    const authorization = createAuthorization({
      plugins: [
        identity,
        permissionSets({ store: new MockPermissionSetStore() }),
      ],
    }) as unknown as Authorization;
    // Exactly what the seed writes: the superuser set carries no grants.
    await authorization.permissionSets.create({
      key: 'root',
      title: 'System administrator',
      grants: [],
    });
    await authorization.permissionSets.assign({
      permissionSet: 'root',
      subject: { type: 'user', id: 'root' },
    });
    const container = new ServiceContainer();
    container.instance(authenticationToken, {
      required: () => async (_context, next) => next(),
    } as unknown as Auth);
    container.instance(authorizationToken, authorization);
    const router = await protectedRouter(container);

    const denied = await router.request('/api/authz/permission-sets');
    expect(denied.status).toBe(403);

    authorization.permissionSets.protect({
      owner: '@nocobase/app-plugin-authorization',
      keys: ['root'],
      unrestricted: true,
    });
    const permitted = await router.request('/api/authz/permission-sets');

    expect(permitted.status).toBe(200);
    await expect(permitted.json()).resolves.toMatchObject({
      data: [{ key: 'root', grants: [] }],
    });
  });
});

describe('the subject types the root Permission Set accepts', () => {
  let database: DatabaseManager;
  let router: Hono;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    await createMigrator({
      database,
      packageName: '@nocobase/app-plugin-authorization',
      directory: fileURLToPath(
        new URL('../database/migrations', import.meta.url),
      ),
    }).latest();
    const authorization = createAppAuthorization({
      connection: database.connection(),
    }) as unknown as Authorization;
    for (const key of ['root', 'member']) {
      await authorization.permissionSets.create({ key, grants: [] });
    }
    // The superuser set carries no grants; holding it is what administers.
    await authorization.permissionSets.assign({
      permissionSet: 'root',
      subject: { type: 'user', id: 'admin' },
    });
    const container = new ServiceContainer();
    container.instance(authenticationToken, {
      required: () => async (context, next) => {
        context.set('auth', { user: { id: 'admin' } });
        await next();
      },
    } as unknown as Auth);
    container.instance(authorizationToken, authorization);
    router = await protectedRouter(container);
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('refuses the audience that would make every signed-in user unrestricted', async () => {
    const audience = await router.request(
      '/api/authz/permission-sets/root/assignments',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: { type: 'authenticated', id: '*' } }),
      },
    );

    expect(audience.status).toBe(403);
    await expect(audience.json()).resolves.toMatchObject({
      code: 'PERMISSION_SET_SUBJECT_NOT_ALLOWED',
    });

    const user = await router.request(
      '/api/authz/permission-sets/root/assignments',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: { type: 'user', id: 'alice' } }),
      },
    );

    expect(user.status).toBe(201);
  });

  it('reports the restriction on the root set alone', async () => {
    const response = await router.request('/api/authz/permission-sets');

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: readonly {
        key: string;
        protection?: { assignableTo?: readonly string[] };
      }[];
    };
    const protection = (key: string): unknown =>
      body.data.find((set) => set.key === key)?.protection;
    expect(protection('root')).toMatchObject({ assignableTo: ['user'] });
    expect(protection('member')).not.toHaveProperty('assignableTo');
  });
});

/** The plugin routes mounted under /api, where the Permission Set handler expects them. */
async function protectedRouter(container: ServiceContainer): Promise<Hono> {
  const authorization = container.resolve(authorizationToken);
  if (
    !authorization.routes.list().includes('/permission-sets') &&
    authorization.permissionSets
  )
    authorization.routes.add(
      '/permission-sets',
      createPermissionSetHandler(authorization.permissionSets),
    );
  const routes = await apiRoutes.createRouter({
    appName: 'main',
    publicBasePath: '',
    config: { app: { name: 'main', publicBasePath: '' } },
    paths: createAppPaths({ rootDir: '/missing' }),
    router: new Hono(),
    container,
  });
  return new Hono().route('/api', routes);
}

/** A real Permission Sets plugin behind the routes, with 'admin' holding every settings grant. */
async function protectedFixture(): Promise<{
  container: ServiceContainer;
  authorization: Authorization;
}> {
  const identity: AuthorizationPlugin = {
    id: 'test-identity',
    setup(authz) {
      authz.use(async (request, next) => {
        request.principal = { type: 'user', id: 'admin' };
        await next();
      });
    },
  };
  const authorization = createAuthorization({
    plugins: [
      identity,
      permissionSets({ store: new MockPermissionSetStore() }),
    ],
  }) as unknown as Authorization;
  await authorization.permissionSets.create({
    key: 'root',
    grants: [
      {
        resource: { type: 'settings', id: '*' },
        actions: ['read', 'create', 'update', 'delete', 'assign'].map(
          (action) => ({
            action,
          }),
        ),
      },
    ],
  });
  await authorization.permissionSets.create({ key: 'hub-viewer', grants: [] });
  await authorization.permissionSets.assign({
    id: 'user:admin:root',
    permissionSet: 'root',
    subject: { type: 'user', id: 'admin' },
  });
  await authorization.permissionSets.assign({
    id: 'hub-viewer-alice',
    permissionSet: 'hub-viewer',
    subject: { type: 'user', id: 'alice' },
  });
  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required: () => async (_context, next) => next(),
  } as unknown as Auth);
  container.instance(authorizationToken, authorization);
  return { container, authorization };
}

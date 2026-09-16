import defaultAccessRoutes from '../../app-plugin-authz-default-access/server/routes.js';
import sharingRulesRoutes from '../../app-plugin-authz-sharing-rules/server/routes.js';
import restrictionRulesRoutes from '../../app-plugin-authz-restriction-rules/server/routes.js';
import { defaultAccess } from '@nocobase/app-plugin-authz-default-access/server';
import { restrictionRules } from '@nocobase/app-plugin-authz-restriction-rules/server';
import { sharingRules } from '@nocobase/app-plugin-authz-sharing-rules/server';
import {
  PERMISSION_SETS_PROTECTION_OWNER,
  type PermissionSetsApi,
  type PermissionSetsAuthorizationApi,
} from '@nocobase/authorization/permissions';
import {
  databaseManagerToken,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import { createConfigPaths } from '@nocobase/app-server/config';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createOrdersDatabase, orderFields } from './orders-database.js';

import {
  createAppAuthorization,
  type CreateAppAuthorizationOptions,
} from '../server/authorization.js';
import type {
  Authorization,
  AuthorizationPlugin,
} from '@nocobase/authorization/core';

import type { AuthorizationConfig } from '../server/authorization.js';
import { apiRoutes } from '../server/routes/index.js';
import {
  authorizationToken,
  type AppAuthorizationService,
} from '../server/tokens.js';

/** Collection metadata comes from db, so the options endpoints need a real one. */
let database: DatabaseManager;
let connection: DatabaseConnection;

beforeAll(async () => {
  database = await createOrdersDatabase();
  connection = database.connection();
});

afterAll(async () => {
  await database.destroy();
});

/** The plugin list all three templates ship; Permission Sets, page and database authorization are built in. */
const templatePlugins = (): AuthorizationPlugin[] => [
  defaultAccess(),
  sharingRules(),
  restrictionRules(),
];

function authorizationWith(
  config: AuthorizationConfig,
): AppAuthorizationService {
  const options: CreateAppAuthorizationOptions = { connection, config };
  return createAppAuthorization(options);
}

describe('what an application configures about its own authorization', () => {
  it('protects both code-owned sets the Permission Sets plugin names', () => {
    const authorization = authorizationWith({ plugins: templatePlugins() });

    expect(authorization.permissionSets.protection('root')).toEqual({
      owner: PERMISSION_SETS_PROTECTION_OWNER,
      allow: ['assign', 'revoke'],
      requireActiveAssignment: true,
      unrestricted: true,
      // A superuser is an account; this host's principal type is `user`.
      assignableTo: ['user'],
    });
    expect(authorization.permissionSets.protection('member')).toEqual({
      owner: PERMISSION_SETS_PROTECTION_OWNER,
      allow: ['update'],
    });
  });

  it('names the sets the application asked the library to protect', () => {
    const authorization = authorizationWith({
      permissionSets: { rootSet: 'owner', defaultSet: 'everyone' },
      plugins: [],
    });

    expect(authorization.permissionSets.isUnrestricted('owner')).toBe(true);
    expect(authorization.permissionSets.protection('owner')).toMatchObject({
      assignableTo: ['user'],
    });
    expect(authorization.permissionSets.protection('everyone')).toEqual({
      owner: PERMISSION_SETS_PROTECTION_OWNER,
      allow: ['update'],
    });
    expect(authorization.permissionSets.protection('root')).toBeUndefined();
    expect(authorization.permissionSets.protection('member')).toBeUndefined();
  });

  it('installs the built-in plugins alone when the application configures nothing', async () => {
    const authorization = createAppAuthorization({ connection });

    expect(authorization.describe().plugins).toEqual([
      'permission-sets',
      'database',
      'pages',
    ]);
    vi.spyOn(authorization.permissionSets, 'getEffective').mockResolvedValue(
      [],
    );
    await expect(
      authorization.authorize({
        principal: { type: 'user', id: 'alice' },
        subjects: [],
        resource: { type: 'page', id: 'home' },
        action: 'access',
      }),
    ).resolves.toMatchObject({
      effect: 'deny',
      reasons: [expect.objectContaining({ code: 'PAGE_ACCESS_DENIED' })],
    });
    vi.mocked(authorization.permissionSets.getEffective).mockResolvedValue([
      {
        key: 'reader',
        grants: [
          {
            resource: { type: 'page', id: 'home' },
            actions: [{ action: 'access' }],
          },
        ],
      },
    ]);
    await expect(
      authorization.authorize({
        principal: { type: 'user', id: 'alice' },
        resource: { type: 'page', id: 'home' },
        action: 'access',
      }),
    ).resolves.toMatchObject({ effect: 'permit' });
  });

  it('leaves out a capability the application drops from its list', () => {
    const authorization = authorizationWith({
      plugins: [defaultAccess(), restrictionRules()],
    });

    const plugins = authorization.describe().plugins;
    expect(plugins).not.toContain('sharing-rules');
    expect(plugins).toContain('restriction-rules');
  });

  it('has a Grant Provider whatever the application lists', () => {
    expect(authorizationWith({ plugins: [] }).describe().plugins).toEqual([
      'permission-sets',
      'database',
      'pages',
    ]);
  });

  // `db` is a member of the returned type, so no accessor stands between the
  // application and the api.
  it('exposes the database api with an empty registry', () => {
    const authorization = createAppAuthorization({ connection });

    expect(
      authorization.getResource('database.collection').items.list(),
    ).toEqual([]);
  });

  it('identifies a database resource by the collection name alone', () => {
    const authorization = authorizationWith({});

    expect(authorization.db.grant('orders', { read: {} }).resource).toEqual({
      type: 'database.collection',
      id: 'orders',
    });
  });

  it('tells the application whose permissions an assignment changed', async () => {
    const onUserPermissionsChanged = vi.fn();
    const onAuthenticatedPermissionsChanged = vi.fn();
    const authorization = createAppAuthorization({
      connection,
      onUserPermissionsChanged,
      onAuthenticatedPermissionsChanged,
      config: { plugins: [] },
    });

    await authorization.permissionSets.notifyAssignmentsChanged({
      type: 'user',
      id: 'alice',
    });
    await authorization.permissionSets.notifyAssignmentsChanged({
      type: 'authenticated',
      id: '*',
    });

    expect(onUserPermissionsChanged).toHaveBeenCalledExactlyOnceWith('alice');
    expect(onAuthenticatedPermissionsChanged).toHaveBeenCalledOnce();
  });

  it('answers the options endpoints with no Collection registered', async () => {
    const authorization = authorizationWith({
      plugins: [defaultAccess(), restrictionRules()],
    });
    const container = new ServiceContainer();
    container.instance(authenticationToken, {
      required: () => async (_context, next) => next(),
    } as unknown as Auth);
    container.instance(authorizationToken, alwaysPermitted(authorization));
    const router = await apiRoutes.createRouter({
      appName: 'main',
      publicBasePath: '',
      config: { app: { name: 'main', publicBasePath: '' } },
      paths: createConfigPaths({ rootDir: '/missing' }),
      router: new Hono(),
      container,
    });

    const responses = await Promise.all(
      ['/authz/permission-sets/options'].map((path) => router.request(path)),
    );

    expect(responses.map(({ status }) => status)).toEqual([200]);
    for (const response of responses) {
      await expect(response.json()).resolves.toMatchObject({
        data: { collections: [] },
      });
    }
  });

  it('answers its own options and record endpoints ahead of the plugin routes', async () => {
    const authorization = authorizationWith({ plugins: templatePlugins() });
    authorization
      .getResource('database.collection')
      .items.add({ name: 'orders', title: 'Orders' });
    const router = await mountedRouter(authorization);

    const [options, records] = await Promise.all([
      router.request('/api/authz/sharing-rules/options'),
      router.request('/api/authz/sharing-rules/records/orders'),
    ]);

    expect([options.status, records.status]).toEqual([200, 200]);
    await expect(options.json()).resolves.toMatchObject({
      data: {
        plugins: ['database'],
        // Only what the application registered; db supplies the fields.
        collections: [{ name: 'orders', fields: orderFields }],
        resourceTypes: [
          {
            value: 'database.collection',
            resources: [{ value: 'orders', label: 'Orders' }],
          },
        ],
      },
    });
    await expect(records.json()).resolves.toEqual({ data: [] });
  });

  it('has no route for a capability the application left out', async () => {
    const router = await mountedRouter(authorizationWith({ plugins: [] }));

    const [missing, installed] = await Promise.all([
      router.request('/api/authz/sharing-rules'),
      router.request('/api/authz/permission-sets/options'),
    ]);

    expect(missing.status).toBe(404);
    expect(installed.status).toBe(200);
  });

  it('refuses an application plugin that also provides grants', () => {
    const grantsOnly: AuthorizationPlugin = {
      id: 'test-grants',
      grants: {
        resolve: () => Promise.resolve([]),
        resolveAll: () => Promise.resolve([]),
      },
    };

    expect(() =>
      createAppAuthorization({ connection, config: { plugins: [grantsOnly] } }),
    ).toThrow('multiple Grant Providers');
  });

  it('hands a consumer the Permission Sets api without a runtime probe', () => {
    const authorization: Authorization & PermissionSetsAuthorizationApi =
      authorizationWith({});
    // What a consumer such as `@nocobase/app-plugin-hub` states it requires.
    const protectFor = (api: PermissionSetsApi): string | undefined =>
      api.protection('root')?.owner;

    expect(protectFor(authorization.permissionSets)).toBe(
      PERMISSION_SETS_PROTECTION_OWNER,
    );
  });

  // The mount used to be a constant in the route file, so a router mounted
  // anywhere else answered 404 on every plugin surface while the
  // application's own endpoints kept working.
  it('answers the plugin surfaces under whatever prefix the router is mounted at', async () => {
    const authorization = authorizationWith({ plugins: [] });
    const router = new Hono().route(
      '/portal',
      await mountedRouter(authorization),
    );

    const [installed, missing] = await Promise.all([
      router.request('/portal/api/authz/permission-sets/options'),
      router.request('/portal/api/authz/sharing-rules'),
    ]);

    expect(installed.status).toBe(200);
    expect(missing.status).toBe(404);
  });
});

/** The plugin routes where an application mounts them, under `/api`. */
async function mountedRouter(
  authorization: AppAuthorizationService,
): Promise<Hono> {
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
  container.instance(authenticationToken, {
    required: () => async (_context, next) => next(),
  } as unknown as Auth);
  container.instance(authorizationToken, alwaysPermitted(authorization));
  const routes = new Hono();
  for (const contribution of [
    apiRoutes,
    ...defaultAccessRoutes,
    ...sharingRulesRoutes,
    ...restrictionRulesRoutes,
  ]) {
    routes.route(
      '/',
      await contribution.createRouter({
        appName: 'main',
        publicBasePath: '',
        config: { app: { name: 'main', publicBasePath: '' } },
        paths: createConfigPaths({ rootDir: '/missing' }),
        router: new Hono(),
        container,
      }),
    );
  }
  return new Hono().route('/api', routes);
}

/**
 * The same authorization with the permission check open, so the options
 * endpoints can be read without a Permission Set store behind them.
 */
function alwaysPermitted(
  authorization: AppAuthorizationService,
): AppAuthorizationService {
  const permitted = Object.create(authorization) as AppAuthorizationService;
  permitted.middleware = () => async (context, next) => {
    context.set('authz', authorizationScopeThatPermitsEverything());
    await next();
  };
  return permitted;
}

function authorizationScopeThatPermitsEverything(): ReturnType<
  Authorization['for']
> {
  const scope = {
    require: () => Promise.resolve(),
    can: () => Promise.resolve(true),
    authorize: () => Promise.resolve({ effect: 'permit' }),
    permissions: () => Promise.resolve({}),
  };
  return scope as unknown as ReturnType<Authorization['for']>;
}

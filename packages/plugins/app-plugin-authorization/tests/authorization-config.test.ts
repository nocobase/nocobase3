import { databaseAuthorization } from '../server/database/index.js';
import {
  defaultAccess,
  restrictionRules,
  sharingRules,
} from '../server/rules.js';
import {
  PERMISSION_SETS_PROTECTION_OWNER,
  type PermissionSetsApi,
  type PermissionSetsAuthorizationApi,
} from '@nocobase/authorization/permissions';
import type { DatabaseConnection } from '@nocobase/db';
import { createConfigPaths } from '@nocobase/app-server/config';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  appAuthorizationDatabase,
  createAppAuthorization,
  type CreateAppAuthorizationOptions,
} from '../server/authorization.js';
import type {
  Authorization,
  AuthorizationPlugin,
} from '@nocobase/authorization/core';

import type { AuthorizationConfig } from '../server/authorization.js';
import { pages } from '../server/pages-authorization.js';
import { apiRoutes } from '../server/routes/index.js';
import { authorizationToken } from '../server/tokens.js';

/** Permission Sets need a connection to build their store; nothing here queries. */
const connection = { query: {} } as unknown as DatabaseConnection;

/** The plugin list all three templates ship; the plugin adds Permission Sets. */
const templatePlugins = (): AuthorizationPlugin[] => [
  pages(),
  databaseAuthorization({ source: 'main' }),
  defaultAccess(),
  sharingRules(),
  restrictionRules(),
];

function authorizationWith(
  config: AuthorizationConfig,
): Authorization & PermissionSetsAuthorizationApi {
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
      plugins: [pages()],
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

  // The plugin ships no fallback list beyond Permission Sets: what an
  // application does not declare, it does not have, and the first request is
  // what says so.
  it('installs Permission Sets alone when the application configures nothing', async () => {
    const authorization = createAppAuthorization({ connection });

    expect(authorization.describe().plugins).toEqual(['permission-sets']);
    await expect(
      authorization.authorize({
        principal: { type: 'user', id: 'alice' },
        subjects: [],
        resource: { type: 'page', id: 'home' },
        action: 'view',
      }),
    ).resolves.toMatchObject({
      effect: 'deny',
      reasons: [expect.objectContaining({ code: 'UNKNOWN_RESOURCE_TYPE' })],
    });
  });

  it('leaves out a capability the application drops from its list', () => {
    const authorization = authorizationWith({
      plugins: [
        pages(),
        databaseAuthorization(),
        defaultAccess(),
        restrictionRules(),
      ],
    });

    const plugins = authorization.describe().plugins;
    expect(plugins).not.toContain('sharing-rules');
    expect(plugins).toContain('restriction-rules');
  });

  it('has a Grant Provider whatever the application lists', () => {
    expect(
      authorizationWith({ plugins: [pages()] }).describe().plugins,
    ).toEqual(['permission-sets', 'pages']);
  });

  it('resolves database collections against the source the application passes', () => {
    const authorization = authorizationWith({
      plugins: [pages(), databaseAuthorization({ source: 'analytics' })],
    });

    expect(collectionsOf(authorization).resolveName('orders')).toBe(
      'analytics.orders',
    );
    const unnamed = authorizationWith({
      plugins: [databaseAuthorization()],
    });
    expect(collectionsOf(unnamed).resolveName('orders')).toBe('main.orders');
  });

  it('tells the application whose permissions an assignment changed', async () => {
    const onUserPermissionsChanged = vi.fn();
    const onAuthenticatedPermissionsChanged = vi.fn();
    const authorization = createAppAuthorization({
      connection,
      onUserPermissionsChanged,
      onAuthenticatedPermissionsChanged,
      config: { plugins: [pages()] },
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

  it('answers the options endpoints without the database plugin', async () => {
    const authorization = authorizationWith({
      plugins: [pages(), defaultAccess(), restrictionRules()],
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
      [
        '/authz/permission-sets/options',
        '/authz/restriction-rules/options',
      ].map((path) => router.request(path)),
    );

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    for (const response of responses) {
      await expect(response.json()).resolves.toMatchObject({
        data: { collections: [], recordAccessPolicies: [] },
      });
    }
  });

  it('answers its own options and record endpoints ahead of the plugin routes', async () => {
    const router = await mountedRouter(
      authorizationWith({ plugins: templatePlugins() }),
    );

    const [options, records] = await Promise.all([
      router.request('/api/authz/sharing-rules/options'),
      router.request('/api/authz/sharing-rules/records/main.orders'),
    ]);

    expect([options.status, records.status]).toEqual([200, 200]);
    await expect(options.json()).resolves.toMatchObject({
      data: { plugins: ['database'] },
    });
    await expect(records.json()).resolves.toEqual({ data: [] });
  });

  it('has no route for a capability the application left out', async () => {
    const router = await mountedRouter(
      authorizationWith({ plugins: [pages()] }),
    );

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
    const authorization = authorizationWith({ plugins: [pages()] });
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

/** The collection registry of an authorization that installed the database plugin. */
function collectionsOf(
  authorization: Authorization,
): NonNullable<ReturnType<typeof appAuthorizationDatabase>>['collections'] {
  const database = appAuthorizationDatabase(authorization);
  if (!database) {
    throw new Error(
      'The configuration under test installs the database plugin',
    );
  }
  return database.collections;
}

/** The plugin routes where an application mounts them, under `/api`. */
async function mountedRouter(authorization: Authorization): Promise<Hono> {
  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required: () => async (_context, next) => next(),
  } as unknown as Auth);
  container.instance(authorizationToken, alwaysPermitted(authorization));
  const routes = await apiRoutes.createRouter({
    appName: 'main',
    publicBasePath: '',
    config: { app: { name: 'main', publicBasePath: '' } },
    paths: createConfigPaths({ rootDir: '/missing' }),
    router: new Hono(),
    container,
  });
  return new Hono().route('/api', routes);
}

/**
 * The same authorization with the permission check open, so the options
 * endpoints can be read without a Permission Set store behind them.
 */
function alwaysPermitted(authorization: Authorization): Authorization {
  const permitted = Object.create(authorization) as Authorization;
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

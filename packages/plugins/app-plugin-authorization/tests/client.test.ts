import {
  type AuthorizationCheck,
  authorizationClientToken as clientToken,
} from '@nocobase/app-plugin-authorization/client';
import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import {
  apiClientToken,
  realtimeClientToken,
  type ApiClient,
  type RealtimeClient,
} from '@nocobase/app-client';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import reactProviders from '../client/react-providers.js';
import { AuthorizationServiceProvider } from '../client/service-provider.js';
import routes from '../client/routes.js';
import { firstActions } from '../client/components/rule-utils.js';
import { AuthorizationClient } from '../client/authorization-client.js';
import type { PermissionSet } from '../client/authorization-client.js';
import {
  canAssignSubjectType,
  permissionSetCapabilities,
  permissionSetErrorMessage,
} from '../client/components/permission-set-access.js';

import {
  grantablePages,
  pageGroups,
  withPageResources,
} from '../client/components/page-options.js';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import type { AuthorizationOptions } from '../client/authorization-client.js';
import { authorizationClientToken } from '../client/tokens.js';
import { translate } from './locale-harness.js';
import {
  pageSubsection,
  subsection,
  withSubsections,
} from './workspace-options.js';

describe('@nocobase/app-plugin-authorization client', () => {
  it('contributes its administration pages as one settings group', () => {
    expect(AuthorizationServiceProvider).toBeTypeOf('function');
    expect(routes).toMatchObject({ parent: 'settings' });
    expect(reactProviders).toMatchObject([
      {
        name: 'authorization',
        after: ['@nocobase/app-plugin-authentication:authentication'],
        component: expect.any(Function),
      },
    ]);
  });

  it('keeps every administration page at the URL it was published at', () => {
    const resolved = resolveAppClientContributions([
      { packageName: '@nocobase/app-plugin-authorization', routes },
    ]);

    expect(resolved.settings.map((setting) => setting.path)).toEqual([
      '/settings/authorization/permission-sets',
      '/settings/authorization/permission-sets/new',
      '/settings/authorization/permission-sets/edit/:permissionSetKey',
      '/settings/authorization/permission-sets/edit/:permissionSetKey/assignments',
      '/settings/authorization/permission-sets/edit/:permissionSetKey/details',
      '/settings/authorization/inspector',
    ]);
    expect(
      resolved.settings.map((setting) =>
        setting.authz === 'skip'
          ? undefined
          : `${setting.authz.resource.type}.${setting.authz.resource.id}`,
      ),
    ).toEqual([
      'settings.authorization.permission-sets',
      'settings.authorization.permission-sets',
      'settings.authorization.permission-sets',
      'settings.authorization.permission-sets',
      // The inspector has its own permission.
      'settings.authorization.permission-sets',
      'settings.authorization.inspector',
    ]);
    // The group and every page carry an icon, so the navigation never falls back to a bare row. A lucide icon is a
    // forwardRef object rather than a plain function, so this checks for a renderable rather than for a typeof.
    expect(resolved.settingGroups[0].icon).toBeTruthy();
    expect(
      resolved.settings
        .filter((setting) => setting.navigation)
        .every((setting) => Boolean(setting.icon)),
    ).toBe(true);
  });

  it('uses CRUD order when choosing the initial action', () => {
    expect(
      firstActions(
        {
          sections: withSubsections({
            administration: [
              subsection('administration.other', 'Other', [
                {
                  type: 'database.collection',
                  value: 'orders',
                  label: 'Orders',
                  actions: [
                    { value: 'delete', label: 'Delete' },
                    { value: 'update', label: 'Update' },
                    { value: 'read', label: 'Read' },
                  ],
                },
              ]),
            ],
          }),
          subjectTypes: [],
          collections: [],
          recordAccess: [],
        },
        'database.collection',
      ),
    ).toEqual(['read']);
  });

  it('uses actions declared by the selected resource', () => {
    expect(
      firstActions(
        {
          sections: withSubsections({
            administration: [
              subsection('administration.other', 'Other', [
                {
                  type: 'settings',
                  value: 'users',
                  label: 'Users',
                  actions: [
                    { value: 'create', label: 'Create' },
                    { value: 'read', label: 'Read' },
                  ],
                },
                {
                  type: 'settings',
                  value: 'audit-log',
                  label: 'Audit Log',
                  actions: [{ value: 'update', label: 'Update' }],
                },
              ]),
            ],
          }),
          subjectTypes: [],
          collections: [],
          recordAccess: [],
        },
        'settings',
        'audit-log',
      ),
    ).toEqual(['update']);
  });

  it('notifies consumers when the cached permission snapshot is invalidated', () => {
    const client = new AuthorizationClient({ request: vi.fn() } as never);
    const listener = vi.fn();
    const unsubscribe = client.onInvalidated(listener);

    client.invalidate();
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    client.invalidate();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('registers one injectable Authorization Client for other plugins', async () => {
    const container = new ServiceContainer();
    const api = { request: vi.fn<ApiClient['request']>() } as ApiClient;
    const realtime = {
      connected: false,
      subscribe: vi.fn(() => vi.fn()),
      onOpen: vi.fn(() => vi.fn()),
      onError: vi.fn(() => vi.fn()),
      reconnect: vi.fn(),
      close: vi.fn(),
    } satisfies RealtimeClient;
    container.instance(apiClientToken, api);
    container.instance(realtimeClientToken, realtime);
    const provider = new AuthorizationServiceProvider({
      container,
    } as never);

    provider.register();
    expect(
      container.resolveIfCreated(authorizationClientToken),
    ).toBeUndefined();

    await provider.boot();

    expect(container.resolve(authorizationClientToken)).toBeInstanceOf(
      AuthorizationClient,
    );
    expect(realtime.subscribe).toHaveBeenCalledTimes(2);
    expect(realtime.onOpen).toHaveBeenCalledOnce();
  });

  it('offers no editor and no delete for an unrestricted permission set, but keeps its assignment controls', () => {
    const superuser: PermissionSet = {
      key: 'root',
      grants: [],
      protection: {
        owner: '@nocobase/app-plugin-authorization',
        allow: ['assign', 'revoke'],
      },
      unrestricted: true,
    };

    expect(permissionSetCapabilities(superuser)).toEqual({
      unrestricted: true,
      protectedSet: true,
      canUpdate: false,
      canDelete: false,
      // Adding a second superuser is the only recovery path an installation has.
      canAssign: true,
      canRevoke: true,
    });
  });

  it('follows protection.allow for each operation separately', () => {
    const defaultSet: PermissionSet = {
      key: 'member',
      grants: [],
      protection: {
        owner: '@nocobase/app-plugin-authorization',
        allow: ['update'],
      },
    };

    expect(permissionSetCapabilities(defaultSet)).toEqual({
      unrestricted: false,
      protectedSet: true,
      canUpdate: true,
      canDelete: false,
      canAssign: false,
      canRevoke: false,
    });
  });

  it('leaves an ordinary permission set fully manageable', () => {
    const ordinary: PermissionSet = { key: 'reader', grants: [] };
    const everything = {
      unrestricted: false,
      protectedSet: false,
      canUpdate: true,
      canDelete: true,
      canAssign: true,
      canRevoke: true,
    };

    expect(permissionSetCapabilities(ordinary)).toEqual(everything);
    // An unsaved set has no server metadata yet and behaves the same way.
    expect(permissionSetCapabilities(undefined)).toEqual(everything);
  });

  it('offers only the subject types the server allows for a set', () => {
    const superuser: PermissionSet = {
      key: 'root',
      grants: [],
      protection: {
        owner: '@nocobase/authorization/permission-sets',
        allow: ['assign', 'revoke'],
        assignableTo: ['user'],
      },
      unrestricted: true,
    };
    const ordinary: PermissionSet = { key: 'reader', grants: [] };

    const root = permissionSetCapabilities(superuser);
    expect(canAssignSubjectType(root, 'user')).toBe(true);
    expect(canAssignSubjectType(root, 'authenticated')).toBe(false);

    for (const type of ['user', 'authenticated']) {
      expect(
        canAssignSubjectType(permissionSetCapabilities(ordinary), type),
      ).toBe(true);
    }
  });

  it('explains the refusal to remove the last assignment instead of showing its code', () => {
    const lastAssignment = Object.assign(
      new Error(
        'The last active assignment of the root Permission Set cannot be removed.',
      ),
      { code: 'LAST_ASSIGNMENT' },
    );

    const shown = permissionSetErrorMessage(translate, lastAssignment);
    expect(shown).not.toContain('LAST_ASSIGNMENT');
    expect(shown).toBe(translate('errors.lastAssignment'));
    expect(
      permissionSetErrorMessage(
        translate,
        Object.assign(new Error('forbidden'), {
          code: 'PROTECTED_PERMISSION_SET',
        }),
      ),
    ).toBe(translate('errors.protectedSet'));
    expect(
      permissionSetErrorMessage(translate, new Error('Network down')),
    ).toBe('Network down');
  });

  it('replaces the page subsection with the route pages and their groups', () => {
    const groups = [
      {
        value: 'business',
        label: 'Business',
        children: [{ value: 'sales', label: 'Sales' }],
      },
    ];
    const merged = withPageResources(
      options(),
      [{ value: 'orders', label: 'Orders', group: 'sales' }],
      groups,
    );
    const pages = merged.sections[0].subsections[0];
    expect(pages.groups).toEqual(groups);
    expect(pages.resources).toEqual([
      { type: 'page', value: 'orders', label: 'Orders', group: 'sales' },
    ]);
    const refreshed = withPageResources(merged, [
      { value: 'orders', label: 'Orders' },
    ]);
    expect(refreshed.sections[0].subsections[0].groups).toEqual([]);
    expect(
      refreshed.sections[0].subsections[0].resources[0].group,
    ).toBeUndefined();
  });

  it('preserves recursive route groups without turning them into grantable pages', () => {
    const routes = [
      route({
        name: 'business',
        componentLoader: undefined,
        navigation: { title: 'Business' },
        children: [
          route({
            name: 'sales',
            componentLoader: undefined,
            navigation: { title: 'Sales' },
            children: [route({ name: 'orders' })],
          }),
        ],
      }),
      route({ name: 'home' }),
    ];
    expect(pageGroups(routes, (title) => title)).toEqual([
      {
        value: 'business',
        label: 'Business',
        children: [{ value: 'sales', label: 'Sales' }],
      },
    ]);
    expect(grantablePages(routes)).toMatchObject([
      { name: 'orders', group: 'sales' },
      { name: 'home' },
    ]);
    expect(grantablePages(routes)[1]).not.toHaveProperty('group');
  });

  it('lists pages and groups in menu order', () => {
    const routes = [
      route({ name: 'late', navigation: { title: 'Late', order: 20 } }),
      route({
        name: 'group',
        componentLoader: undefined,
        navigation: { title: 'Group', order: 10 },
        children: [
          route({ name: 'second', navigation: { title: 'Second', order: 2 } }),
          route({ name: 'first', navigation: { title: 'First', order: 1 } }),
        ],
      }),
      route({ name: 'unordered', navigation: { title: 'Unordered' } }),
      route({ name: 'early', navigation: { title: 'Early', order: -1 } }),
    ];
    expect(grantablePages(routes).map((page) => page.name)).toEqual([
      'early',
      // No order counts as 0.
      'unordered',
      'first',
      'second',
      'late',
    ]);
    expect(pageGroups(routes, (title) => title)).toEqual([
      { value: 'group', label: 'Group' },
    ]);
  });

  it('offers only the routes a page grant can name', () => {
    const routes: readonly AppClientRegisteredRoute[] = [
      route({
        name: 'home',
        // Declared unconditional: signed in is enough, so there is nothing to grant or withhold.
        authz: 'skip',
      }),
      route({ name: 'orders', navigation: { title: 'navigation.orders' } }),
      route({
        name: 'orders-alias',
        authz: { resource: { type: 'page', id: 'orders' }, action: 'access' },
      }),
      route({
        name: 'orders-detail',
        authz: {
          resource: { type: 'page', id: 'orders-detail' },
          action: 'access',
        },
      }),
      route({
        name: 'hub',
        // Authorized as something other than a page.
        authz: { resource: { type: 'hub.app', id: '*' }, action: 'read' },
      }),
      route({ name: 'login', auth: 'guest', authz: 'skip' }),
      route({ name: 'group', componentLoader: undefined }),
      route({
        name: 'reports',
        children: [
          // Nested under a page, so the parent's check is the only one.
          route({ name: 'report-detail', authz: 'skip' }),
        ],
      }),
      route({
        name: 'section',
        componentLoader: undefined,
        // A group is not a page, so its children are still authorized on their own.
        children: [route({ name: 'inside-group' })],
      }),
    ];

    expect(grantablePages(routes)).toEqual([
      { name: 'orders', packageName: 'app', title: 'navigation.orders' },
      { name: 'orders-detail', packageName: 'app' },
      { name: 'reports', packageName: 'app' },
      { name: 'inside-group', packageName: 'app' },
    ]);
  });

  it('adds the discovered pages to the page subsection and leaves the rest alone', () => {
    const merged = withPageResources(options(), [
      { value: 'orders', label: 'Orders' },
      { value: 'reports', label: 'Reports' },
    ]);

    expect(
      merged.sections.flatMap((section) =>
        section.subsections.map((item) => ({
          value: item.value,
          resources: item.resources.map(
            (resource) => `${resource.type}:${resource.value}`,
          ),
        })),
      ),
    ).toEqual([
      { value: 'page', resources: ['page:orders', 'page:reports'] },
      {
        value: 'administration.other',
        resources: ['database.collection:orders'],
      },
    ]);
    expect(merged.collections).toEqual(options().collections);
  });
});

function route(
  overrides: Partial<AppClientRegisteredRoute> & { name: string },
): AppClientRegisteredRoute {
  return {
    id: overrides.name,
    path: `/${overrides.name}`,
    auth: 'required',
    authz: { resource: { type: 'page', id: overrides.name }, action: 'access' },
    packageName: 'app',
    source: 'application',
    componentLoader: async () => ({ default: () => null }),
    ...overrides,
  };
}

function options(): AuthorizationOptions {
  return {
    sections: withSubsections({
      pages: [pageSubsection()],
      administration: [
        subsection('administration.other', 'Other', [
          {
            type: 'database.collection',
            value: 'orders',
            label: 'Orders',
            actions: [{ value: 'read', label: 'Read' }],
          },
        ]),
      ],
    }),
    subjectTypes: [{ value: 'user', label: 'User' }],
    collections: [],
    recordAccess: [],
  };
}

describe('permission snapshot lifecycle', () => {
  const resource = { type: 'page', id: 'users' };
  const granted = {
    data: { permissions: [{ resource, actions: ['access'] }] },
  };
  const denied = { data: { permissions: [] } };

  it('refetches permissions across admin, operator, and admin sessions', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(granted)
      .mockResolvedValueOnce(denied)
      .mockResolvedValueOnce(granted);
    const client = new AuthorizationClient({ request } as never);
    expect(await client.can({ resource, action: 'access' })).toBe(true);
    expect(await client.can({ resource, action: 'access' })).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    client.invalidate();
    expect(await client.can({ resource, action: 'access' })).toBe(false);
    client.invalidate();
    expect(await client.can({ resource, action: 'access' })).toBe(true);
    expect(request).toHaveBeenCalledTimes(3);
    expect(client.revision()).toBe(2);
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores an obsolete request that finishes with %s',
    async (outcome) => {
      const old = Promise.withResolvers<typeof granted>();
      const request = vi
        .fn()
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(denied);
      const client = new AuthorizationClient({ request } as never);
      const oldCheck = client.can({ resource, action: 'access' });
      client.invalidate();
      expect(await client.can({ resource, action: 'access' })).toBe(false);
      if (outcome === 'resolve') old.resolve(granted);
      else old.reject(new Error('Previous session expired'));
      expect(await oldCheck).toBe(false);
      expect(await client.can({ resource, action: 'access' })).toBe(false);
      expect(request).toHaveBeenCalledTimes(2);
    },
  );

  it('allows retry after the current request fails', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(granted);
    const client = new AuthorizationClient({ request } as never);
    await expect(client.can({ resource, action: 'access' })).rejects.toThrow(
      'Offline',
    );
    expect(await client.can({ resource, action: 'access' })).toBe(true);
  });
});

describe('explicit domain route permissions', () => {
  it('preserves domain actions and resource ids without falling back to page grants', async () => {
    const container = new ServiceContainer();
    const request = vi.fn().mockResolvedValue({
      data: {
        permissions: [
          {
            resource: { type: 'hub.app', id: '*' },
            actions: ['upload-release'],
          },
          { resource: { type: 'report', id: 'one' }, actions: ['read'] },
          { resource: { type: 'page', id: 'hub' }, actions: ['access'] },
          { resource: { type: 'page', id: 'hub.app' }, actions: ['access'] },
          {
            resource: { type: 'settings', id: 'authorization.permission-sets' },
            actions: ['read'],
          },
        ],
      },
    });
    container.instance(apiClientToken, { request } as never);
    container.instance(realtimeClientToken, {
      subscribe: () => () => {},
      onOpen: () => () => {},
    } as never);
    const provider = new AuthorizationServiceProvider({
      container,
    } as never);
    provider.register();
    await provider.boot();
    const can = (check: AuthorizationCheck) =>
      container.resolve(clientToken).can(check);
    expect(
      await can({
        resource: { type: 'hub.app', id: '*' },
        action: 'upload-release',
      }),
    ).toBe(true);
    expect(
      await can({
        resource: { type: 'hub.app', id: '*' },
        action: 'manage-api-keys',
      }),
    ).toBe(false);
    expect(
      await can({ resource: { type: 'report', id: 'one' }, action: 'read' }),
    ).toBe(true);
    expect(
      await can({ resource: { type: 'report', id: 'two' }, action: 'read' }),
    ).toBe(false);
    expect(
      await can({ resource: { type: 'report', id: '' }, action: 'read' }),
    ).toBe(false);
    expect(
      await can({ resource: { type: 'page', id: 'hub' }, action: 'access' }),
    ).toBe(true);
    expect(
      await can({
        resource: { type: 'settings', id: 'authorization.permission-sets' },
        action: 'read',
      }),
    ).toBe(true);
    await provider.shutdown();
  });
});

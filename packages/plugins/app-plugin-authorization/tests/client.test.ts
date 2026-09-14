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
  permissionSetCapabilities,
  permissionSetErrorMessage,
} from '../client/components/permission-set-access.js';
import {
  grantablePages,
  isUnknownPage,
  withPageResources,
} from '../client/components/page-options.js';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import type { AuthorizationOptions } from '../client/authorization-client.js';
import { authorizationClientToken } from '../client/tokens.js';

describe('@nocobase/app-plugin-authorization client', () => {
  it('contributes its administration pages as one settings group', () => {
    expect(AuthorizationServiceProvider).toBeTypeOf('function');
    expect(routes).toMatchObject({ parent: 'settings' });
    expect(reactProviders).toEqual([]);
  });

  it('keeps every administration page at the URL it was published at', () => {
    const resolved = resolveAppClientContributions([
      { packageName: '@nocobase/app-plugin-authorization', routes },
    ]);

    expect(resolved.settings.map((setting) => setting.path)).toEqual([
      '/settings/authorization/permission-sets',
      '/settings/authorization/default-access',
      '/settings/authorization/sharing-rules',
      '/settings/authorization/restriction-rules',
    ]);
    expect(
      resolved.settings.map((setting) => setting.access?.resource),
    ).toEqual([
      'authorization.settings.permission-sets',
      'authorization.settings.default-access',
      'authorization.settings.sharing-rules',
      'authorization.settings.restriction-rules',
    ]);
    // The group and every page carry an icon, so the navigation never falls back to a bare row. A lucide icon is a
    // forwardRef object rather than a plain function, so this checks for a renderable rather than for a typeof.
    expect(resolved.settingGroups[0].icon).toBeTruthy();
    expect(resolved.settings.every((setting) => Boolean(setting.icon))).toBe(
      true,
    );
  });

  it('uses CRUD order when choosing the initial action', () => {
    expect(
      firstActions(
        {
          plugins: ['database'],
          resourceTypes: [
            {
              value: 'database.collection',
              label: 'Collections',
              resources: [],
              actions: [
                { value: 'delete', label: 'Delete' },
                { value: 'update', label: 'Update' },
                { value: 'read', label: 'Read' },
              ],
            },
          ],
          subjectTypes: [],
          collections: [],
          recordAccessPolicies: [],
        },
        'database.collection',
      ),
    ).toEqual(['read']);
  });

  it('uses actions declared by the selected resource', () => {
    expect(
      firstActions(
        {
          plugins: [],
          resourceTypes: [
            {
              value: 'authorization.settings',
              label: 'Settings',
              resources: [
                {
                  value: 'audit-log',
                  label: 'Audit Log',
                  actions: [{ value: 'read', label: 'Read' }],
                },
              ],
              actions: [
                { value: 'create', label: 'Create' },
                { value: 'read', label: 'Read' },
              ],
            },
          ],
          subjectTypes: [],
          collections: [],
          recordAccessPolicies: [],
        },
        'authorization.settings',
        'audit-log',
      ),
    ).toEqual(['read']);
  });

  it('notifies consumers when the cached permission snapshot is invalidated', () => {
    const client = new AuthorizationClient({ request: vi.fn() } as never);
    const listener = vi.fn();
    const unsubscribe = client.onPermissionsInvalidated(listener);

    client.invalidatePermissions();
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    client.invalidatePermissions();
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
    const setAccessControlProvider = vi.fn();
    container.instance(apiClientToken, api);
    container.instance(realtimeClientToken, realtime);
    const provider = new AuthorizationServiceProvider({
      container,
      refine: { setAccessControlProvider },
    } as never);

    provider.register();
    expect(
      container.resolveIfCreated(authorizationClientToken),
    ).toBeUndefined();

    await provider.boot();

    expect(container.resolve(authorizationClientToken)).toBeInstanceOf(
      AuthorizationClient,
    );
    expect(setAccessControlProvider).toHaveBeenCalledOnce();
    expect(realtime.subscribe).toHaveBeenCalledTimes(2);
    expect(realtime.onOpen).toHaveBeenCalledOnce();
  });

  it('offers no editor and no delete for an unrestricted permission set, but keeps its assignment controls', () => {
    const superuser: PermissionSet = {
      key: 'system-administrator',
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
    const baseline: PermissionSet = {
      key: 'authenticated',
      grants: [],
      protection: {
        owner: '@nocobase/app-plugin-authorization',
        allow: ['update'],
      },
    };

    expect(permissionSetCapabilities(baseline)).toEqual({
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

  it('explains the refusal to remove the last assignment instead of showing its code', () => {
    const lastAssignment = Object.assign(
      new Error(
        'The last active assignment of the system-administrator Permission Set cannot be removed.',
      ),
      { code: 'LAST_ASSIGNMENT' },
    );

    const shown = permissionSetErrorMessage(lastAssignment);
    expect(shown).not.toContain('LAST_ASSIGNMENT');
    expect(shown).toContain('last assignment');
    expect(shown).toContain('administrator');
    expect(
      permissionSetErrorMessage(
        Object.assign(new Error('forbidden'), {
          code: 'PROTECTED_PERMISSION_SET',
        }),
      ),
    ).toContain('maintained by the application');
    expect(permissionSetErrorMessage(new Error('Network down'))).toBe(
      'Network down',
    );
  });

  it('offers only the routes a page grant can name', () => {
    const routes: readonly AppClientRegisteredRoute[] = [
      route({
        name: 'home',
        // Declared unconditional: signed in is enough, so there is nothing to grant or withhold.
        access: false,
      }),
      route({ name: 'orders', navigation: { title: 'navigation.orders' } }),
      route({
        name: 'hub',
        // Authorized as something other than a page.
        access: { resource: 'hub', action: 'access' },
      }),
      route({ name: 'login', auth: 'guest' }),
      route({ name: 'group', componentLoader: undefined }),
      route({
        name: 'reports',
        children: [
          // Nested under a page, so the parent's check is the only one.
          route({ name: 'report-detail' }),
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
      { name: 'reports', packageName: 'app' },
      { name: 'inside-group', packageName: 'app' },
    ]);
  });

  it('adds the discovered pages to the page resource type and leaves the rest alone', () => {
    const merged = withPageResources(options(), [
      { value: 'orders', label: 'Orders' },
      // The server already reports the wildcard; it keeps its own entry and its description.
      { value: '*', label: 'Everything' },
    ]);

    expect(
      merged.resourceTypes.map((resourceType) => ({
        value: resourceType.value,
        resources: resourceType.resources.map((resource) => resource.value),
      })),
    ).toEqual([
      { value: 'page', resources: ['*', 'orders'] },
      { value: 'database.collection', resources: ['main.orders'] },
    ]);
    expect(merged.resourceTypes[0].resources[0].description).toBe(
      'Allow access to every page, including pages added later.',
    );
    expect(merged.collections).toEqual(options().collections);
  });

  it('marks a stored page grant no route declares any more', () => {
    const merged = withPageResources(options(), [
      { value: 'orders', label: 'Orders' },
    ]);

    expect(isUnknownPage(merged, { type: 'page', id: 'renamed' })).toBe(true);
    expect(isUnknownPage(merged, { type: 'page', id: 'orders' })).toBe(false);
    expect(isUnknownPage(merged, { type: 'page', id: '*' })).toBe(false);
    // Only pages are decided from the route registry; every other resource type comes from the server.
    expect(
      isUnknownPage(merged, { type: 'database.collection', id: 'main.gone' }),
    ).toBe(false);
  });
});

function route(
  overrides: Partial<AppClientRegisteredRoute> & { name: string },
): AppClientRegisteredRoute {
  return {
    id: overrides.name,
    path: `/${overrides.name}`,
    auth: 'required',
    packageName: 'app',
    source: 'application',
    componentLoader: async () => ({ default: () => null }),
    ...overrides,
  };
}

function options(): AuthorizationOptions {
  return {
    plugins: ['permission-sets', 'pages', 'database'],
    resourceTypes: [
      {
        value: 'page',
        label: 'Pages',
        resources: [
          {
            value: '*',
            label: 'All pages',
            description:
              'Allow access to every page, including pages added later.',
            actions: [{ value: 'access', label: 'Access' }],
          },
        ],
        actions: [{ value: 'access', label: 'Access' }],
      },
      {
        value: 'database.collection',
        label: 'Collections',
        resources: [{ value: 'main.orders', label: 'Orders' }],
        actions: [{ value: 'read', label: 'Read' }],
      },
    ],
    subjectTypes: [{ value: 'user', label: 'User' }],
    collections: [],
    recordAccessPolicies: [],
  };
}

import { describe, expect, it, vi } from 'vitest';

import { UsersNavigationProvider } from '../client/service-provider.js';
import users from '../client/plugin.js';
import {
  emptyUserCapabilities,
  loadUserCapabilities,
  USER_MANAGEMENT_ACTIONS,
} from '../client/user-permissions.js';
import {
  emptyRoleScopeValues,
  hasEveryRequiredRoleScope,
  selectedRoleScopeValues,
} from '../client/role-scopes.js';

describe('@nocobase/app-plugin-users Client routes', () => {
  it('requires an explicit role choice and omits empty optional scopes', () => {
    const scopes = [
      {
        key: 'hub',
        label: 'Hub role',
        selection: 'single' as const,
        requiredOnCreate: true,
        options: [
          { value: 'hub-administrator', label: 'Administrator' },
          { value: 'hub-viewer', label: 'Viewer' },
        ],
      },
      {
        key: 'teams',
        label: 'Teams',
        selection: 'multiple' as const,
        requiredOnCreate: false,
        options: [{ value: 'support', label: 'Support' }],
      },
    ];
    const empty = emptyRoleScopeValues(scopes);

    expect(empty).toEqual({ hub: '', teams: [] });
    expect(hasEveryRequiredRoleScope(scopes, empty)).toBe(false);
    expect(
      selectedRoleScopeValues(scopes, {
        ...empty,
        hub: 'hub-viewer',
      }),
    ).toEqual({ hub: 'hub-viewer' });
  });

  it('loads every user action for button-level access control', async () => {
    const can = vi.fn(
      (_resource: { type: string; id: string }, action: string) =>
        Promise.resolve(action === 'update'),
    );

    await expect(loadUserCapabilities({ can }, 'user-1')).resolves.toEqual({
      ...emptyUserCapabilities(),
      update: true,
    });
    expect(can.mock.calls).toEqual(
      USER_MANAGEMENT_ACTIONS.map((action) => [
        { type: 'user', id: 'user-1' },
        action,
      ]),
    );
  });
  it('mounts one protected Settings page at a relative path', async () => {
    const registration = users({ mount: 'settings', path: '/users' });
    expect(registration.serviceProviders).toEqual([]);
    expect(registration.routes).toHaveLength(1);
    expect(registration.routes[0]).toMatchObject({
      parent: 'settings',
      routes: [
        {
          name: 'users',
          path: '/users',
          access: { resource: 'users', action: 'access' },
        },
      ],
    });
    await expect(
      registration.routes[0]?.routes[0]?.componentLoader(),
    ).resolves.toMatchObject({ default: expect.any(Function) });
  });

  it('can mount the same owned route in the App without changing its identity', () => {
    const componentLoader = () =>
      Promise.resolve({ default: () => null as never });
    const registration = users({
      mount: 'app',
      path: '/team/users',
      componentLoader,
    });
    expect(registration.routes[0]).toMatchObject({
      parent: 'app',
      routes: [
        {
          name: 'users',
          path: '/team/users',
          auth: 'required',
          access: { resource: 'users', action: 'access' },
        },
      ],
    });
    expect(registration.serviceProviders).toEqual([UsersNavigationProvider]);
    expect(registration.routeComponentOverrides).toEqual([
      {
        routeId: '@nocobase/app-plugin-users:users',
        componentLoader,
      },
    ]);
  });

  it('registers a protected, translated App navigation entry', async () => {
    const addResources = vi.fn();
    const provider = new UsersNavigationProvider(
      { refine: { addResources } } as never,
      {
        packageName: '@nocobase/app-plugin-users',
        source: 'plugin',
        options: {
          mount: 'app',
          path: '/team/users',
          navigationParent: 'hub-user-access',
          navigationOrder: 10,
        },
      },
    );

    await provider.boot();

    expect(addResources).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'users',
        list: '/team/users',
        meta: expect.objectContaining({
          access: { resource: 'users', action: 'access' },
          label: 'nav.users',
          i18nNs: '@nocobase/app-plugin-users',
          parent: 'hub-user-access',
          order: 10,
        }),
      }),
    ]);
  });

  it('does not accept a Settings-prefixed relative path', () => {
    expect(() => users({ path: '/settings/users' })).toThrow(
      'must not include /settings',
    );
  });
});

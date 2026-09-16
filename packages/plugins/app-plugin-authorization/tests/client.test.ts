import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import {
  apiClientToken,
  realtimeClientToken,
  type ApiClient,
  type AppClientRefineConfig,
  type RealtimeClient,
} from '@nocobase/app-client';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import reactProviders from '../client/react-providers.js';
import { AuthorizationServiceProvider } from '../client/service-provider.js';
import routes from '../client/routes.js';
import { firstActions } from '../client/components/rule-utils.js';
import { AuthorizationClient } from '../client/authorization-client.js';
import { authorizationClientToken } from '../client/tokens.js';

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
});

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
    expect(await client.can(resource, 'access')).toBe(true);
    expect(await client.can(resource, 'access')).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    client.invalidatePermissions();
    expect(await client.can(resource, 'access')).toBe(false);
    client.invalidatePermissions();
    expect(await client.can(resource, 'access')).toBe(true);
    expect(request).toHaveBeenCalledTimes(3);
    expect(client.getPermissionsRevision()).toBe(2);
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
      const oldCheck = client.can(resource, 'access');
      client.invalidatePermissions();
      expect(await client.can(resource, 'access')).toBe(false);
      if (outcome === 'resolve') old.resolve(granted);
      else old.reject(new Error('Previous session expired'));
      expect(await oldCheck).toBe(false);
      expect(await client.can(resource, 'access')).toBe(false);
      expect(request).toHaveBeenCalledTimes(2);
    },
  );

  it('allows retry after the current request fails', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(granted);
    const client = new AuthorizationClient({ request } as never);
    await expect(client.can(resource, 'access')).rejects.toThrow('Offline');
    expect(await client.can(resource, 'access')).toBe(true);
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
            resource: { type: 'authorization.settings', id: 'permission-sets' },
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
    const setAccessControlProvider =
      vi.fn<
        (
          value: NonNullable<AppClientRefineConfig['accessControlProvider']>,
        ) => void
      >();
    const provider = new AuthorizationServiceProvider({
      container,
      refine: { setAccessControlProvider },
    } as never);
    provider.register();
    await provider.boot();
    const { can } = setAccessControlProvider.mock.calls[0]![0];
    expect(
      await can({ resource: 'hub.app:*', action: 'upload-release' }),
    ).toEqual({ can: true });
    expect(
      await can({ resource: 'hub.app:*', action: 'manage-api-keys' }),
    ).toEqual({ can: false });
    expect(await can({ resource: 'report:one', action: 'read' })).toEqual({
      can: true,
    });
    expect(await can({ resource: 'report:two', action: 'read' })).toEqual({
      can: false,
    });
    expect(await can({ resource: 'report:', action: 'read' })).toEqual({
      can: false,
    });
    expect(await can({ resource: 'hub', action: 'access' })).toEqual({
      can: true,
    });
    expect(
      await can({
        resource: 'authorization.settings.permission-sets',
        action: 'list',
      }),
    ).toEqual({ can: true });
    await provider.shutdown();
  });
});

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
});

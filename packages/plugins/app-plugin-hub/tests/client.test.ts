import { describe, expect, it, vi } from 'vitest';

import hub from '../client/plugin.js';
import { HubNavigationProvider } from '../client/providers/hub-navigation.js';
import {
  emptyHubCapabilities,
  visibleHubDetailTabs,
} from '../client/permissions.js';
import routes from '../client/routes.js';
import {
  hasHubRoleCapability,
  HUB_ROLE_CAPABILITIES,
} from '../client/roles.js';

describe('@nocobase/app-plugin-hub', () => {
  it('declares the authenticated Hub page and lazy-loads it', async () => {
    expect(routes.parent).toBe('app');
    expect(routes.routes).toHaveLength(1);
    expect(routes.routes[0]).toMatchObject({
      name: 'hub',
      path: '/hub',
      auth: 'required',
      access: { resource: 'hub', action: 'access' },
    });
    await expect(routes.routes[0]?.componentLoader?.()).resolves.toMatchObject({
      default: expect.any(Function),
    });
  });

  it('keeps sensitive and write controls out of the Viewer tab set', () => {
    const permissions = {
      ...emptyHubCapabilities(),
      'read-release': true,
      'read-deployment': true,
    };

    expect(
      visibleHubDetailTabs({ hasReleases: true, deployed: true }, permissions),
    ).toEqual(['deployments', 'releases']);
  });

  it('shows Resources and settings only when their actions are granted', () => {
    const permissions = {
      ...emptyHubCapabilities(),
      'read-release': true,
      'read-deployment': true,
      'read-config': true,
      'update-settings': true,
    };

    expect(
      visibleHubDetailTabs({ hasReleases: true, deployed: true }, permissions),
    ).toEqual([
      'deployments',
      'releases',
      'resources',
      'configuration',
      'settings',
    ]);
  });

  it('registers the Hub page in the application navigation', async () => {
    const addResources = vi.fn();
    const provider = new HubNavigationProvider(
      {
        refine: { addResources },
      } as never,
      {
        packageName: '@nocobase/app-plugin-hub',
        source: 'plugin',
        options: {},
      },
    );

    await provider.boot();

    expect(addResources).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'hub',
        list: '/hub',
        meta: expect.objectContaining({
          label: 'navigation.applications',
          i18nNs: '@nocobase/app-plugin-hub',
          access: { resource: 'hub', action: 'access' },
        }),
      }),
    ]);
  });

  it('can expose a Hub console with applications and read-only roles', async () => {
    const registration = hub({
      applicationsPath: '/apps',
      rolesPath: '/roles',
      userAccessNavigation: true,
    });
    expect(registration.routes[0]).toMatchObject({
      parent: 'app',
      routes: [
        {
          name: 'hub',
          path: '/apps',
          access: { resource: 'hub', action: 'access' },
        },
        {
          name: 'hub-roles',
          path: '/roles',
          access: { resource: 'users', action: 'access' },
        },
      ],
    });
    await expect(
      registration.routes[0]?.routes[1]?.componentLoader(),
    ).resolves.toMatchObject({ default: expect.any(Function) });

    const addResources = vi.fn();
    const provider = new HubNavigationProvider(
      { refine: { addResources } } as never,
      {
        packageName: registration.packageName,
        source: 'plugin',
        options: registration.options,
      },
    );
    await provider.boot();

    expect(addResources).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'hub',
        list: '/apps',
        meta: expect.objectContaining({ order: 10 }),
      }),
      expect.objectContaining({
        name: 'hub-user-access',
        meta: expect.objectContaining({ order: 20 }),
      }),
      expect.objectContaining({
        name: 'hub-roles',
        list: '/roles',
        meta: expect.objectContaining({
          parent: 'hub-user-access',
          order: 20,
        }),
      }),
    ]);
  });

  it('derives the product matrix from the grants returned by the server', () => {
    const role = {
      key: 'hub-viewer',
      grants: [
        {
          resource: { type: 'hub.app', id: '*' },
          actions: ['read', 'read-release', 'read-deployment'],
        },
        {
          resource: { type: 'hub.host', id: 'global' },
          actions: ['read'],
        },
      ],
    };
    const viewStatus = HUB_ROLE_CAPABILITIES.find(
      ({ key }) => key === 'view-status',
    );
    const viewResources = HUB_ROLE_CAPABILITIES.find(
      ({ key }) => key === 'view-resources',
    );

    expect(viewStatus && hasHubRoleCapability(role, viewStatus)).toBe(true);
    expect(viewResources && hasHubRoleCapability(role, viewResources)).toBe(
      false,
    );
  });
});

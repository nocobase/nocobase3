import { describe, expect, it } from 'vitest';
import { Boxes, ShieldCheck } from 'lucide-react';

import hub from '../client/plugin.js';
import {
  emptyHubCapabilities,
  visibleHubDetailTabs,
} from '../client/permissions.js';
import routes from '../client/routes.js';
import {
  hasHubRoleCapability,
  HUB_ROLE_CAPABILITIES,
  HUB_ROLE_CAPABILITY_GROUPS,
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
      navigation: { title: 'navigation.applications', icon: Boxes },
    });
    await expect(routes.routes[0]?.componentLoader?.()).resolves.toMatchObject({
      default: expect.any(Function),
    });
    expect(routes.routes[0]?.children?.map((route) => route.path)).toEqual([
      ':appId',
    ]);
    expect(
      routes.routes[0]?.children?.[0]?.children?.map((route) => route.path),
    ).toEqual([
      'deployments',
      'releases',
      'development',
      'resources',
      'configuration',
      'settings',
    ]);
    await expect(
      routes.routes[0]?.children?.[0]?.componentLoader?.(),
    ).resolves.toMatchObject({ default: expect.any(Function) });
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

  it('can expose a Hub console with applications and read-only roles', async () => {
    const registration = hub({
      applicationsPath: '/apps',
      rolesPath: '/roles',
    });
    expect(registration.routes[0]).toMatchObject({
      parent: 'app',
      routes: [
        {
          name: 'hub',
          path: '/apps',
          access: { resource: 'hub', action: 'access' },
          navigation: { title: 'navigation.applications', icon: Boxes },
        },
        {
          name: 'hub-roles',
          path: '/roles',
          access: { resource: 'users', action: 'access' },
          navigation: { title: 'navigation.roles', icon: ShieldCheck },
        },
      ],
    });
    await expect(
      registration.routes[0]?.routes[1]?.componentLoader(),
    ).resolves.toMatchObject({ default: expect.any(Function) });
    expect(registration.serviceProviders).toEqual([]);
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

  it('groups every product capability exactly once', () => {
    expect(HUB_ROLE_CAPABILITY_GROUPS).toEqual([
      'visibility',
      'operations',
      'user-management',
    ]);
    expect(
      HUB_ROLE_CAPABILITY_GROUPS.flatMap((group) =>
        HUB_ROLE_CAPABILITIES.filter(
          (capability) => capability.group === group,
        ).map((capability) => capability.key),
      ),
    ).toEqual(HUB_ROLE_CAPABILITIES.map((capability) => capability.key));
  });
});

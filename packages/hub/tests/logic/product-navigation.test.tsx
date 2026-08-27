import { buildRouteResources } from '@nocobase/app-portal-sdk/routing';
import { describe, expect, it } from 'vitest';

import { appRoutes } from '../../client/routes';

describe('Hub product navigation', () => {
  it('uses applications as the primary product entry', () => {
    const resources = buildRouteResources(appRoutes);

    expect(resources.map((resource) => resource.name)).toEqual([
      'apps',
      'agent-deliveries',
    ]);
    expect(resources[0]).toMatchObject({
      name: 'apps',
      list: '/apps',
      meta: { label: '应用', priority: 0 },
    });
    expect(resources[1]).toMatchObject({
      name: 'agent-deliveries',
      list: '/deliveries',
      meta: { label: '版本与发布', priority: 1 },
    });
  });

  it('keeps application routes grouped by product area', () => {
    expect(appRoutes.map((route) => route.name)).toEqual([
      'apps',
      'apps.overview',
      'apps.deployments',
      'apps.resources',
      'apps.resources.storage',
      'apps.legacy-settings',
      'apps.legacy-settings.storage',
      'agent-deliveries',
      'settings',
      'release-management',
    ]);
    expect(appRoutes.map((route) => route.path)).toEqual([
      '/apps',
      '/apps/:appId',
      '/apps/:appId/deployments',
      '/apps/:appId/resources',
      '/apps/:appId/resources/storage',
      '/apps/:appId/settings',
      '/apps/:appId/settings/storage',
      '/deliveries',
      '/settings',
      '/deployments',
    ]);
  });
});

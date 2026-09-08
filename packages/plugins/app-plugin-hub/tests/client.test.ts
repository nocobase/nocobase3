import { describe, expect, it, vi } from 'vitest';

import routes from '../client/routes.js';
import { HubNavigationProvider } from '../client/providers/hub-navigation.js';
import {
  emptyHubCapabilities,
  visibleHubDetailTabs,
} from '../client/permissions.js';

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
    const provider = new HubNavigationProvider({
      refine: { addResources },
    } as never);

    await provider.boot();

    expect(addResources).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'hub',
        list: '/hub',
        meta: expect.objectContaining({
          label: 'navigation.applications',
          i18nNs: '@nocobase/app-plugin-hub',
        }),
      }),
    ]);
  });
});

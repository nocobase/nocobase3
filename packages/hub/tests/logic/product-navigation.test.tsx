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
      meta: { label: '应用中心', priority: 0 },
    });
    expect(resources[1]).toMatchObject({
      name: 'agent-deliveries',
      list: '/deliveries',
      meta: { label: '版本与发布', priority: 1 },
    });
  });

  it('keeps platform diagnostics available without promoting it to navigation', () => {
    expect(appRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'settings',
          path: '/settings',
        }),
      ]),
    );
    expect(
      buildRouteResources(appRoutes).some(
        (resource) => resource.name === 'settings',
      ),
    ).toBe(false);
  });

  it('keeps the legacy global deployment route without promoting it to navigation', () => {
    expect(appRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'release-management',
          path: '/deployments',
        }),
      ]),
    );
    expect(
      buildRouteResources(appRoutes).some(
        (resource) => resource.name === 'release-management',
      ),
    ).toBe(false);
  });
});

import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { createAppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import { expect, it } from 'vitest';
import { SchedulerAuthorizationProvider } from '../server/authorization.js';
import routes from '../client/routes.js';

it.each([false, true])(
  'adds a read resource to Automation (group exists: %s)',
  async (exists) => {
    const authz = createAppAuthorization({});
    if (exists)
      authz.resourceGroups.add({
        name: 'automation',
        title: 'Automation',
        category: 'administration',
      });
    const container = new ServiceContainer();
    container.instance(authorizationToken, authz);
    await new SchedulerAuthorizationProvider({
      container,
    } as AppPluginApplication).boot();
    expect(
      authz.resourceGroups
        .list()
        .filter((group) => group.name === 'automation'),
    ).toHaveLength(1);
    expect(authz.resources.definitionsList()).toContainEqual(
      expect.objectContaining({
        name: 'scheduler.schedules',
        group: 'automation',
      }),
    );
    expect(
      authz.resources.operation('scheduler.schedules', 'read')?.grants,
    ).toEqual([
      {
        resource: { type: 'settings', id: 'scheduler.schedules' },
        actions: [{ action: 'read' }],
      },
    ]);
    expect(
      authz.resources.operation('scheduler.schedules', 'configure'),
    ).toBeUndefined();
  },
);

it('uses administration read for Settings and standalone detail routes', () => {
  const resolved = resolveAppClientContributions([
    { packageName: '@nocobase/app-plugin-scheduler', routes },
  ]);
  expect(resolved.routes.length).toBeGreaterThan(0);
  for (const route of resolved.routes) {
    expect(route.authz).toEqual({
      resource: { type: 'settings', id: 'scheduler.schedules' },
      action: 'read',
    });
  }
  expect(resolved.settingsRouteTree[0]?.children?.[0]?.authz).toEqual({
    resource: { type: 'settings', id: 'scheduler.schedules' },
    action: 'read',
  });
});

import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { createAppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import { expect, it } from 'vitest';
import { SchedulerAuthorizationProvider } from '../server/authorization.js';
import routes from '../client/routes.js';

it.each([false, true])(
  'extends the Automation subsection (workflow booted first: %s)',
  async (workflowFirst) => {
    const authz = createAppAuthorization({});
    const workflow = {
      name: 'automation',
      title: { key: 'nav.automation', ns: '@nocobase/app-plugin-workflow' },
      parent: 'administration',
    };
    if (workflowFirst) authz.sections.add(workflow);
    const automation = workflowFirst
      ? workflow
      : {
          ...workflow,
          title: {
            key: 'nav.automation',
            ns: '@nocobase/app-plugin-scheduler',
          },
        };
    const container = new ServiceContainer();
    container.instance(authorizationToken, authz);
    await new SchedulerAuthorizationProvider({
      container,
    } as AppPluginApplication).boot();
    expect(authz.sections.get('automation')).toEqual(automation);
    expect(
      authz.resourceTypes.get('settings').items?.get('scheduler.schedules'),
    ).toMatchObject({
      section: 'automation',
      actions: [expect.objectContaining({ name: 'read' })],
    });
    expect(authz.settings.grant('scheduler.schedules', ['read'])).toEqual({
      resource: { type: 'settings', id: 'scheduler.schedules' },
      actions: [{ action: 'read' }],
    });
    expect(() =>
      authz.settings.grant('scheduler.schedules', ['configure']),
    ).toThrow();
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

import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { createAppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import { expect, it } from 'vitest';
import { WorkflowAuthorizationProvider } from '../server/authorization.js';
import routes from '../client/routes.js';

it.each([false, true])(
  'owns the Automation subsection (scheduler booted first: %s)',
  async (schedulerFirst) => {
    const authz = createAppAuthorization({});
    const automation = {
      name: 'automation',
      title: { key: 'nav.automation', ns: '@nocobase/app-plugin-workflow' },
      parent: 'administration',
    };
    // Scheduler extends the subsection; the owner's title wins either way.
    if (schedulerFirst)
      authz.sections.add({
        ...automation,
        title: { key: 'nav.automation', ns: '@nocobase/app-plugin-scheduler' },
        extend: true,
      });
    const container = new ServiceContainer();
    container.instance(authorizationToken, authz);
    await new WorkflowAuthorizationProvider({
      container,
    } as AppPluginApplication).boot();
    expect(authz.sections.get('automation')).toEqual(automation);
    expect(
      authz.resourceTypes.get('settings').items?.get('workflow'),
    ).toMatchObject({
      section: 'automation',
      actions: [expect.objectContaining({ name: 'manage' })],
    });
    expect(authz.settings.grant('workflow', ['manage'])).toEqual({
      resource: { type: 'settings', id: 'workflow' },
      actions: [{ action: 'manage' }],
    });
    expect(() => authz.settings.grant('workflow', ['configure'])).toThrow();
  },
);

it('uses administration manage for Settings and standalone detail routes', () => {
  const resolved = resolveAppClientContributions([
    { packageName: '@nocobase/app-plugin-workflow', routes },
  ]);
  expect(resolved.routes.length).toBeGreaterThan(0);
  for (const route of resolved.routes) {
    expect(route.authz).toEqual({
      resource: { type: 'settings', id: 'workflow' },
      action: 'manage',
    });
  }
  expect(resolved.settingsRouteTree[0]?.children?.[0]?.authz).toEqual({
    resource: { type: 'settings', id: 'workflow' },
    action: 'manage',
  });
});

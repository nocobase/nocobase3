// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  formatAppClientInspection,
  inspectAppClient,
  parseInspectAppClientArgs,
  selectAppClientInspection,
} from '../../scripts/inspect-client.mjs';

function settingFor(id: string, title: string) {
  return {
    access: {
      action: 'read',
      resource: `authorization.settings.${id}`,
    },
    entry: '@nocobase/app-plugin-authorization/client/settings',
    groupId: 'authorization',
    id,
    packageName: '@nocobase/app-plugin-authorization',
    path: `/settings/authorization/${id}`,
    source: 'plugin',
    title,
  };
}

describe('client inspection', () => {
  it('parses app client inspection options', () => {
    expect(
      parseInspectAppClientArgs(['--type', 'providers', '--json']),
    ).toEqual({
      help: false,
      json: true,
      type: 'providers',
    });
    expect(parseInspectAppClientArgs(['--type', 'bootstrap']).type).toBe(
      'bootstrap',
    );
    expect(parseInspectAppClientArgs(['--type', 'settings']).type).toBe(
      'settings',
    );
    expect(() => parseInspectAppClientArgs(['--type', 'setting'])).toThrow(
      '--type must be all, bootstrap, routes, settings, or providers.',
    );
  });

  it('inspects configured client routes and providers', async () => {
    const inspection = await inspectAppClient();

    expect(inspection.app).toBe('@nocobase/app-template-default');
    expect(
      inspection.routes.map(({ auth, id, path }) => ({ auth, id, path })),
    ).toEqual([
      {
        auth: 'required',
        id: '@nocobase/app-template-default:home',
        path: '/',
      },
      {
        auth: 'guest',
        id: '@nocobase/app-plugin-authentication:login',
        path: '/login',
      },
      {
        auth: 'guest',
        id: '@nocobase/app-plugin-authentication:register',
        path: '/register',
      },
      {
        auth: 'guest',
        id: '@nocobase/app-plugin-authentication:forgot-password',
        path: '/forgot-password',
      },
      {
        auth: 'guest',
        id: '@nocobase/app-plugin-authentication:reset-password',
        path: '/reset-password',
      },
      {
        auth: 'guest',
        id: '@nocobase/app-plugin-install:install',
        path: '/install',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-notification-provider:demo',
        path: '/notification-provider',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-routes-example:index',
        path: '/routes-example',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-file:demo',
        path: '/file-demo',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-workflow:workflow-list',
        path: '/workflow/workflows',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-workflow:workflow-detail',
        path: '/workflow/workflows/:workflowId',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-workflow:workflow-run-list',
        path: '/workflow/runs',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-workflow:workflow-run-detail',
        path: '/workflow/runs/:runId',
      },
    ]);
    expect(
      inspection.providers.map(({ id, order }) => ({ id, order })),
    ).toEqual([
      {
        id: '@nocobase/app-template-default:theme',
        order: 1,
      },
      {
        id: '@nocobase/app-plugin-notification-provider:notification-host',
        order: 2,
      },
      {
        id: '@nocobase/app-plugin-routes-example:routes-example',
        order: 3,
      },
    ]);
    expect(
      inspection.bootstraps
        .slice(0, 6)
        .map(({ order, packageName, source }) => ({
          order,
          packageName,
          source,
        })),
    ).toEqual([
      {
        order: 1,
        packageName: '@nocobase/app-template-default',
        source: 'application',
      },
      {
        order: 2,
        packageName: '@nocobase/app-plugin-authentication',
        source: 'plugin',
      },
      {
        order: 3,
        packageName: '@nocobase/app-plugin-authorization',
        source: 'plugin',
      },
      {
        order: 4,
        packageName: '@nocobase/app-plugin-data-provider',
        source: 'plugin',
      },
      {
        order: 5,
        packageName: '@nocobase/app-plugin-notification-provider',
        source: 'plugin',
      },
      {
        order: 6,
        packageName: '@nocobase/app-plugin-workflow',
        source: 'plugin',
      },
    ]);

    // Authorization's administration pages are settings rather than routes, and keep the paths they were published
    // at before the settings centre existed.
    expect(inspection.settings.slice(0, 4)).toEqual([
      settingFor('permission-sets', 'Permission Sets'),
      settingFor('default-access', 'Default Access'),
      settingFor('sharing-rules', 'Sharing Rules'),
      settingFor('restriction-rules', 'Restriction Rules'),
    ]);
    expect(
      inspection.routes.some((route) => route.path.startsWith('/settings/')),
    ).toBe(false);

    const output = formatAppClientInspection(inspection);
    expect(output).toMatch(/Bootstrap order/u);
    expect(output).toMatch(/Settings/u);
    expect(output).toMatch(/group: authorization/u);
    expect(formatAppClientInspection(inspection, 'settings')).not.toMatch(
      /Routes/u,
    );
    expect(
      Object.keys(selectAppClientInspection(inspection, 'settings')),
    ).toEqual(['app', 'settings']);
    expect(output).toMatch(/Routes/u);
    expect(output).toMatch(/auth: guest/u);
    expect(output).toMatch(/route source: plugin/u);
    expect(output).toMatch(/component source: application/u);
    expect(output).toMatch(
      /client\/extensions\/nocobase-auth-ui\/pages\/login-page/u,
    );
    expect(output).toMatch(/Providers \(outer -> inner\)/u);
    expect(output).toMatch(/layer: root/u);

    // `entry` used to duplicate `routeEntry`, and `componentEntry` was emitted as
    // an explicit undefined. Both are gone: the key is present only when set.
    expect(inspection.routes[0]).toEqual({
      auth: 'required',
      id: '@nocobase/app-template-default:home',
      name: 'home',
      packageName: '@nocobase/app-template-default',
      path: '/',
      routeSource: 'application',
      routeEntry: './client/routes',
      componentSource: 'application',
    });
    expect(
      inspection.providers.map(({ id, layer, source }) => ({
        id,
        layer,
        source,
      })),
    ).toEqual([
      {
        id: '@nocobase/app-template-default:theme',
        layer: 'root',
        source: 'application',
      },
      {
        id: '@nocobase/app-plugin-notification-provider:notification-host',
        layer: 'extension',
        source: 'plugin',
      },
      {
        id: '@nocobase/app-plugin-routes-example:routes-example',
        layer: 'extension',
        source: 'plugin',
      },
    ]);

    expect(
      inspection.routes
        .filter(({ packageName }) =>
          packageName.endsWith('app-plugin-authentication'),
        )
        .map(({ componentEntry, componentSource, routeSource }) => ({
          componentEntry,
          componentSource,
          routeSource,
        })),
    ).toEqual(
      [
        './client/extensions/nocobase-auth-ui/pages/login-page',
        './client/extensions/nocobase-auth-ui/pages/register-page',
        './client/extensions/nocobase-auth-ui/pages/forgot-password-page',
        './client/extensions/nocobase-auth-ui/pages/reset-password-page',
      ].map((componentEntry) => ({
        componentEntry,
        // The override source is now named, rather than a flat "application".
        componentSource: 'application (extension:nocobase-auth-ui)',
        routeSource: 'plugin',
      })),
    );

    expect(
      inspection.routes
        .filter(({ packageName }) =>
          packageName.endsWith('app-plugin-workflow'),
        )
        .map(({ componentEntry, componentSource, routeSource }) => ({
          componentEntry,
          componentSource,
          routeSource,
        })),
    ).toEqual(
      Array.from({ length: 4 }, () => ({
        componentEntry:
          './client/extensions/nocobase-workflow-management/pages',
        componentSource: 'application (extension:nocobase-workflow-management)',
        routeSource: 'plugin',
      })),
    );

    expect(selectAppClientInspection(inspection, 'routes')).toEqual({
      app: '@nocobase/app-template-default',
      routes: inspection.routes,
    });
    expect(selectAppClientInspection(inspection, 'bootstrap')).toEqual({
      app: '@nocobase/app-template-default',
      bootstraps: inspection.bootstraps,
    });
  });
});

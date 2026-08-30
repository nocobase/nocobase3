// @vitest-environment node

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ClientInspectionError,
  createAppClientInspectionFailure,
  createAppClientInspectionSuccess,
  formatAppClientInspection,
  inspectAppClient,
  parseInspectAppClientArgs,
  selectAppClientInspection,
} from '../../scripts/inspect-client.mjs';

async function createInspectionApp(pluginsSource?: string): Promise<string> {
  const appRoot = await mkdtemp(path.join(os.tmpdir(), 'client-inspect-'));
  await mkdir(path.join(appRoot, 'client'));
  await writeFile(
    path.join(appRoot, 'package.json'),
    JSON.stringify({ name: '@example/inspect-app', type: 'module' }),
  );
  await writeFile(
    path.join(appRoot, 'client/runtime.ts'),
    `export default { packageName: '@example/inspect-app', plugins: [] };`,
  );
  await writeFile(
    path.join(appRoot, 'client/locales.ts'),
    `throw new Error('client:inspect must not load application locales');`,
  );
  if (pluginsSource !== undefined) {
    await writeFile(path.join(appRoot, 'client/plugins.ts'), pluginsSource);
  }
  return appRoot;
}

function settingFor(id: string, title: string, order: number) {
  return {
    access: {
      action: 'read',
      resource: `authorization.settings.${id}`,
    },
    entry: '@nocobase/app-plugin-authorization/client/routes',
    groupId: 'authorization',
    id,
    order,
    packageName: '@nocobase/app-plugin-authorization',
    parent: 'settings',
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
    expect(parseInspectAppClientArgs(['--type', 'locales']).type).toBe(
      'locales',
    );
    expect(() => parseInspectAppClientArgs(['--type', 'setting'])).toThrow(
      '--type must be all, bootstrap, routes, settings, providers, or locales.',
    );
  });

  it('inspects configured client routes and providers', async () => {
    const inspection = await inspectAppClient();

    expect(inspection.app).toMatchObject({
      packageName: '@nocobase/app-template-default',
    });
    expect(inspection.consistent).toBe(true);
    expect(inspection.issues).toEqual([]);
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
        id: '@nocobase/app-plugin-workflow:workflow-detail',
        path: '/settings/automation/workflows/:workflowId',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-workflow:workflow-run-detail',
        path: '/settings/automation/workflow-runs/:runId',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-system-info:index',
        path: '/system-info',
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

    expect(inspection.bootstraps[6]).toMatchObject({
      order: 7,
      packageName: '@nocobase/app-plugin-notification',
      source: 'plugin',
    });
    expect(inspection.locales).toEqual(
      expect.arrayContaining([
        {
          order: 1,
          packageName: '@nocobase/app-template-default',
          source: 'application',
        },
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-workflow',
          source: 'plugin',
        }),
      ]),
    );

    // Administration pages are settings contributions; record detail pages may remain routes nested below them.
    expect(inspection.settings.slice(0, 4)).toEqual([
      settingFor('permission-sets', 'Permission Sets', 1),
      settingFor('default-access', 'Default Access', 2),
      settingFor('sharing-rules', 'Sharing Rules', 3),
      settingFor('restriction-rules', 'Restriction Rules', 4),
    ]);
    expect(inspection.settings).toContainEqual({
      access: {
        action: 'read',
        resource: 'routes-example.settings',
      },
      entry: '@nocobase/app-plugin-routes-example/client/routes',
      id: 'routes-example',
      order: 5,
      packageName: '@nocobase/app-plugin-routes-example',
      parent: 'settings',
      path: '/settings/routes-example',
      source: 'plugin',
      title: 'Routes example',
    });
    expect(inspection.settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'workflows',
          groupId: 'automation',
          path: '/settings/automation/workflows',
        }),
        expect.objectContaining({
          id: 'workflow-runs',
          groupId: 'automation',
          path: '/settings/automation/workflow-runs',
        }),
      ]),
    );
    expect(
      inspection.routes.filter((route) => route.path.startsWith('/settings/')),
    ).toHaveLength(2);

    const output = formatAppClientInspection(inspection);
    expect(output).toMatch(/Bootstrap order/u);
    expect(output).toMatch(/Settings/u);
    expect(output).toMatch(/group: authorization/u);
    expect(formatAppClientInspection(inspection, 'settings')).not.toMatch(
      /\nRoutes\n/u,
    );
    expect(
      Object.keys(selectAppClientInspection(inspection, 'settings')),
    ).toEqual(['app', 'settings', 'consistent', 'issues', 'suggestions']);
    expect(output).toMatch(/Routes/u);
    expect(output).toMatch(/auth: guest/u);
    expect(output).toMatch(/route source: plugin/u);
    expect(output).toMatch(/component source: application/u);
    expect(output).toMatch(
      /client\/extensions\/nocobase-auth-ui\/pages\/login-page/u,
    );
    expect(output).toMatch(/Providers \(outer -> inner\)/u);
    expect(output).toMatch(/Locale declarations/u);
    expect(output).toMatch(/layer: root/u);
    expect(output).toMatch(/Issues: none/u);
    expect(output).toMatch(/Route components.*not inspected/su);

    // `entry` used to duplicate `routeEntry`, and `componentEntry` was emitted as
    // an explicit undefined. Both are gone: the key is present only when set.
    expect(inspection.routes[0]).toEqual({
      auth: 'required',
      id: '@nocobase/app-template-default:home',
      name: 'home',
      order: 1,
      packageName: '@nocobase/app-template-default',
      parent: 'app',
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

    expect(selectAppClientInspection(inspection, 'routes')).toEqual({
      app: inspection.app,
      routes: inspection.routes,
      consistent: true,
      issues: [],
      suggestions: [],
    });
    expect(selectAppClientInspection(inspection, 'bootstrap')).toEqual({
      app: inspection.app,
      bootstraps: inspection.bootstraps,
      consistent: true,
      issues: [],
      suggestions: [],
    });
    expect(selectAppClientInspection(inspection, 'locales')).toEqual({
      app: inspection.app,
      locales: inspection.locales,
      consistent: true,
      issues: [],
      suggestions: [],
    });

    expect(createAppClientInspectionSuccess(inspection, 'settings')).toEqual({
      schemaVersion: 1,
      ok: true,
      operation: 'client:inspect',
      status: 'success',
      result: selectAppClientInspection(inspection, 'settings'),
    });
  });

  it('reports missing Settings access without loading pages or running bootstrap', async () => {
    const appRoot = await createInspectionApp(`
      globalThis.__clientInspectCalls = { bootstrap: 0, locales: 0, page: 0, routes: 0 };
      const plugin = {
        packageName: '@example/client-plugin',
        bootstrap: async () => ({
          default: () => { globalThis.__clientInspectCalls.bootstrap += 1; },
        }),
        locales: async () => {
          globalThis.__clientInspectCalls.locales += 1;
          return { default: {} };
        },
        routes: async () => {
          globalThis.__clientInspectCalls.routes += 1;
          return {
            default: [{
              parent: 'settings',
              routes: [{
                name: 'example',
                path: '/example',
                navigation: { title: 'Example' },
                componentLoader: async () => {
                  globalThis.__clientInspectCalls.page += 1;
                  return { default: () => null };
                },
              }],
            }],
          };
        },
        providers: undefined,
        options: undefined,
      };
      export default { plugins: [plugin], routeComponentOverrides: [] };
    `);

    const inspection = await inspectAppClient({ appRoot });

    expect(globalThis.__clientInspectCalls).toEqual({
      bootstrap: 0,
      locales: 0,
      page: 0,
      routes: 1,
    });
    expect(inspection.consistent).toBe(false);
    expect(inspection.locales).toEqual([
      {
        order: 1,
        packageName: '@example/inspect-app',
        source: 'application',
      },
      {
        order: 2,
        packageName: '@example/client-plugin',
        source: 'plugin',
      },
    ]);
    expect(inspection.issues).toEqual([
      expect.objectContaining({
        code: 'CLIENT_SETTINGS_ACCESS_MISSING',
        packageName: '@example/client-plugin',
        routeId: 'example',
      }),
    ]);
  });

  it('inspects only locale declarations without executing unrelated factories', async () => {
    const appRoot = await createInspectionApp(`
      globalThis.__clientLocalesOnlyCalls = { locales: 0, providers: 0, routes: 0 };
      const plugin = {
        packageName: '@example/client-locales-only-inspection',
        locales: async () => {
          globalThis.__clientLocalesOnlyCalls.locales += 1;
          return { default: {} };
        },
        routes: async () => {
          globalThis.__clientLocalesOnlyCalls.routes += 1;
          throw new Error('routes must not run during locales-only inspection');
        },
        providers: async () => {
          globalThis.__clientLocalesOnlyCalls.providers += 1;
          throw new Error('providers must not run during locales-only inspection');
        },
      };
      export default { plugins: [plugin], routeComponentOverrides: [] };
    `);

    const inspection = await inspectAppClient({ appRoot, type: 'locales' });

    expect(globalThis.__clientLocalesOnlyCalls).toEqual({
      locales: 0,
      providers: 0,
      routes: 0,
    });
    expect(inspection).toEqual({
      app: {
        packageName: '@example/inspect-app',
        appRoot,
      },
      locales: [
        {
          order: 1,
          packageName: '@example/inspect-app',
          source: 'application',
        },
        {
          order: 2,
          packageName: '@example/client-locales-only-inspection',
          source: 'plugin',
        },
      ],
      consistent: true,
      issues: [],
      suggestions: [],
    });
  });

  it('uses stable errors for missing and invalid Client composition', async () => {
    const missingRoot = await createInspectionApp();
    await expect(
      inspectAppClient({ appRoot: missingRoot }),
    ).rejects.toMatchObject({
      code: 'CLIENT_COMPOSITION_NOT_FOUND',
    });

    const invalidRoot = await createInspectionApp('export default {};');
    await expect(
      inspectAppClient({ appRoot: invalidRoot }),
    ).rejects.toMatchObject({
      code: 'CLIENT_COMPOSITION_INVALID',
    });
  });

  it('formats stable JSON failures', () => {
    expect(
      createAppClientInspectionFailure(
        new ClientInspectionError(
          'CLIENT_ROUTES_LOAD_FAILED',
          'Unable to load Routes.',
        ),
      ),
    ).toEqual({
      schemaVersion: 1,
      ok: false,
      operation: 'client:inspect',
      status: 'failure',
      error: {
        code: 'CLIENT_ROUTES_LOAD_FAILED',
        message: 'Unable to load Routes.',
        suggestions: [
          'Check client/plugins.ts and registered Client declaration modules, then rerun client:inspect.',
        ],
      },
    });
  });
});

declare global {
  var __clientInspectCalls:
    { bootstrap: number; page: number; routes: number } | undefined;
}

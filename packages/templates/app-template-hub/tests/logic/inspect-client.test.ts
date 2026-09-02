// @vitest-environment node

import { spawn } from 'node:child_process';
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
    `
      class AppProvider {}
      export default {
        packageName: '@example/inspect-app',
        config: () => ({}),
        serviceProviders: [AppProvider],
        reactProviders: [],
        routes: [],
        locales: { 'en-US': async () => ({ default: {} }) },
        plugins: [],
      };
    `,
  );
  if (pluginsSource !== undefined) {
    await writeFile(path.join(appRoot, 'client/plugins.ts'), pluginsSource);
  }
  return appRoot;
}

describe('client inspection', () => {
  it('parses the static Client contribution types', () => {
    expect(
      parseInspectAppClientArgs(['--type', 'react-providers', '--json']),
    ).toEqual({ help: false, json: true, type: 'react-providers' });
    expect(
      parseInspectAppClientArgs(['--type', 'service-providers']).type,
    ).toBe('service-providers');
    expect(parseInspectAppClientArgs(['--type', 'config']).type).toBe('config');
    expect(parseInspectAppClientArgs(['--type', 'settings']).type).toBe(
      'settings',
    );
    expect(parseInspectAppClientArgs(['--type', 'locales']).type).toBe(
      'locales',
    );
    expect(parseInspectAppClientArgs(['--type', 'dev-routes']).type).toBe(
      'dev-routes',
    );
    expect(() => parseInspectAppClientArgs(['--type', 'providers'])).toThrow(
      '--type must be all, config, service-providers, react-providers, routes, settings, dev-routes, or locales.',
    );
  });

  it('inspects configured Client contributions without running lifecycle or leaf loaders', async () => {
    const inspection = await inspectAppClient();

    expect(inspection.app).toMatchObject({
      packageName: '@nocobase/app-template-hub',
    });
    expect(inspection.consistent).toBe(true);
    expect(inspection.issues).toEqual([]);
    expect(
      inspection.routes.map(({ auth, id, path }) => ({ auth, id, path })),
    ).toEqual([
      {
        auth: 'required',
        id: '@nocobase/app-template-hub:home',
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
      {
        auth: 'required',
        id: '@nocobase/app-plugin-hub:hub.applications',
        path: '/apps',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-hub:hub.application-detail',
        path: '/apps/:appId',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-hub:hub.deployments',
        path: '/deployments',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-hub:hub.deployment-detail',
        path: '/deployments/:deploymentId',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-hub:hub.audit',
        path: '/audit',
      },
      {
        auth: 'required',
        id: '@nocobase/app-plugin-hub:hub.members',
        path: '/members',
      },
    ]);
    expect(
      inspection.reactProviders.map(({ id, order }) => ({ id, order })),
    ).toEqual([
      { id: '@nocobase/app-template-hub:theme', order: 1 },
      {
        id: '@nocobase/app-plugin-notification-provider:notification-host',
        order: 2,
      },
      {
        id: '@nocobase/app-plugin-routes-example:routes-example',
        order: 3,
      },
      {
        id: '@nocobase/app-plugin-hub:hub-applications',
        order: 4,
      },
    ]);
    expect(
      inspection.serviceProviders.map(({ packageName, order }) => ({
        packageName,
        order,
      })),
    ).toEqual([
      { packageName: '@nocobase/app-template-hub', order: 1 },
      { packageName: '@nocobase/app-plugin-authentication', order: 2 },
      { packageName: '@nocobase/app-plugin-authorization', order: 3 },
      { packageName: '@nocobase/app-plugin-i18n', order: 4 },
      { packageName: '@nocobase/app-plugin-notification-provider', order: 5 },
      { packageName: '@nocobase/app-plugin-workflow', order: 6 },
      { packageName: '@nocobase/app-plugin-notification', order: 7 },
      { packageName: '@nocobase/app-plugin-hub', order: 8 },
    ]);
    expect(inspection.configs[0]).toMatchObject({
      kind: 'factory',
      packageName: '@nocobase/app-template-hub',
      source: 'application',
    });
    expect(inspection.locales).toEqual(
      expect.arrayContaining([
        {
          order: 1,
          packageName: '@nocobase/app-template-hub',
          source: 'application',
        },
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-workflow',
          source: 'plugin',
        }),
        expect.objectContaining({
          packageName: '@nocobase/app-plugin-hub',
          source: 'plugin',
        }),
      ]),
    );
    expect(inspection.settings.slice(0, 4).map(({ id }) => id)).toEqual([
      'permission-sets',
      'default-access',
      'sharing-rules',
      'restriction-rules',
    ]);

    const output = formatAppClientInspection(inspection);
    expect(output).toMatch(/Config declarations/u);
    expect(output).toMatch(/ServiceProviders/u);
    expect(output).toMatch(/React Providers \(outer -> inner\)/u);
    expect(output).toMatch(/Locale declarations/u);
    expect(output).toMatch(/Issues: none/u);
    expect(output).toMatch(/ServiceProvider lifecycle.*not inspected/su);
    expect(formatAppClientInspection(inspection, 'settings')).not.toMatch(
      /\nRoutes\n/u,
    );
    expect(
      Object.keys(selectAppClientInspection(inspection, 'settings')),
    ).toEqual(['app', 'settings', 'consistent', 'issues', 'suggestions']);
    expect(selectAppClientInspection(inspection, 'service-providers')).toEqual({
      app: inspection.app,
      serviceProviders: inspection.serviceProviders,
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

  it('reports missing Settings access without running providers or leaf loaders', async () => {
    const appRoot = await createInspectionApp(`
      globalThis.__clientInspectCalls = { lifecycle: 0, locale: 0, page: 0 };
      class ExampleProvider {
        boot() { globalThis.__clientInspectCalls.lifecycle += 1; }
      }
      const plugin = {
        packageName: '@example/client-plugin',
        config: [],
        serviceProviders: [ExampleProvider],
        locales: {
          'en-US': async () => {
            globalThis.__clientInspectCalls.locale += 1;
            return { default: {} };
          },
        },
        routes: [{
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
        reactProviders: [],
        routeComponentOverrides: [],
        options: {},
      };
      export default { plugins: [plugin], routeComponentOverrides: [] };
    `);

    const inspection = await inspectAppClient({ appRoot });

    expect(globalThis.__clientInspectCalls).toEqual({
      lifecycle: 0,
      locale: 0,
      page: 0,
    });
    expect(inspection.consistent).toBe(false);
    expect(inspection.issues).toEqual([
      expect.objectContaining({
        code: 'CLIENT_SETTINGS_ACCESS_MISSING',
        packageName: '@example/client-plugin',
        routeId: 'example',
      }),
    ]);
  });

  it('inspects a single declaration type without resolving unrelated contributions', async () => {
    const appRoot = await createInspectionApp(`
      globalThis.__clientLocalesOnlyCalls = { lifecycle: 0, locale: 0, route: 0 };
      const plugin = {
        packageName: '@example/client-locales-only-inspection',
        config: [],
        serviceProviders: [],
        locales: {
          'en-US': async () => {
            globalThis.__clientLocalesOnlyCalls.locale += 1;
            return { default: {} };
          },
        },
        get routes() {
          globalThis.__clientLocalesOnlyCalls.route += 1;
          throw new Error('routes must not be read during locales-only inspection');
        },
        reactProviders: [],
        routeComponentOverrides: [],
        options: {},
      };
      export default { plugins: [plugin], routeComponentOverrides: [] };
    `);

    const inspection = await inspectAppClient({ appRoot, type: 'locales' });

    expect(globalThis.__clientLocalesOnlyCalls).toEqual({
      lifecycle: 0,
      locale: 0,
      route: 0,
    });
    expect(inspection.locales).toHaveLength(2);
    expect(inspection.routes).toEqual([]);
    expect(inspection.reactProviders).toEqual([]);
  });

  /**
   * The regression this guards against: `client:inspect` runs under tsx, but its own tests run under Vitest, which
   * is built on Vite. A declaration module written for a bundler — `client/source-extensions.ts` calls
   * `import.meta.glob()` — therefore loaded fine in the tests while the real command failed with
   * `.glob is not a function`, and the difference in environment hid the break entirely.
   *
   * So this runs the actual command as a child process, the way a developer does.
   */
  it('runs as a command under tsx, where declarations need a bundler', async () => {
    const appRoot = path.resolve(import.meta.dirname, '../..');
    const { stdout, code } = await new Promise<{
      stdout: string;
      code: number | null;
    }>((resolve, reject) => {
      const child = spawn(
        'pnpm',
        [
          'exec',
          'tsx',
          './scripts/inspect-client.mjs',
          '--type',
          'settings',
          '--json',
        ],
        { cwd: appRoot, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk) => (out += String(chunk)));
      child.stderr.on('data', (chunk) => (err += String(chunk)));
      child.on('error', reject);
      // A hang is the failure mode here as much as a crash: the command has to exit on its own.
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(
          new Error(
            `client:inspect did not exit. stderr: ${err.slice(0, 500)}`,
          ),
        );
      }, 120_000);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout: out, code });
      });
    });

    expect(code).toBe(0);
    const payload = JSON.parse(stdout) as {
      ok: boolean;
      result: { settings: readonly { path: string }[] };
    };
    expect(payload.ok).toBe(true);
    expect(payload.result.settings.length).toBeGreaterThan(0);
  }, 150_000);

  it('uses stable errors for missing and invalid Client composition', async () => {
    const missingRoot = await createInspectionApp();
    await expect(
      inspectAppClient({ appRoot: missingRoot }),
    ).rejects.toMatchObject({ code: 'CLIENT_COMPOSITION_NOT_FOUND' });

    const invalidRoot = await createInspectionApp('export default {};');
    await expect(
      inspectAppClient({ appRoot: invalidRoot }),
    ).rejects.toMatchObject({ code: 'CLIENT_COMPOSITION_INVALID' });
  });

  it('formats stable JSON failures', () => {
    expect(
      createAppClientInspectionFailure(
        new ClientInspectionError(
          'CLIENT_RUNTIME_IMPORT_FAILED',
          'Unable to import Client Runtime.',
        ),
      ),
    ).toEqual({
      schemaVersion: 1,
      ok: false,
      operation: 'client:inspect',
      status: 'failure',
      error: {
        code: 'CLIENT_RUNTIME_IMPORT_FAILED',
        message: 'Unable to import Client Runtime.',
        suggestions: [
          'Check client/runtime.ts, client/plugins.ts, and registered Client declarations, then rerun client:inspect.',
        ],
      },
    });
  });
});

declare global {
  var __clientInspectCalls:
    { lifecycle: number; locale: number; page: number } | undefined;
  var __clientLocalesOnlyCalls:
    { lifecycle: number; locale: number; route: number } | undefined;
}

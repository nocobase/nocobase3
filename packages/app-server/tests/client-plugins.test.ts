// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  createAppClientPluginLoadersSource,
  type ResolvedAppPlugin,
} from '../src/plugins/index.js';

describe('app client plugin loaders', () => {
  it('generates independent loaders only for enabled client contributions', () => {
    const source = createAppClientPluginLoadersSource([
      createPlugin({
        packageName: '@nocobase/app-plugin-authentication',
        client: {
          bootstrap: './client/bootstrap',
          routes: './client/routes',
        },
        enabled: true,
      }),
      createPlugin({
        packageName: '@nocobase/app-plugin-routes-example',
        client: {
          routes: './client/routes',
          providers: './client/providers',
        },
        enabled: true,
      }),
      createPlugin({
        packageName: '@nocobase/app-plugin-disabled',
        client: { bootstrap: './client/bootstrap' },
        enabled: false,
      }),
      createPlugin({
        packageName: '@nocobase/app-plugin-server-only',
        enabled: true,
      }),
    ]);

    expect(source).toContain(
      'loadBootstrap: () => import("@nocobase/app-plugin-authentication/client/bootstrap")',
    );
    expect(source).toContain(
      'loadRoutes: () => import("@nocobase/app-plugin-authentication/client/routes")',
    );
    expect(source).toContain(
      'loadRoutes: () => import("@nocobase/app-plugin-routes-example/client/routes")',
    );
    expect(source).toContain(
      'loadProviders: () => import("@nocobase/app-plugin-routes-example/client/providers")',
    );
    expect(source).not.toContain('@nocobase/app-plugin-disabled');
    expect(source).not.toContain('@nocobase/app-plugin-server-only');
  });

  it('rejects an unsafe client contribution entry', () => {
    expect(() =>
      createAppClientPluginLoadersSource([
        createPlugin({
          packageName: '@nocobase/app-plugin-invalid',
          client: { routes: '../client/routes' },
          enabled: true,
        }),
      ]),
    ).toThrow('client routes entry must be a safe package subpath');
  });
});

function createPlugin(options: {
  packageName: string;
  client?: ResolvedAppPlugin['manifest']['client'];
  enabled: boolean;
}): ResolvedAppPlugin {
  return {
    packageName: options.packageName,
    version: '1.0.0',
    enabled: options.enabled,
    rootDir: `/plugins/${options.packageName}`,
    manifest: options.client ? { client: options.client } : {},
  };
}

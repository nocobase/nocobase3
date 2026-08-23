// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createAppClientPluginLoadersSource } from '../../scripts/client-plugins.ts';
import type { ResolvedAppPlugin } from '../../server/plugins/index.ts';

describe('app client plugin loaders', () => {
  it('generates static imports only for enabled client plugins', () => {
    const source = createAppClientPluginLoadersSource([
      createPlugin({
        packageName: '@nocobase/app-plugin-authentication',
        client: './client/bootstrap',
        enabled: true,
      }),
      createPlugin({
        packageName: '@nocobase/app-plugin-routes-example',
        client: './client/bootstrap',
        enabled: true,
      }),
      createPlugin({
        packageName: '@nocobase/app-plugin-disabled',
        client: './client/bootstrap',
        enabled: false,
      }),
      createPlugin({
        packageName: '@nocobase/app-plugin-server-only',
        enabled: true,
      }),
    ]);

    expect(source).toContain(
      'import("@nocobase/app-plugin-authentication/client/bootstrap")',
    );
    expect(source).toContain(
      'import("@nocobase/app-plugin-routes-example/client/bootstrap")',
    );
    expect(source).not.toContain('@nocobase/app-plugin-disabled');
    expect(source).not.toContain('@nocobase/app-plugin-server-only');
  });

  it('rejects an unsafe client entry', () => {
    expect(() =>
      createAppClientPluginLoadersSource([
        createPlugin({
          packageName: '@nocobase/app-plugin-invalid',
          client: '../client/bootstrap',
          enabled: true,
        }),
      ]),
    ).toThrow('client entry must be a safe package subpath');
  });
});

function createPlugin(options: {
  packageName: string;
  client?: string;
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

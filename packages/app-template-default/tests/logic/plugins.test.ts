// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  createPluginMigrationSources,
  createPluginSeedSources,
  type ResolvedAppPlugin,
} from '../../server/plugins/index.ts';

describe('app plugin database sources', () => {
  it('creates sources only for enabled plugins', () => {
    const plugins: ResolvedAppPlugin[] = [
      createPlugin({
        packageName: '@nocobase/app-plugin-enabled',
        enabled: true,
      }),
      createPlugin({
        packageName: '@nocobase/app-plugin-disabled',
        enabled: false,
      }),
    ];

    expect(createPluginMigrationSources(plugins)).toEqual([
      {
        packageName: '@nocobase/app-plugin-enabled',
        directory: '/plugins/enabled/database/migrations',
      },
    ]);
    expect(createPluginSeedSources(plugins)).toEqual([
      {
        packageName: '@nocobase/app-plugin-enabled',
        directory: '/plugins/enabled/database/seeds',
      },
    ]);
  });
});

function createPlugin(
  options: Pick<ResolvedAppPlugin, 'packageName' | 'enabled'>,
): ResolvedAppPlugin {
  const slug = options.enabled ? 'enabled' : 'disabled';
  return {
    ...options,
    version: '1.0.0',
    rootDir: `/plugins/${slug}`,
    manifest: {},
    migrationsDirectory: `/plugins/${slug}/database/migrations`,
    seedsDirectory: `/plugins/${slug}/database/seeds`,
  };
}

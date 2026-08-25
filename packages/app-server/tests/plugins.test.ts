// @vitest-environment node

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createPluginJobLocations,
  createPluginMigrationSources,
  createPluginSeedSources,
  loadPluginBootstraps,
  loadPluginRoutes,
  type ResolvedAppPlugin,
} from '../src/plugins/index.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

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

describe('app plugin jobs', () => {
  it('creates job locations only for enabled plugins', () => {
    const plugins: ResolvedAppPlugin[] = [
      {
        ...createPlugin({
          packageName: '@nocobase/app-plugin-enabled',
          enabled: true,
        }),
        jobsDirectory: '/plugins/enabled/server/jobs',
      },
      {
        ...createPlugin({
          packageName: '@nocobase/app-plugin-disabled',
          enabled: false,
        }),
        jobsDirectory: '/plugins/disabled/server/jobs',
      },
    ];

    expect(createPluginJobLocations(plugins)).toEqual([
      '/plugins/enabled/server/jobs/**/*.{ts,js,mts,mjs}',
    ]);
  });
});

describe('app plugin routes', () => {
  it('loads route registrars only for enabled plugins', async () => {
    const enabledEntry = createRoutesEntry(
      'export default function registerRoutes() {}',
    );
    const disabledEntry = createRoutesEntry(
      'throw new Error("disabled plugin routes should not load")',
    );
    const plugins = [
      {
        ...createPlugin({
          packageName: '@nocobase/app-plugin-enabled',
          enabled: true,
        }),
        routesEntry: enabledEntry,
      },
      {
        ...createPlugin({
          packageName: '@nocobase/app-plugin-disabled',
          enabled: false,
        }),
        routesEntry: disabledEntry,
      },
    ];

    await expect(loadPluginRoutes(plugins)).resolves.toEqual([
      {
        packageName: '@nocobase/app-plugin-enabled',
        registerRoutes: expect.any(Function),
      },
    ]);
  });

  it('rejects a routes entry without a default function', async () => {
    const routesEntry = createRoutesEntry('export const routes = {};');
    const plugin = {
      ...createPlugin({
        packageName: '@nocobase/app-plugin-enabled',
        enabled: true,
      }),
      routesEntry,
    };

    await expect(loadPluginRoutes([plugin])).rejects.toThrow(
      'Plugin "@nocobase/app-plugin-enabled" routes entry must default-export a function.',
    );
  });
});

describe('app plugin bootstraps', () => {
  it('loads default bootstraps only for enabled plugins', async () => {
    const enabledEntry = createRoutesEntry('export default function init() {}');
    const disabledEntry = createRoutesEntry(
      'throw new Error("disabled plugin server should not load")',
    );
    const plugins = [
      {
        ...createPlugin({
          packageName: '@nocobase/app-plugin-enabled',
          enabled: true,
        }),
        bootstrapEntry: enabledEntry,
      },
      {
        ...createPlugin({
          packageName: '@nocobase/app-plugin-disabled',
          enabled: false,
        }),
        bootstrapEntry: disabledEntry,
      },
    ];

    await expect(loadPluginBootstraps(plugins)).resolves.toEqual([
      {
        packageName: '@nocobase/app-plugin-enabled',
        bootstrap: expect.any(Function),
      },
    ]);
  });

  it('rejects a bootstrap entry without a default function', async () => {
    const bootstrapEntry = createRoutesEntry('export const bootstrap = {};');
    const plugin = {
      ...createPlugin({
        packageName: '@nocobase/app-plugin-enabled',
        enabled: true,
      }),
      bootstrapEntry,
    };

    await expect(loadPluginBootstraps([plugin])).rejects.toThrow(
      'Plugin "@nocobase/app-plugin-enabled" bootstrap entry must default-export a function.',
    );
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

function createRoutesEntry(source: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'app-plugin-routes-'));
  tempDirs.push(directory);
  const entry = path.join(directory, 'index.mjs');
  writeFileSync(entry, source);
  return entry;
}

import { describe, expect, it, vi } from 'vitest';
import { Application } from '../src/application/index.js';
import { AppConfig, createConfigPaths } from '../src/config/index.js';
import * as plugins from '../src/plugins/index.js';
import * as appServer from '../src/index.js';

const config = new AppConfig();
await config.loadAll();

function createApp(): Application {
  return new Application({
    config,
    paths: createConfigPaths({ rootDir: '/unused' }),
  });
}

describe('retired plugin queue metadata', () => {
  it('does not export the obsolete job-location helper', () => {
    expect(plugins).not.toHaveProperty('createPluginJobLocations');
    expect(appServer).not.toHaveProperty('createPluginJobLocations');
  });

  it.each([null, {}, { jobs: [] }, { jobs: ['./jobs'] }, false, '', 0])(
    'rejects legacy JavaScript queue descriptors (%j) at every boundary',
    (queue) => {
      // An extra property on a JavaScript descriptor must still be rejected after the TypeScript API retires it.
      const definition = {
        packageName: '@nocobase/uninstalled',
        serviceProviders: [],
        routes: [],
        queue,
      };
      const resolved = {
        appPackageName: '@nocobase/test',
        plugins: [
          {
            definition,
            metadata: {
              packageName: definition.packageName,
              version: 'test',
              rootDir: '/unused',
              jobLocations: [],
            },
          },
        ],
      };
      const message =
        'Server plugin "@nocobase/uninstalled" queue.jobs is retired; register QueueService handlers through a service provider.';

      expect(() => plugins.defineServerPlugin(definition)).toThrow(message);
      expect(() => plugins.defineServerPlugins([definition])).toThrow(message);
      expect(() =>
        plugins.resolveAppServerPlugins('/unused', { plugins: [definition] }),
      ).toThrow(message);
      expect(() => plugins.inspectResolvedAppServerPlugins(resolved)).toThrow(
        message,
      );
      expect(() =>
        plugins.createAppDatabaseTaskContributions(resolved),
      ).toThrow(message);
      expect(() => createApp().addServerPlugins(resolved)).toThrow(message);
      expect(() =>
        createApp().addRuntimeContributions({
          plugins: resolved,
          serviceProviders: [],
          routes: [],
        }),
      ).toThrow(message);
    },
  );

  it.each([{}, { queue: undefined }])(
    'accepts absent or undefined legacy queue values (%j) without emitting queue metadata',
    (extra) => {
      const definition = {
        packageName: '@nocobase/test',
        serviceProviders: [],
        routes: [],
        ...extra,
      };
      const plugin = plugins.defineServerPlugin(definition);
      expect(plugin).not.toHaveProperty('queue');
      expect(plugins.defineServerPlugins([definition]).plugins).toEqual([
        definition,
      ]);
      const resolved = {
        appPackageName: '@nocobase/test',
        plugins: [
          {
            definition,
            metadata: {
              packageName: definition.packageName,
              version: 'test',
              rootDir: '/unused',
              jobLocations: [],
            },
          },
        ],
      };
      const inspection = plugins.inspectResolvedAppServerPlugins(resolved);
      expect(inspection).not.toHaveProperty('jobs');
      expect(inspection.plugins[0]?.contributions).not.toHaveProperty(
        'jobLocations',
      );
      expect(() => createApp().addServerPlugins(resolved)).not.toThrow();
    },
  );

  it('rejects a later legacy descriptor before constructing any plugin provider', () => {
    const constructor = vi.fn();
    class Provider {
      public readonly name: string = 'test';
      public constructor() {
        constructor();
      }
    }
    const definition = plugins.defineServerPlugin({
      packageName: '@nocobase/valid',
      serviceProviders: [Provider],
    });
    const legacy = {
      ...definition,
      packageName: '@nocobase/legacy',
      serviceProviders: [],
      queue: {},
    };
    const resolved = {
      appPackageName: '@nocobase/test',
      plugins: [definition, legacy].map((plugin) => ({
        definition: plugin,
        metadata: {
          packageName: plugin.packageName,
          version: 'test',
          rootDir: '/unused',
          jobLocations: [],
        },
      })),
    };
    expect(() => createApp().addServerPlugins(resolved)).toThrow(
      'queue.jobs is retired',
    );
    expect(constructor).not.toHaveBeenCalled();
  });
});

import type { Logging } from '@nocobase/logging';
import { ServiceProvider } from '@nocobase/service-provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Application } from '../src/application/index.js';
import { AppConfig, createAppPaths } from '../src/config/index.js';
import { loggingToken } from '../src/logging/index.js';
import * as plugins from '../src/plugins/index.js';
import * as appServer from '../src/index.js';

const config = new AppConfig();
await config.loadAll();

afterEach(() => {
  vi.restoreAllMocks();
});

function createApp(): Application {
  return new Application({
    config,
    paths: createAppPaths({ rootDir: '/unused' }),
  });
}

const message =
  'Server plugin "@nocobase/app-server" declares queue.jobs, which is retired and ignored: the jobs it lists are no longer discovered or run. Register job classes on a JobExecutor from @nocobase/jobs, or QueueService handlers, in a service provider, and remove the queue declaration.';

// A JavaScript descriptor from a plugin built against the earlier contract.
function legacyPlugin(queue: unknown, registered = vi.fn()) {
  class Provider extends ServiceProvider<Application> {
    public readonly name: string = 'legacy-provider';
    public override register(): void {
      registered();
    }
  }
  const definition = {
    // The resolver walks up from baseDir to this package's own manifest.
    packageName: '@nocobase/app-server',
    baseDir: import.meta.dirname,
    serviceProviders: [Provider],
    routes: [],
    queue,
  };
  return { definition, registered };
}

describe('retired plugin queue metadata', () => {
  it('does not export the obsolete job-location helper', () => {
    expect(plugins).not.toHaveProperty('createPluginJobLocations');
    expect(appServer).not.toHaveProperty('createPluginJobLocations');
  });

  it.each([null, {}, { jobs: [] }, { jobs: ['./jobs'] }, false, '', 0])(
    'ignores a legacy queue descriptor (%j) at every boundary instead of refusing to start',
    (queue) => {
      const { definition, registered } = legacyPlugin(queue);

      expect(plugins.defineServerPlugin(definition)).toMatchObject({ queue });
      expect(plugins.defineServerPlugins([definition]).plugins).toEqual([
        definition,
      ]);
      const resolved = plugins.resolveAppServerPlugins(import.meta.dirname, {
        plugins: [definition],
      });
      expect(resolved.plugins[0]?.metadata).not.toHaveProperty('jobLocations');
      expect(
        plugins.createAppDatabaseTaskContributions(resolved),
      ).toMatchObject({ migrations: [], seeds: [] });

      const inspection = plugins.inspectResolvedAppServerPlugins(resolved);
      expect(inspection).not.toHaveProperty('jobs');
      expect(inspection.issues).toEqual([
        {
          code: 'SERVER_QUEUE_JOBS_RETIRED',
          severity: 'warning',
          packageName: '@nocobase/app-server',
          message,
        },
      ]);

      // The plugin's own providers still load.
      const app = createApp();
      app.addServerPlugins(resolved);
      app.registerProviders();
      expect(registered).toHaveBeenCalledOnce();
    },
  );

  it.each([{}, { queue: undefined }])(
    'accepts absent or undefined legacy queue values (%j) without emitting queue metadata or a warning',
    async (extra) => {
      const definition = {
        packageName: '@nocobase/app-server',
        baseDir: import.meta.dirname,
        serviceProviders: [],
        routes: [],
        ...extra,
      };
      expect(plugins.defineServerPlugin(definition)).not.toHaveProperty(
        'queue',
      );
      const resolved = plugins.resolveAppServerPlugins(import.meta.dirname, {
        plugins: [definition],
      });
      const inspection = plugins.inspectResolvedAppServerPlugins(resolved);
      expect(inspection.issues).toEqual([]);
      expect(inspection.plugins[0]?.contributions).not.toHaveProperty(
        'jobLocations',
      );
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const app = createApp();
      app.addServerPlugins(resolved);
      await app.start();
      await app.shutdown();
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('logs the retired declaration once through application logging when it starts', async () => {
    const warn = vi.fn();
    const getLogger = vi.fn(() => ({ warn }));
    const { definition } = legacyPlugin({ jobs: ['./jobs'] });
    const app = createApp();
    app.container.instance(loggingToken, { getLogger } as unknown as Logging);
    app.addServerPlugins(
      plugins.resolveAppServerPlugins(import.meta.dirname, {
        plugins: [definition],
      }),
    );
    await app.start();
    await app.shutdown();
    expect(getLogger).toHaveBeenCalledWith('plugins');
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      { packageName: '@nocobase/app-server' },
      message,
    );
  });

  it('falls back to the console when the application has no logging', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { definition } = legacyPlugin({});
    const app = createApp();
    app.addServerPlugins(
      plugins.resolveAppServerPlugins(import.meta.dirname, {
        plugins: [definition],
      }),
    );
    await app.start();
    await app.shutdown();
    expect(warn).toHaveBeenCalledExactlyOnceWith(message);
  });
});

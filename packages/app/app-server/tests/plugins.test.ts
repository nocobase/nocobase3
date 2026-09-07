// @vitest-environment node

import path from 'node:path';
import { glob, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  defineServerPlugin,
  defineServerPlugins,
  resolveAppServerPlugins,
} from '../src/plugins/index.js';
import { defineApiRoutes, defineRootRoutes } from '../src/router/index.js';
import { Hono } from 'hono';
import { AppConfig } from '../src/config/index.js';
import { queueConfig } from '../src/queue/config.js';
import { resolveStandaloneAppRuntime } from '../src/node/index.js';

describe('server plugin definitions', () => {
  it('discovers executable source and compiled jobs without importing declarations', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'plugin-job-discovery-'));
    try {
      const packageRoot = path.join(
        root,
        'node_modules',
        '@example',
        'job-discovery-fixture',
      );
      const jobs = path.join(packageRoot, 'dist/server/jobs');
      await mkdir(jobs, { recursive: true });
      await writeFile(
        path.join(packageRoot, 'package.json'),
        JSON.stringify({
          name: '@example/job-discovery-fixture',
          version: '1.0.0',
        }),
      );
      const executable = [
        'source.ts',
        'module.mts',
        'compiled.js',
        'module.mjs',
        'named.d.js',
      ];
      for (const name of [...executable, 'compiled.d.ts', 'module.d.mts']) {
        await writeFile(
          path.join(jobs, name),
          'export default class ExampleJob {}',
        );
      }
      const plugins = defineServerPlugins([
        defineServerPlugin({
          packageName: '@example/job-discovery-fixture',
          queue: { jobs: ['./server/jobs'] },
        }),
      ]);
      const pattern = resolveAppServerPlugins(root, plugins).plugins[0]
        ?.metadata.jobLocations[0];
      expect(pattern).toBeDefined();
      const discovered: string[] = [];
      for await (const file of glob(pattern!))
        discovered.push(path.basename(file));
      expect(discovered.sort()).toEqual(executable.sort());
      const appJobs = path.join(root, 'server/jobs');
      await mkdir(appJobs, { recursive: true });
      for (const name of ['source.ts', 'compiled.js', 'compiled.d.ts']) {
        await writeFile(
          path.join(appJobs, name),
          'export default class AppJob {}',
        );
      }
      const runtime = await resolveStandaloneAppRuntime(
        {
          config: (context) => new AppConfig([queueConfig], { context }),
          plugins: defineServerPlugins([]),
          routes: [],
          serviceProviders: [],
        },
        { rootDir: root },
      );
      const appDiscovered: string[] = [];
      for (const location of runtime.appConfig.get(queueConfig).jobs
        ?.locations ?? []) {
        for await (const file of glob(location))
          appDiscovered.push(path.basename(file));
      }
      expect(appDiscovered.sort()).toEqual(['compiled.js', 'source.ts']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('normalizes optional contributions and freezes the result', () => {
    const plugin = defineServerPlugin({
      packageName: '@nocobase/app-plugin-example',
    });

    expect(plugin).toEqual({
      packageName: '@nocobase/app-plugin-example',
      config: [],
      serviceProviders: [],
      routes: [],
      database: undefined,
      queue: undefined,
    });
    expect(Object.isFrozen(plugin)).toBe(true);
    expect(Object.isFrozen(plugin.serviceProviders)).toBe(true);
  });

  it('preserves order and rejects duplicate packages', () => {
    const first = defineServerPlugin({
      packageName: '@nocobase/app-plugin-first',
    });
    const second = defineServerPlugin({
      packageName: '@nocobase/app-plugin-second',
    });

    const plugins = defineServerPlugins([first, second]);
    expect(plugins.plugins).toEqual([first, second]);
    expect(Object.isFrozen(plugins.plugins)).toBe(true);
    expect(() => defineServerPlugins([first, first])).toThrow(
      'Server plugin "@nocobase/app-plugin-first" is registered more than once.',
    );
  });

  it('keeps API and root route definitions distinct', () => {
    const apiRoutes = defineApiRoutes(() => {
      return new Hono();
    });
    const rootRoutes = defineRootRoutes(() => {
      return new Hono();
    });

    expect(apiRoutes.scope).toBe('api');
    expect(rootRoutes.scope).toBe('root');
    expect(apiRoutes.createRouter).toBeTypeOf('function');
    expect(rootRoutes.createRouter).toBeTypeOf('function');
    expect(Object.isFrozen(apiRoutes)).toBe(true);
    expect(Object.isFrozen(rootRoutes)).toBe(true);
  });

  it('copies and freezes the unified routes array', () => {
    const route = defineApiRoutes(() => new Hono());
    const routes = [route];
    const plugin = defineServerPlugin({
      packageName: '@nocobase/app-plugin-example',
      routes,
    });

    routes.length = 0;

    expect(plugin.routes).toEqual([route]);
    expect(Object.isFrozen(plugin.routes)).toBe(true);
  });

  it('ignores configured contribution paths that do not exist', () => {
    const plugin = defineServerPlugin({
      packageName: '@nocobase/app-plugin-service-provider-example',
      database: {
        migrations: './missing/migrations',
        seeds: './missing/seeds',
      },
      queue: {
        jobs: ['./missing/jobs'],
      },
    });

    const resolved = resolveAppServerPlugins(
      path.resolve(process.cwd(), '../../templates/app-template-default'),
      defineServerPlugins([plugin]),
    ).plugins[0]?.metadata;

    expect(resolved?.migrationsDirectory).toBeUndefined();
    expect(resolved?.seedsDirectory).toBeUndefined();
    expect(resolved?.jobLocations).toEqual([]);
  });

  it('still rejects unsafe optional contribution paths', () => {
    const plugin = defineServerPlugin({
      packageName: '@nocobase/app-plugin-service-provider-example',
      database: {
        migrations: '../outside',
      },
    });

    expect(() =>
      resolveAppServerPlugins(
        path.resolve(process.cwd(), '../../templates/app-template-default'),
        defineServerPlugins([plugin]),
      ),
    ).toThrow(
      'Server plugin path "../outside" must be a safe package-relative path beginning with "./".',
    );
  });
});

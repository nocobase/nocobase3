// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  defineServerPlugin,
  inspectResolvedAppServerPlugins,
  type ResolvedAppServerPlugins,
} from '../src/plugins/index.js';
import { defineApiRoutes, defineRootRoutes } from '../src/router/index.js';
import type { ApplicationConfig } from '../src/application/index.js';
import { Hono } from 'hono';

let providerConstructorCalls = 0;

class FirstProvider {
  public constructor(_app: unknown) {
    providerConstructorCalls += 1;
  }
  public readonly name: string = 'first';
  public register(): void {}
  public async boot(): Promise<void> {}
  public async start(): Promise<void> {}
  public async ready(): Promise<void> {}
  public async shutdown(): Promise<void> {}
}

describe('Server plugin inspection', () => {
  it('snapshots composition without constructing Providers or Route routers', () => {
    providerConstructorCalls = 0;
    let routeFactoryCalls = 0;
    let localeLoaderCalls = 0;
    const plugin = defineServerPlugin({
      packageName: '@nocobase/app-plugin-example',
      providers: [FirstProvider],
      routes: [
        defineApiRoutes(() => {
          routeFactoryCalls += 1;
          return new Hono();
        }),
        defineRootRoutes(() => {
          routeFactoryCalls += 1;
          return new Hono();
        }),
      ],
      database: {
        migrations: './database/migrations',
        seeds: './database/seeds',
      },
      queue: { jobs: ['./server/jobs'] },
      locales: async () => {
        localeLoaderCalls += 1;
        return { default: {} };
      },
    });
    const resolved: ResolvedAppServerPlugins<ApplicationConfig> = {
      appPackageName: '@nocobase/app-example',
      plugins: [
        {
          definition: plugin,
          metadata: {
            packageName: plugin.packageName,
            version: '1.2.3',
            rootDir: '/plugins/example',
            migrationsDirectory: '/plugins/example/database/migrations',
            seedsDirectory: '/plugins/example/database/seeds',
            jobLocations: ['/plugins/example/server/jobs/**/*.{ts,js,mts,mjs}'],
          },
        },
      ],
    };

    const inspection = inspectResolvedAppServerPlugins(resolved);

    expect(providerConstructorCalls).toBe(0);
    expect(routeFactoryCalls).toBe(0);
    expect(localeLoaderCalls).toBe(0);
    expect(inspection.plugins).toEqual([
      expect.objectContaining({
        order: 1,
        packageName: '@nocobase/app-plugin-example',
        contributions: {
          providers: 1,
          routes: 2,
          locales: true,
          migrations: true,
          seeds: true,
          jobLocations: 1,
        },
      }),
    ]);
    expect(inspection.providers).toEqual([
      expect.objectContaining({
        order: 1,
        constructorName: 'FirstProvider',
      }),
    ]);
    expect(inspection.routes).toEqual([
      expect.objectContaining({ scope: 'api', order: 1 }),
      expect.objectContaining({ scope: 'root', order: 2 }),
    ]);
    expect(inspection.locales).toEqual([
      {
        order: 1,
        pluginOrder: 1,
        packageName: '@nocobase/app-plugin-example',
      },
    ]);
    expect(inspection.issues).toEqual([]);
    expect(inspection.plugins[0]).not.toHaveProperty('rootDir');
  });

  it('keeps a locales-only plugin visible without loading its resources', () => {
    let localeLoaderCalls = 0;
    const plugin = defineServerPlugin({
      packageName: '@nocobase/app-plugin-locales-only',
      locales: async () => {
        localeLoaderCalls += 1;
        return { default: {} };
      },
    });

    const inspection = inspectResolvedAppServerPlugins({
      appPackageName: '@nocobase/app-example',
      plugins: [
        {
          definition: plugin,
          metadata: {
            packageName: plugin.packageName,
            version: '1.0.0',
            rootDir: '/plugins/locales-only',
            jobLocations: [],
          },
        },
      ],
    });

    expect(localeLoaderCalls).toBe(0);
    expect(inspection.plugins[0]?.contributions).toEqual({
      providers: 0,
      routes: 0,
      locales: true,
      migrations: false,
      seeds: false,
      jobLocations: 0,
    });
    expect(inspection.locales).toHaveLength(1);
  });

  it('reports configured contribution locations that did not resolve', () => {
    const plugin = defineServerPlugin({
      packageName: '@nocobase/app-plugin-missing',
      database: {
        migrations: './database/migrations',
        seeds: './database/seeds',
      },
      queue: { jobs: ['./server/jobs', './server/more-jobs'] },
    });

    const inspection = inspectResolvedAppServerPlugins({
      appPackageName: '@nocobase/app-example',
      plugins: [
        {
          definition: plugin,
          metadata: {
            packageName: plugin.packageName,
            version: '1.0.0',
            rootDir: '/plugins/missing',
            jobLocations: ['/plugins/missing/server/jobs/**/*.{ts,js,mts,mjs}'],
          },
        },
      ],
    });

    expect(inspection.issues.map(({ code }) => code)).toEqual([
      'SERVER_MIGRATIONS_DIRECTORY_MISSING',
      'SERVER_SEEDS_DIRECTORY_MISSING',
      'SERVER_JOB_LOCATION_MISSING',
    ]);
  });
});

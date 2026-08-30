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

class FirstProvider {
  public constructor(_app: unknown) {}
  public readonly name: string = 'first';
  public register(): void {}
  public async boot(): Promise<void> {}
  public async start(): Promise<void> {}
  public async ready(): Promise<void> {}
  public async shutdown(): Promise<void> {}
}

describe('Server plugin inspection', () => {
  it('snapshots composition without constructing Providers or Route routers', () => {
    let routeFactoryCalls = 0;
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

    expect(routeFactoryCalls).toBe(0);
    expect(inspection.plugins).toEqual([
      expect.objectContaining({
        order: 1,
        packageName: '@nocobase/app-plugin-example',
        contributions: {
          providers: 1,
          routes: 2,
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
    expect(inspection.routes.api).toEqual([
      expect.objectContaining({ scope: 'api', order: 1 }),
    ]);
    expect(inspection.routes.root).toEqual([
      expect.objectContaining({ scope: 'root', order: 2 }),
    ]);
    expect(inspection.issues).toEqual([]);
    expect(inspection.limitations.map(({ code }) => code)).toEqual([
      'SERVER_PROVIDER_TOKEN_METADATA_UNAVAILABLE',
      'SERVER_ROUTE_METADATA_UNAVAILABLE',
      'SERVER_JOB_METADATA_UNAVAILABLE',
    ]);
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

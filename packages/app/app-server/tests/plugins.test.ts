// @vitest-environment node

import path from 'node:path';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  defineServerPlugin,
  defineServerPlugins,
  resolveAppServerPlugins,
} from '../src/plugins/index.js';
import { defineApiRoutes, defineRootRoutes } from '../src/router/index.js';
import { Hono } from 'hono';

describe('server plugin definitions', () => {
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
      schedules: undefined,
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
      schedules: { definitions: './missing/schedules' },
    });

    const resolved = resolveAppServerPlugins(
      path.resolve(process.cwd(), '../../templates/app-template-default'),
      defineServerPlugins([plugin]),
    ).plugins[0]?.metadata;

    expect(resolved?.migrationsDirectory).toBeUndefined();
    expect(resolved?.seedsDirectory).toBeUndefined();
    expect(resolved?.jobLocations).toEqual([]);
    expect(resolved?.scheduleDefinitionsLocation).toBeUndefined();
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

  it('resolves Schedule definitions from a published dist-only package', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nocobase-schedules-dist-'));
    const packageRoot = path.join(
      root,
      'node_modules/@nocobase/app-plugin-schedules-fixture',
    );
    try {
      mkdirSync(path.join(packageRoot, 'dist/server/schedules'), {
        recursive: true,
      });
      writeFileSync(
        path.join(packageRoot, 'package.json'),
        JSON.stringify({
          name: '@nocobase/app-plugin-schedules-fixture',
          version: '1.0.0',
          exports: { './package.json': './package.json' },
        }),
      );
      writeFileSync(
        path.join(packageRoot, 'dist/server/schedules/index.js'),
        'export default [];\n',
      );
      const plugin = defineServerPlugin({
        packageName: '@nocobase/app-plugin-schedules-fixture',
        schedules: { definitions: './server/schedules' },
      });

      const resolved = resolveAppServerPlugins(
        root,
        defineServerPlugins([plugin]),
      ).plugins[0]?.metadata;

      expect(resolved?.scheduleDefinitionsLocation).toBe(
        path.join(packageRoot, 'dist/server/schedules/index.js'),
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

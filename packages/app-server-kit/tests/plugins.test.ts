// @vitest-environment node

import path from 'node:path';

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
      path.resolve(process.cwd(), '../app-template-default'),
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
        path.resolve(process.cwd(), '../app-template-default'),
        defineServerPlugins([plugin]),
      ),
    ).toThrow(
      'Server plugin path "../outside" must be a safe package-relative path beginning with "./".',
    );
  });
});

// @vitest-environment node

import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import {
  defineServerPlugin,
  defineServerPlugins,
  resolveAppServerPlugins,
} from '../src/plugins/index.js';
import { defineApiRoutes, defineRootRoutes } from '../src/router/index.js';
import { Hono } from 'hono';

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('server plugin definitions', () => {
  it('normalizes optional contributions and freezes the result', () => {
    const plugin = defineServerPlugin({
      packageName: '@nocobase/app-plugin-example',
    });

    expect(plugin).toEqual({
      packageName: '@nocobase/app-plugin-example',
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

  it('rejects retired queue job contributions rather than silently ignoring them', () => {
    expect(() =>
      defineServerPlugin({
        packageName: '@nocobase/app-plugin-example',
        queue: { jobs: ['./jobs'] },
      }),
    ).toThrow('queue.jobs is retired');
  });

  it('rejects a direct legacy declaration before resolving package files', () => {
    const plugin = {
      packageName: '@nocobase/uninstalled',
      serviceProviders: [],
      routes: [],
      queue: { jobs: ['./jobs'] },
    };
    expect(() => defineServerPlugins([plugin])).toThrow(
      'queue.jobs is retired',
    );
    expect(() =>
      resolveAppServerPlugins('/unused', { plugins: [plugin] }),
    ).toThrow('queue.jobs is retired');
  });

  // Resolved from `app-template-examples`, which is where the example plugins are installed. They used to live in
  // `app-template-default` and were moved out; a test naming the wrong template fails with "could not be resolved",
  // which reads like a defect in resolution rather than a stale path.
  it('ignores configured contribution paths that do not exist', () => {
    const plugin = defineServerPlugin({
      packageName: '@nocobase/app-plugin-service-provider-example',
      database: {
        migrations: './missing/migrations',
        seeds: './missing/seeds',
      },
    });

    const resolved = resolveAppServerPlugins(
      path.resolve(process.cwd(), '../../templates/app-template-examples'),
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
        path.resolve(process.cwd(), '../../templates/app-template-examples'),
        defineServerPlugins([plugin]),
      ),
    ).toThrow(
      'Server plugin path "../outside" must be a safe package-relative path beginning with "./".',
    );
  });

  it('keeps source packages first by default when a built tree is present', () => {
    const rootDir = mkdtempSync(
      path.join(tmpdir(), 'nocobase-plugin-resolution-'),
    );
    tempDirs.push(rootDir);
    const packageName = '@example/runtime-plugin';

    writeFileSync(
      path.join(rootDir, 'package.json'),
      JSON.stringify({ name: '@example/application' }),
    );
    writePackage(rootDir, packageName, 'source');
    writePackage(path.join(rootDir, 'dist'), packageName, 'compiled');

    const resolved = resolveAppServerPlugins(
      rootDir,
      defineServerPlugins([
        defineServerPlugin({
          packageName,
        }),
      ]),
    ).plugins[0]?.metadata;

    expect(resolved?.version).toBe('source');
    expect(resolved?.rootDir).toBe(
      realpathSync(path.join(rootDir, 'node_modules/@example/runtime-plugin')),
    );
  });

  it('prefers compiled packages when the runtime opts into the built tree', () => {
    const rootDir = mkdtempSync(
      path.join(tmpdir(), 'nocobase-plugin-resolution-'),
    );
    tempDirs.push(rootDir);
    const packageName = '@example/runtime-plugin';

    writeFileSync(
      path.join(rootDir, 'package.json'),
      JSON.stringify({ name: '@example/application' }),
    );
    writePackage(rootDir, packageName, 'source');
    writePackage(path.join(rootDir, 'dist'), packageName, 'compiled');

    const resolved = resolveAppServerPlugins(
      rootDir,
      defineServerPlugins([
        defineServerPlugin({
          packageName,
        }),
      ]),
      { preferBuiltPackages: true },
    ).plugins[0]?.metadata;

    expect(resolved?.version).toBe('compiled');
    expect(resolved?.rootDir).toBe(
      realpathSync(
        path.join(rootDir, 'dist/node_modules/@example/runtime-plugin'),
      ),
    );
  });
});

function writePackage(rootDir: string, packageName: string, version: string) {
  const packageDir = path.join(
    rootDir,
    'node_modules',
    ...packageName.split('/'),
  );
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      name: packageName,
      version,
      exports: {
        './package.json': './package.json',
      },
    }),
  );
}

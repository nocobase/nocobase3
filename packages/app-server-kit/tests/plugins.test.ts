// @vitest-environment node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  defineServerPlugin,
  defineServerPlugins,
  resolveAppServerPlugins,
} from '../src/plugins/index.js';
import { defineApiRoutes, defineRootRoutes } from '../src/router/index.js';

describe('server plugin definitions', () => {
  it('normalizes optional contributions and freezes the result', () => {
    const plugin = defineServerPlugin({
      packageName: '@nocobase/app-plugin-example',
    });

    expect(plugin).toEqual({
      packageName: '@nocobase/app-plugin-example',
      providers: [],
      apiRoutes: [],
      rootRoutes: [],
      database: undefined,
      queue: undefined,
    });
    expect(Object.isFrozen(plugin)).toBe(true);
    expect(Object.isFrozen(plugin.providers)).toBe(true);
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
    const apiRoutes = defineApiRoutes({
      name: 'example-api',
      register(): void {},
    });
    const rootRoutes = defineRootRoutes({
      name: 'example-root',
      register(): void {},
    });

    expect(apiRoutes.scope).toBe('api');
    expect(rootRoutes.scope).toBe('root');
    expect(Object.isFrozen(apiRoutes)).toBe(true);
    expect(Object.isFrozen(rootRoutes)).toBe(true);
  });

  it('reads the application package from a packaged dist root', () => {
    const rootDir = mkdtempSync(
      path.join(tmpdir(), 'nocobase-app-server-kit-plugins-'),
    );

    try {
      const distDir = path.join(rootDir, 'dist');
      mkdirSync(distDir, { recursive: true });
      writeFileSync(
        path.join(distDir, 'package.json'),
        JSON.stringify({ name: '@example/packaged-app' }),
      );

      const resolved = resolveAppServerPlugins(
        rootDir,
        defineServerPlugins([]),
      );

      expect(resolved.appPackageName).toBe('@example/packaged-app');
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

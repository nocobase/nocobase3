// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  defineServerPlugin,
  defineServerPlugins,
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
});

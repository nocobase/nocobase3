import type {
  AppClientPluginBootstrap,
  AppClientPluginLoader,
  AppClientRouteComponentModule,
} from '@nocobase/app-client/plugins';
import type { ComponentType } from 'react';
import type { AuthProvider } from '@refinedev/core';
import { describe, expect, it, vi } from 'vitest';

import { createAppRuntime } from '../../client/runtime.ts';

const authProvider: AuthProvider = {
  check: vi.fn(),
  getIdentity: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  onError: vi.fn(),
};

describe('app client runtime', () => {
  it('loads modules in parallel and bootstraps them in registration order', async () => {
    const calls: string[] = [];
    let resolveFirst:
      ((module: { default: AppClientPluginBootstrap }) => void) | undefined;
    const firstModule = new Promise<{ default: AppClientPluginBootstrap }>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    const plugins: AppClientPluginLoader[] = [
      {
        packageName: '@nocobase/app-plugin-first',
        load: async () => {
          calls.push('load:first');
          return firstModule;
        },
      },
      {
        packageName: '@nocobase/app-plugin-authentication',
        load: async () => {
          calls.push('load:authentication');
          resolveFirst?.({
            default: () => {
              calls.push('bootstrap:first');
            },
          });
          return {
            default: ({ refine }) => {
              calls.push('bootstrap:authentication');
              refine.setAuthProvider(authProvider);
            },
          };
        },
      },
    ];

    const runtime = await createAppRuntime({ plugins });

    expect(runtime.authProvider).toBe(authProvider);
    expect(runtime.routes).toEqual([]);
    expect(calls).toEqual([
      'load:first',
      'load:authentication',
      'bootstrap:first',
      'bootstrap:authentication',
    ]);
  });

  it('rejects duplicate auth provider registrations', async () => {
    const plugins = [
      createAuthPlugin('@nocobase/app-plugin-authentication'),
      createAuthPlugin('@nocobase/app-plugin-another-authentication'),
    ];

    await expect(createAppRuntime({ plugins })).rejects.toThrow(
      'Failed to bootstrap client plugin "@nocobase/app-plugin-another-authentication".',
    );
  });

  it('requires an authentication plugin', async () => {
    await expect(createAppRuntime({ plugins: [] })).rejects.toThrow(
      'requires an enabled client plugin that registers an auth provider',
    );
  });

  it('collects plugin routes in bootstrap order', async () => {
    const firstPage: ComponentType = () => null;
    const secondPage: ComponentType = () => null;
    const plugins: AppClientPluginLoader[] = [
      createRoutePlugin('@nocobase/app-plugin-first', 'list', '/first', {
        default: firstPage,
      }),
      createRoutePlugin('@nocobase/app-plugin-second', 'list', '/second', {
        default: secondPage,
      }),
      createAuthPlugin('@nocobase/app-plugin-authentication'),
    ];

    const runtime = await createAppRuntime({ plugins });

    expect(runtime.routes).toMatchObject([
      {
        id: '@nocobase/app-plugin-first:list',
        name: 'list',
        packageName: '@nocobase/app-plugin-first',
        path: '/first',
      },
      {
        id: '@nocobase/app-plugin-second:list',
        name: 'list',
        packageName: '@nocobase/app-plugin-second',
        path: '/second',
      },
    ]);
    await expect(runtime.routes[0].componentLoader()).resolves.toEqual({
      default: firstPage,
    });
    expect(Object.isFrozen(runtime.routes)).toBe(true);
  });

  it('rejects duplicate route names from the same plugin', async () => {
    const plugins: AppClientPluginLoader[] = [
      {
        packageName: '@nocobase/app-plugin-routes',
        load: async () => ({
          default: ({ routes }) => {
            routes.add({
              name: 'list',
              path: '/first',
              componentLoader: async () => ({ default: () => null }),
            });
            routes.add({
              name: 'list',
              path: '/second',
              componentLoader: async () => ({ default: () => null }),
            });
          },
        }),
      },
      createAuthPlugin('@nocobase/app-plugin-authentication'),
    ];

    await expect(createAppRuntime({ plugins })).rejects.toThrow(
      'Failed to bootstrap client plugin "@nocobase/app-plugin-routes".',
    );
  });

  it('rejects semantically conflicting route paths', async () => {
    const plugins: AppClientPluginLoader[] = [
      createRoutePlugin('@nocobase/app-plugin-first', 'detail', '/records/:id'),
      createRoutePlugin(
        '@nocobase/app-plugin-second',
        'detail',
        '/records/:recordId',
      ),
      createAuthPlugin('@nocobase/app-plugin-authentication'),
    ];

    await expect(createAppRuntime({ plugins })).rejects.toThrow(
      'Failed to bootstrap client plugin "@nocobase/app-plugin-second".',
    );
  });

  it('rejects route registration after bootstrap completes', async () => {
    let registerLater: (() => void) | undefined;
    const plugins: AppClientPluginLoader[] = [
      {
        packageName: '@nocobase/app-plugin-routes',
        load: async () => ({
          default: ({ routes }) => {
            registerLater = () => {
              routes.add({
                name: 'late',
                path: '/late',
                componentLoader: async () => ({ default: () => null }),
              });
            };
          },
        }),
      },
      createAuthPlugin('@nocobase/app-plugin-authentication'),
    ];

    await createAppRuntime({ plugins });

    expect(registerLater).toBeDefined();
    expect(registerLater).toThrow('can only be registered during bootstrap');
  });

  it('wraps route component loading failures with the route id', async () => {
    const plugins: AppClientPluginLoader[] = [
      createRoutePlugin('@nocobase/app-plugin-routes', 'broken', '/broken'),
      createAuthPlugin('@nocobase/app-plugin-authentication'),
    ];
    const runtime = await createAppRuntime({ plugins });

    await expect(runtime.routes[0].componentLoader()).rejects.toThrow(
      'Failed to load client route "@nocobase/app-plugin-routes:broken".',
    );
  });
});

function createAuthPlugin(packageName: string): AppClientPluginLoader {
  return {
    packageName,
    load: async () => ({
      default: ({ refine }) => {
        refine.setAuthProvider(authProvider);
      },
    }),
  };
}

function createRoutePlugin(
  packageName: string,
  name: string,
  path: string,
  module?: AppClientRouteComponentModule,
): AppClientPluginLoader {
  return {
    packageName,
    load: async () => ({
      default: ({ routes }) => {
        routes.add({
          name,
          path,
          componentLoader: module
            ? async () => module
            : async () => {
                throw new Error('Unable to load route module.');
              },
        });
      },
    }),
  };
}

import type {
  AppClientPluginBootstrap,
  AppClientPluginLoader,
  AppClientProviderDefinition,
  AppClientRouteComponentModule,
} from '@nocobase/app-client/plugins';
import dataProviderBootstrap from '@nocobase/app-plugin-data-provider/client/bootstrap';
import type { AuthProvider } from '@refinedev/core';
import type { ComponentType, PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../client/app.ts';
import {
  createAppRuntime as createRawAppRuntime,
  type CreateAppRuntimeOptions,
} from '../../client/runtime.ts';

const authProvider: AuthProvider = {
  check: vi.fn(),
  getIdentity: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  onError: vi.fn(),
};

describe('app client runtime', () => {
  it('loads contribution modules in parallel and bootstraps in plugin order', async () => {
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
        loadBootstrap: async () => {
          calls.push('load:first');
          return firstModule;
        },
        loadRoutes: async () => {
          calls.push('load:routes');
          return { default: [] };
        },
      },
      {
        packageName: '@nocobase/app-plugin-authentication',
        loadBootstrap: async () => {
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

    expect(runtime.refine.authProvider).toBe(authProvider);
    expect(runtime.refine.dataProvider).toBeDefined();
    expect(createApp(runtime).refine).toBe(runtime.refine);
    expect(runtime.routes).toEqual([]);
    expect(runtime.providers).toEqual([]);
    expect(calls.slice(0, 3)).toEqual([
      'load:first',
      'load:routes',
      'load:authentication',
    ]);
    expect(calls.slice(3)).toEqual([
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

  it('requires a data provider plugin', async () => {
    await expect(
      createRawAppRuntime({
        plugins: [createAuthPlugin('@nocobase/app-plugin-authentication')],
      }),
    ).rejects.toThrow(
      'requires an enabled client plugin that registers a data provider',
    );
  });

  it('collects declarative plugin routes in plugin order', async () => {
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

  it('rejects invalid routes module exports', async () => {
    const plugin: AppClientPluginLoader = {
      packageName: '@nocobase/app-plugin-routes',
      loadRoutes: async () => ({ default: undefined }) as never,
    };

    await expect(
      createAppRuntime({
        plugins: [
          plugin,
          createAuthPlugin('@nocobase/app-plugin-authentication'),
        ],
      }),
    ).rejects.toThrow(
      'Failed to load client routes for plugin "@nocobase/app-plugin-routes".',
    );
  });

  it('rejects duplicate route names from the same plugin', async () => {
    const plugin: AppClientPluginLoader = {
      packageName: '@nocobase/app-plugin-routes',
      loadRoutes: async () => ({
        default: [
          createRoute('list', '/first'),
          createRoute('list', '/second'),
        ],
      }),
    };

    await expect(
      createAppRuntime({
        plugins: [
          plugin,
          createAuthPlugin('@nocobase/app-plugin-authentication'),
        ],
      }),
    ).rejects.toThrow('defined duplicate client route name "list"');
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
      'conflicts with route "@nocobase/app-plugin-first:detail"',
    );
  });

  it('wraps route component loading failures with the route id', async () => {
    const runtime = await createAppRuntime({
      plugins: [
        createRoutePlugin('@nocobase/app-plugin-routes', 'broken', '/broken'),
        createAuthPlugin('@nocobase/app-plugin-authentication'),
      ],
    });

    await expect(runtime.routes[0].componentLoader()).rejects.toThrow(
      'Failed to load client route "@nocobase/app-plugin-routes:broken".',
    );
  });

  it('sorts providers outer to inner using explicit constraints', async () => {
    const OuterProvider = createProvider();
    const InnerProvider = createProvider();
    const plugins: AppClientPluginLoader[] = [
      createProviderPlugin('@nocobase/app-plugin-feature', [
        {
          name: 'inner',
          component: InnerProvider,
          after: ['@nocobase/app-plugin-foundation:outer'],
        },
      ]),
      createProviderPlugin('@nocobase/app-plugin-foundation', [
        { name: 'outer', component: OuterProvider },
      ]),
      createAuthPlugin('@nocobase/app-plugin-authentication'),
    ];

    const runtime = await createAppRuntime({ plugins });

    expect(runtime.providers.map((provider) => provider.id)).toEqual([
      '@nocobase/app-plugin-foundation:outer',
      '@nocobase/app-plugin-feature:inner',
    ]);
    expect(createApp(runtime).providers).toEqual([
      OuterProvider,
      InnerProvider,
    ]);
    expect(Object.isFrozen(runtime.providers)).toBe(true);
  });

  it('rejects missing provider references and cycles', async () => {
    const Provider = createProvider();
    const auth = createAuthPlugin('@nocobase/app-plugin-authentication');

    await expect(
      createAppRuntime({
        plugins: [
          createProviderPlugin('@nocobase/app-plugin-feature', [
            {
              name: 'feature',
              component: Provider,
              after: ['@nocobase/app-plugin-missing:provider'],
            },
          ]),
          auth,
        ],
      }),
    ).rejects.toThrow('references missing provider');

    await expect(
      createAppRuntime({
        plugins: [
          createProviderPlugin('@nocobase/app-plugin-cycle', [
            {
              name: 'first',
              component: Provider,
              after: ['@nocobase/app-plugin-cycle:second'],
            },
            {
              name: 'second',
              component: Provider,
              after: ['@nocobase/app-plugin-cycle:first'],
            },
          ]),
          auth,
        ],
      }),
    ).rejects.toThrow('Circular client provider order detected');
  });
});

function createAppRuntime(
  options: CreateAppRuntimeOptions,
): ReturnType<typeof createRawAppRuntime> {
  return createRawAppRuntime({
    plugins: [...options.plugins, createDataProviderPlugin()],
  });
}

function createDataProviderPlugin(): AppClientPluginLoader {
  return {
    packageName: '@nocobase/app-plugin-data-provider',
    loadBootstrap: async () => ({ default: dataProviderBootstrap }),
  };
}

function createAuthPlugin(packageName: string): AppClientPluginLoader {
  return {
    packageName,
    loadBootstrap: async () => ({
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
    loadRoutes: async () => ({
      default: [createRoute(name, path, module)],
    }),
  };
}

function createRoute(
  name: string,
  path: string,
  module?: AppClientRouteComponentModule,
) {
  return {
    name,
    path,
    componentLoader: module
      ? async () => module
      : async () => {
          throw new Error('Unable to load route module.');
        },
  };
}

function createProviderPlugin(
  packageName: string,
  providers: readonly AppClientProviderDefinition[],
): AppClientPluginLoader {
  return {
    packageName,
    loadProviders: async () => ({ default: providers }),
  };
}

function createProvider(): ComponentType<PropsWithChildren> {
  return ({ children }) => children;
}

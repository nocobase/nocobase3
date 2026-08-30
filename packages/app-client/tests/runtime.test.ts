import type { AuthProvider, DataProvider } from '@refinedev/core';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { defineAppRoutes } from '../src/plugins.js';
import {
  defineAppRuntime,
  resolveAppRuntime,
  type AppRuntimeDefinition,
} from '../src/runtime/index.js';

const authProvider: AuthProvider = {
  check: vi.fn(),
  getIdentity: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  onError: vi.fn(),
};

const dataProvider: DataProvider = {
  create: vi.fn(),
  deleteOne: vi.fn(),
  getApiUrl: vi.fn(),
  getList: vi.fn(),
  getMany: vi.fn(),
  getOne: vi.fn(),
  update: vi.fn(),
};

describe('app runtime', () => {
  it('defines an immutable runtime without loading contributions', () => {
    const bootstrap = vi.fn();
    const plugin = { packageName: '@example/plugin', bootstrap };
    const definition = defineAppRuntime({
      packageName: '@example/app',
      plugins: [plugin],
      routeComponentOverrides: [],
      sourceExtensions: [],
    });

    expect(bootstrap).not.toHaveBeenCalled();
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.plugins)).toBe(true);
    expect(Object.isFrozen(definition.routeComponentOverrides)).toBe(true);
    expect(Object.isFrozen(definition.sourceExtensions)).toBe(true);
  });

  it('loads in parallel, bootstraps in order, and resolves contributions', async () => {
    const calls: string[] = [];
    let releaseApplication:
      ((module: { default: () => void }) => void) | undefined;
    const applicationBootstrap = new Promise<{ default: () => void }>(
      (resolve) => {
        releaseApplication = resolve;
      },
    );
    const Page: ComponentType = () => null;
    const definition = defineAppRuntime({
      packageName: '@example/app',
      basename: '/portal',
      bootstrap: async () => {
        calls.push('load:application');
        return applicationBootstrap;
      },
      providers: async () => ({
        default: [{ name: 'root', component: () => null, layer: 'root' }],
      }),
      routes: async () => ({
        default: defineAppRoutes([
          {
            name: 'home',
            path: '/',
            componentLoader: async () => ({ default: Page }),
          },
        ]),
      }),
      plugins: [
        {
          packageName: '@example/plugin',
          bootstrap: async () => {
            calls.push('load:plugin');
            releaseApplication?.({
              default: () => calls.push('bootstrap:application'),
            });
            return {
              default: ({ refine }) => {
                calls.push('bootstrap:plugin');
                refine.setAuthProvider(authProvider);
                refine.setDataProvider(dataProvider);
              },
            };
          },
        },
      ],
    });

    const runtime = await resolveAppRuntime(definition);

    expect(calls).toEqual([
      'load:application',
      'load:plugin',
      'bootstrap:application',
      'bootstrap:plugin',
    ]);
    expect(runtime.basename).toBe('/portal');
    expect(runtime.refine.authProvider).toBe(authProvider);
    expect(runtime.refine.dataProvider).toBe(dataProvider);
    expect(runtime.routes[0]).toMatchObject({
      id: '@example/app:home',
      path: '/',
      source: 'application',
    });
    expect(runtime.providers[0]).toMatchObject({
      id: '@example/app:root',
      source: 'application',
    });
    expect(Object.isFrozen(runtime)).toBe(true);
  });

  it('runs app validation after the runtime is fully resolved', async () => {
    let validatedRuntime: unknown;
    const definition: AppRuntimeDefinition = defineAppRuntime({
      packageName: '@example/app',
      plugins: [],
      validate(runtime) {
        validatedRuntime = runtime;
        throw new Error('App requirement failed.');
      },
    });

    await expect(resolveAppRuntime(definition)).rejects.toThrow(
      'App requirement failed.',
    );
    expect(validatedRuntime).toMatchObject({ basename: '/', routes: [] });
  });

  it('adds source context to contribution loading and bootstrap errors', async () => {
    await expect(
      resolveAppRuntime(
        defineAppRuntime({
          packageName: '@example/app',
          plugins: [
            {
              packageName: '@example/broken',
              bootstrap: async () => ({ default: undefined }) as never,
            },
          ],
        }),
      ),
    ).rejects.toThrow(
      'Failed to load client bootstrap for plugin "@example/broken".',
    );
  });
});

import { ServiceProvider } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import { ClientApplication } from '@nocobase/app-client';
import {
  createAppClientConfig,
  defineAppClientRenderConfig,
  defineClientPlugins,
} from '@nocobase/app-client';
import {
  defineAppRuntime,
  resolveAppRuntime,
  type AppRuntimeDefinition,
} from '@nocobase/app-client/runtime';
import type { ClientApplication as ClientApplicationType } from '@nocobase/app-client';

import { createApp } from '../../client/app.ts';
import appRuntime from '../../client/runtime.ts';

describe('app client runtime', () => {
  it('resolves static contributions without running ServiceProvider lifecycle', async () => {
    const calls: string[] = [];
    class Provider extends ServiceProvider<ClientApplicationType> {
      public readonly name: string = '@example/provider';

      public override boot(): Promise<void> {
        calls.push('boot');
        return Promise.resolve();
      }
    }
    const runtime = await resolveAppRuntime(
      defineAppRuntime({
        packageName: '@example/app',
        config: createAppClientConfig,
        serviceProviders: [Provider],
        reactProviders: [],
        routes: [],
        plugins: defineClientPlugins([]),
      }),
    );

    expect(runtime.serviceProviders[0]).toMatchObject({
      Provider,
      context: { packageName: '@example/app', source: 'application' },
    });
    expect(runtime.reactProviders).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('runs provider lifecycle and exposes Refine config through ClientApplication', async () => {
    const authProvider = {
      check: vi.fn(),
      getIdentity: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      onError: vi.fn(),
    };
    class Provider extends ServiceProvider<ClientApplicationType> {
      public readonly name: string = '@example/provider';

      public override boot(): Promise<void> {
        this.app.refine.setAuthProvider(authProvider);
        return Promise.resolve();
      }
    }
    const runtime = await resolveAppRuntime(
      defineAppRuntime({
        packageName: '@example/app',
        config: createAppClientConfig,
        serviceProviders: [Provider],
        plugins: defineClientPlugins([]),
      }),
    );
    const app = new ClientApplication({
      runtime,
      createRenderConfig: () => defineAppClientRenderConfig({ routes: null }),
    });

    await app.start();
    expect(app.refineConfig.authProvider).toBe(authProvider);
    await app.shutdown();
  });

  it('uses the default template Application and static plugin declarations', async () => {
    const runtime = await resolveAppRuntime(appRuntime, {
      rawConfig: { app: { title: 'Configured application' } },
    });
    const app = createApp(runtime);

    expect(app).toBeInstanceOf(ClientApplication);
    await expect(app.start()).resolves.toBeUndefined();
    expect(app.config.get('app.title')).toBe('Configured application');
    expect(app.refineConfig.options?.title).toEqual({
      text: 'Configured application',
    });
    expect(app.refineConfig.authProvider).toBeDefined();
    expect(app.refineConfig.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'repository-example-customers',
          list: '/repository-example/crm',
          meta: expect.objectContaining({
            i18nNs: '@nocobase/app-plugin-repository-example',
          }),
        }),
        expect.objectContaining({
          name: 'repository-example-order-list',
          list: '/repository-example/orders',
          meta: expect.objectContaining({
            i18nNs: '@nocobase/app-plugin-repository-example',
          }),
        }),
      ]),
    );
    const resources = app.refineConfig.resources ?? [];
    expect(resources).toContainEqual(
      expect.objectContaining({
        name: 'repository-example-relation-mutations',
        list: '/repository-example/relation-mutations',
        meta: expect.objectContaining({ parent: 'repository-example-api' }),
      }),
    );
    expect(resources).toContainEqual(
      expect.objectContaining({
        name: 'repository-example-atomic',
        list: '/repository-example/atomic',
        meta: expect.objectContaining({ parent: 'repository-example-api' }),
      }),
    );
    expect(resources).toContainEqual(
      expect.objectContaining({
        name: 'repository-example-find-many',
        list: '/repository-example/find-many',
        meta: expect.objectContaining({ parent: 'repository-example-api' }),
      }),
    );
    expect(resources).toContainEqual(
      expect.objectContaining({
        name: 'repository-example-aggregate',
        list: '/repository-example/aggregate',
        meta: expect.objectContaining({ parent: 'repository-example-api' }),
      }),
    );
    for (const [group, children] of [
      [
        'repository-example-crm',
        ['repository-example-customers', 'repository-example-contacts'],
      ],
      [
        'repository-example-orders',
        [
          'repository-example-order-list',
          'repository-example-items',
          'repository-example-products',
        ],
      ],
    ] as const) {
      expect(
        resources.find((resource) => resource.name === group)?.list,
      ).toBeUndefined();
      expect(
        resources
          .filter((resource) => resource.meta?.parent === group)
          .map((resource) => resource.name),
      ).toEqual(children);
    }
    await app.shutdown();
  });

  it('requires a Client config factory in the breaking static Runtime protocol', async () => {
    const { config: _config, ...withoutConfig } = appRuntime;
    await expect(
      resolveAppRuntime(withoutConfig as AppRuntimeDefinition),
    ).rejects.toThrow();
  });
});

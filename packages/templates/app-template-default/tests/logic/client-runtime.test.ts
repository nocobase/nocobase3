import { ServiceProvider } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import { ClientApplication } from '@nocobase/app-client';
import {
  createAppClientConfig,
  defineAppClientRenderConfig,
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
        plugins: [],
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
        plugins: [],
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
      rawConfig: { app: { title: 'NocoBase' } },
    });
    const app = createApp(runtime);

    expect(app).toBeInstanceOf(ClientApplication);
    await expect(app.start()).resolves.toBeUndefined();
    expect(app.config.get('app.title')).toBe('NocoBase');
    expect(app.refineConfig.authProvider).toBeDefined();
    expect(app.refineConfig.dataProvider).toBeDefined();
    await app.shutdown();
  });

  it('requires a Client config factory in the breaking static Runtime protocol', async () => {
    const { config: _config, ...withoutConfig } = appRuntime;
    await expect(
      resolveAppRuntime(withoutConfig as AppRuntimeDefinition),
    ).rejects.toThrow();
  });
});

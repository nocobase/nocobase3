import { useGo } from '@refinedev/core';
import { ServiceProvider } from '@nocobase/service-provider';
import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  appApiClientToken,
  ClientApplication,
  type ClientApplicationRenderConfigFactory,
} from '../src/application.js';
import { AppClientRoot } from '../src/app-client.js';
import {
  createAppClientConfig,
  defineAppClientRenderConfig,
  normalizeAppClientBasename,
} from '../src/config.js';
import { defineAppRoutes, defineClientPlugins } from '../src/plugins.js';
import { defineAppRuntime, resolveAppRuntime } from '../src/runtime/index.js';

function RouterConsumer(): ReactElement {
  const go = useGo();
  return <button onClick={() => go({ to: '/configured' })}>Navigate</button>;
}

async function createTestApplication(
  createRenderConfig: ClientApplicationRenderConfigFactory,
  refine?: (app: ClientApplication) => void,
): Promise<ClientApplication> {
  class TestProvider extends ServiceProvider<ClientApplication> {
    public readonly name: string = '@example/test';

    public override boot(): Promise<void> {
      refine?.(this.app);
      return Promise.resolve();
    }
  }

  const runtime = await resolveAppRuntime(
    defineAppRuntime({
      packageName: '@example/app',
      config: createAppClientConfig,
      serviceProviders: [TestProvider],
      plugins: defineClientPlugins([]),
    }),
  );
  const app = new ClientApplication({ runtime, createRenderConfig });
  await app.start();
  return app;
}

describe('app client', () => {
  it('normalizes router basenames', () => {
    expect(normalizeAppClientBasename(undefined)).toBeUndefined();
    expect(normalizeAppClientBasename('/')).toBeUndefined();
    expect(normalizeAppClientBasename('/portal/')).toBe('/portal');
  });

  it('uses a configured Refine router provider', async () => {
    const go = vi.fn();
    const app = await createTestApplication(
      () =>
        defineAppClientRenderConfig({
          routes: <RouterConsumer />,
        }),
      (current) => current.refine.setRouterProvider({ go: () => go }),
    );

    render(<AppClientRoot app={app} />);
    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));

    expect(go).toHaveBeenCalledExactlyOnceWith({ to: '/configured' });
    await app.shutdown();
  });

  it('uses configured Refine children instead of default routes', async () => {
    const app = await createTestApplication(
      () =>
        defineAppClientRenderConfig({
          routes: 'Default application routes',
        }),
      (current) => {
        current.refine.setChildren('Configured Refine content');
        current.refine.setRouterProvider({});
      },
    );

    render(<AppClientRoot app={app} />);

    expect(screen.getByText('Configured Refine content')).toBeInTheDocument();
    expect(
      screen.queryByText('Default application routes'),
    ).not.toBeInTheDocument();
    await app.shutdown();
  });

  it('leaves React DOM root ownership to the host', async () => {
    const app = await createTestApplication(
      () => defineAppClientRenderConfig({ routes: 'Hosted application' }),
      (current) => current.refine.setRouterProvider({}),
    );

    expect(app).not.toHaveProperty('mount');
    expect(app).not.toHaveProperty('unmount');

    const view = render(<AppClientRoot app={app} />);
    expect(screen.getByText('Hosted application')).toBeInTheDocument();

    view.unmount();
    await app.shutdown();
  });

  it('closes the core realtime client during application shutdown', async () => {
    const app = await createTestApplication(() =>
      defineAppClientRenderConfig({ routes: null }),
    );
    const client = app.services.resolve(appApiClientToken);
    const close = vi.spyOn(client.realtime!, 'close');

    await app.shutdown();

    expect(close).toHaveBeenCalledOnce();
  });

  it('requires an auth provider when a route requires authentication', async () => {
    const runtime = await resolveAppRuntime(
      defineAppRuntime({
        packageName: '@example/app',
        config: createAppClientConfig,
        routes: defineAppRoutes([
          {
            name: 'home',
            path: '/',
            auth: 'required',
            componentLoader: async () => ({ default: RouterConsumer }),
          },
          {
            name: 'login',
            path: '/login',
            auth: 'guest',
            componentLoader: async () => ({ default: RouterConsumer }),
          },
        ]),
        plugins: defineClientPlugins([]),
      }),
    );
    const app = new ClientApplication({
      runtime,
      createRenderConfig: () => ({ routes: null }),
    });

    await expect(app.start()).rejects.toThrow(
      'Client Application routes requiring authentication need an auth provider.',
    );
  });

  it('requires a guest login route when authenticated routes are enabled', async () => {
    class AuthProviderService extends ServiceProvider<ClientApplication> {
      public readonly name: string = '@example/auth';

      public override boot(): Promise<void> {
        this.app.refine.setAuthProvider({
          check: vi.fn(),
          getIdentity: vi.fn(),
          login: vi.fn(),
          logout: vi.fn(),
          onError: vi.fn(),
        });
        return Promise.resolve();
      }
    }

    const runtime = await resolveAppRuntime(
      defineAppRuntime({
        packageName: '@example/app',
        config: createAppClientConfig,
        serviceProviders: [AuthProviderService],
        routes: defineAppRoutes([
          {
            name: 'home',
            path: '/',
            auth: 'required',
            componentLoader: async () => ({ default: RouterConsumer }),
          },
        ]),
        plugins: defineClientPlugins([]),
      }),
    );
    const app = new ClientApplication({
      runtime,
      createRenderConfig: () => ({ routes: null }),
    });

    await expect(app.start()).rejects.toThrow(
      'Client Application routes requiring authentication need a guest /login route.',
    );
  });

  it('requires startup before rendering and shuts providers down in reverse order', async () => {
    const calls: string[] = [];
    const createProvider = (name: string) =>
      class extends ServiceProvider<ClientApplication> {
        public readonly name: string = name;

        public override register(): void {
          calls.push(`register:${name}`);
        }

        public override boot(): Promise<void> {
          calls.push(`boot:${name}`);
          return Promise.resolve();
        }

        public override start(): Promise<void> {
          calls.push(`start:${name}`);
          return Promise.resolve();
        }

        public override ready(): Promise<void> {
          calls.push(`ready:${name}`);
          return Promise.resolve();
        }

        public override shutdown(): Promise<void> {
          calls.push(`shutdown:${name}`);
          return Promise.resolve();
        }
      };
    const runtime = await resolveAppRuntime(
      defineAppRuntime({
        packageName: '@example/app',
        config: createAppClientConfig,
        serviceProviders: [createProvider('first'), createProvider('second')],
        plugins: defineClientPlugins([]),
      }),
    );
    const app = new ClientApplication({
      runtime,
      createRenderConfig: () => ({ routes: null }),
    });

    expect(() => app.renderConfig).toThrow('must be started');
    await app.start();
    await app.shutdown();

    expect(calls).toEqual([
      'register:first',
      'register:second',
      'boot:first',
      'boot:second',
      'start:first',
      'start:second',
      'ready:first',
      'ready:second',
      'shutdown:second',
      'shutdown:first',
    ]);
  });
});

import { useGo } from '@refinedev/core';
import { ServiceProvider } from '@nocobase/service-provider';
import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ClientApplication,
  type ClientApplicationRenderConfigFactory,
} from '../src/application.js';
import { AppClientRoot } from '../src/app-client.js';
import {
  createAppClientConfig,
  defineAppClientRenderConfig,
  normalizeAppClientBasename,
} from '../src/config.js';
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
      plugins: [],
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
        plugins: [],
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

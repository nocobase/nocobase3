import {
  AppClientRoot,
  ClientApplication,
  createAppClientConfig,
} from '@nocobase/app-client';
import { defineClientPlugins } from '@nocobase/app-client/plugins';
import {
  defineAppRuntime,
  resolveAppRuntime,
} from '@nocobase/app-client/runtime';
import { render, waitFor } from '@testing-library/react';
import { ServiceProvider } from '@nocobase/service-provider';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../client/app.ts';
import reactProviders from '../../client/react-providers.ts';
import serviceProviders from '../../client/service-provider.ts';

describe('application title', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the configured title while the application is mounted', async () => {
    vi.stubGlobal('matchMedia', createMatchMedia());
    const previousTitle = 'Host title';
    document.title = previousTitle;
    const runtime = await resolveAppRuntime(
      defineAppRuntime({
        packageName: '@example/app',
        config: createAppClientConfig,
        serviceProviders: [...serviceProviders, TestRouterProvider],
        reactProviders,
        routes: [],
        plugins: defineClientPlugins([]),
      }),
      { rawConfig: { app: { title: 'Configured application' } } },
    );
    const app = createApp(runtime);
    await app.start();

    const view = render(<AppClientRoot app={app} />);

    await waitFor(() => expect(document.title).toBe('Configured application'));
    view.unmount();
    expect(document.title).toBe(previousTitle);
    await app.shutdown();
  });
});

class TestRouterProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@example/router';

  public override boot(): Promise<void> {
    this.app.refine.setRouterProvider({});
    return Promise.resolve();
  }
}

function createMatchMedia(): (query: string) => MediaQueryList {
  return (query: string): MediaQueryList =>
    ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }) as MediaQueryList;
}

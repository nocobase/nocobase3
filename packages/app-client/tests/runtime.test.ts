import {
  createElement,
  Fragment,
  type ComponentType,
  type PropsWithChildren,
  type ReactElement,
} from 'react';
import { ServiceProvider } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import { createAppClientConfig, defineAppClientConfig } from '../src/config.js';
import {
  defineAppRoutes,
  defineClientPlugin,
  defineClientReactWrappers,
} from '../src/plugins.js';
import { defineAppRuntime, resolveAppRuntime } from '../src/runtime/index.js';
import type { ClientApplication } from '../src/application.js';

function Wrapper({ children }: PropsWithChildren): ReactElement {
  return createElement(Fragment, undefined, children);
}

describe('app runtime', () => {
  it('defines immutable static declarations without activating them', () => {
    const serviceProviders = vi.fn(() => []);
    const definition = defineAppRuntime({
      packageName: '@example/app',
      config: createAppClientConfig,
      serviceProviders,
      plugins: [],
      routeComponentOverrides: [],
      sourceExtensions: [],
    });

    expect(serviceProviders).not.toHaveBeenCalled();
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.plugins)).toBe(true);
    expect(Object.isFrozen(definition.routeComponentOverrides)).toBe(true);
    expect(Object.isFrozen(definition.sourceExtensions)).toBe(true);
  });

  it('resolves config, providers, wrappers, and routes without activating providers', async () => {
    class Provider extends ServiceProvider<ClientApplication> {
      public readonly name: string = '@example/plugin/provider';
    }
    const Page: ComponentType = () => null;
    const plugin = defineClientPlugin({
      packageName: '@example/plugin',
      config: defineAppClientConfig({
        namespace: 'feature',
        defaults: { enabled: false },
      }),
      serviceProviders: [Provider],
      reactWrappers: defineClientReactWrappers([
        { name: 'feature', component: Wrapper },
      ]),
    });
    const definition = defineAppRuntime({
      packageName: '@example/app',
      basename: '/portal',
      config: createAppClientConfig,
      routes: defineAppRoutes([
        {
          name: 'home',
          path: '/',
          componentLoader: async () => ({ default: Page }),
        },
      ]),
      plugins: [plugin()],
    });

    const runtime = await resolveAppRuntime(definition, {
      rawConfig: { feature: { enabled: true } },
    });

    expect(runtime.basename).toBe('/portal');
    expect(runtime.config.get('feature.enabled')).toBe(true);
    expect(runtime.serviceProviders[0]).toMatchObject({
      Provider,
      context: {
        packageName: '@example/plugin',
        source: 'plugin',
      },
    });
    expect(runtime.reactWrappers[0]).toMatchObject({
      id: '@example/plugin:feature',
      source: 'plugin',
    });
    expect(runtime.routes[0]).toMatchObject({
      id: '@example/app:home',
      path: '/',
      source: 'application',
    });
    expect(Object.isFrozen(runtime)).toBe(true);
  });

  it('does not run application validation while resolving runtime', async () => {
    const validate = vi.fn();
    const runtime = await resolveAppRuntime(
      defineAppRuntime({
        packageName: '@example/app',
        config: createAppClientConfig,
        plugins: [],
        validate,
      }),
    );

    expect(validate).not.toHaveBeenCalled();
    expect(runtime.validate).toBe(validate);
  });
});

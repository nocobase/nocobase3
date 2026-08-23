import type { PropsWithChildren, ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import {
  defineClientProviders,
  defineClientRoutes,
  resolveAppClientContributions,
} from '../src/plugins.js';

function FirstProvider({ children }: PropsWithChildren): ReactElement {
  return <>{children}</>;
}

function SecondProvider({ children }: PropsWithChildren): ReactElement {
  return <>{children}</>;
}

describe('client plugin definitions', () => {
  it('freezes route and provider definitions', () => {
    const routes = defineClientRoutes([
      {
        name: 'index',
        path: '/example',
        componentLoader: async () => ({ default: () => null }),
      },
    ]);
    const providers = defineClientProviders([
      {
        name: 'first',
        component: FirstProvider,
        before: ['@nocobase/app-plugin-example:second'],
      },
    ]);

    expect(Object.isFrozen(routes)).toBe(true);
    expect(Object.isFrozen(routes[0])).toBe(true);
    expect(Object.isFrozen(providers)).toBe(true);
    expect(Object.isFrozen(providers[0].before)).toBe(true);
  });

  it('resolves routes and sorts providers from outer to inner', () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-feature',
        routes: defineClientRoutes([
          {
            name: 'index',
            path: '/feature/',
            componentLoader: async () => ({ default: () => null }),
          },
        ]),
        providers: defineClientProviders([
          {
            name: 'second',
            component: SecondProvider,
            after: ['@nocobase/app-plugin-foundation:first'],
          },
        ]),
      },
      {
        packageName: '@nocobase/app-plugin-foundation',
        providers: defineClientProviders([
          { name: 'first', component: FirstProvider },
        ]),
      },
    ]);

    expect(resolved.routes[0]).toMatchObject({
      auth: 'required',
      id: '@nocobase/app-plugin-feature:index',
      path: '/feature',
    });
    expect(resolved.providers.map((provider) => provider.id)).toEqual([
      '@nocobase/app-plugin-foundation:first',
      '@nocobase/app-plugin-feature:second',
    ]);
  });

  it('supports guest and optional routes while protecting reserved paths', () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-authentication',
        routes: defineClientRoutes([
          {
            name: 'login',
            path: '/login',
            auth: 'guest',
            componentLoader: async () => ({ default: () => null }),
          },
          {
            name: 'help',
            path: '/help',
            auth: 'optional',
            componentLoader: async () => ({ default: () => null }),
          },
        ]),
      },
    ]);

    expect(resolved.routes.map((route) => route.auth)).toEqual([
      'guest',
      'optional',
    ]);
    expect(() =>
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-feature',
          routes: defineClientRoutes([
            {
              name: 'login',
              path: '/login',
              componentLoader: async () => ({ default: () => null }),
            },
          ]),
        },
      ]),
    ).toThrow('unless auth is "guest"');
  });

  it('keeps registration order when providers have no constraints', () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-example',
        providers: defineClientProviders([
          { name: 'first', component: FirstProvider },
          { name: 'second', component: SecondProvider },
        ]),
      },
    ]);

    expect(resolved.providers.map((provider) => provider.name)).toEqual([
      'first',
      'second',
    ]);
  });

  it('rejects missing references and circular provider ordering', () => {
    expect(() =>
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-example',
          providers: defineClientProviders([
            {
              name: 'first',
              component: FirstProvider,
              after: ['@nocobase/app-plugin-missing:provider'],
            },
          ]),
        },
      ]),
    ).toThrow('references missing provider');

    expect(() =>
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-example',
          providers: defineClientProviders([
            {
              name: 'first',
              component: FirstProvider,
              after: ['@nocobase/app-plugin-example:second'],
            },
            {
              name: 'second',
              component: SecondProvider,
              after: ['@nocobase/app-plugin-example:first'],
            },
          ]),
        },
      ]),
    ).toThrow('Circular client provider order detected');
  });
});

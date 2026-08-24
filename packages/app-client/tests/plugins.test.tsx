import type { PropsWithChildren, ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import {
  applyClientRouteComponentOverrides,
  defineClientApplication,
  defineClientProviders,
  defineClientRouteComponentOverrides,
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
    const application = defineClientApplication({
      packageName: '@nocobase/app-template-default',
    });
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
    expect(application).toMatchObject({ source: 'application' });
    expect(Object.isFrozen(application)).toBe(true);
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
      source: 'plugin',
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

    const application = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-template-default',
        source: 'application',
        routes: defineClientRoutes([
          {
            name: 'home',
            path: '/',
            componentLoader: async () => ({ default: () => null }),
          },
        ]),
      },
    ]);
    expect(application.routes[0]).toMatchObject({
      id: '@nocobase/app-template-default:home',
      path: '/',
      source: 'application',
    });
  });

  it('overrides only a registered route component loader', async () => {
    const PluginPage = (): null => null;
    const ApplicationPage = (): null => null;
    const [route] = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-authentication',
        routes: defineClientRoutes([
          {
            name: 'login',
            path: '/login',
            auth: 'guest',
            componentLoader: async () => ({ default: PluginPage }),
          },
        ]),
      },
    ]).routes;
    const overridden = applyClientRouteComponentOverrides(
      [route],
      defineClientRouteComponentOverrides([
        {
          routeId: '@nocobase/app-plugin-authentication:login',
          componentLoader: async () => ({ default: ApplicationPage }),
        },
      ]),
    );

    expect(overridden[0]).toMatchObject({
      auth: 'guest',
      id: '@nocobase/app-plugin-authentication:login',
      name: 'login',
      packageName: '@nocobase/app-plugin-authentication',
      path: '/login',
    });
    await expect(overridden[0].componentLoader()).resolves.toEqual({
      default: ApplicationPage,
    });
    expect(Object.isFrozen(overridden)).toBe(true);
    expect(Object.isFrozen(overridden[0])).toBe(true);
  });

  it('validates route component override targets and loaders', async () => {
    const [route] = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-example',
        routes: defineClientRoutes([
          {
            name: 'index',
            path: '/example',
            componentLoader: async () => ({ default: () => null }),
          },
        ]),
      },
    ]).routes;
    const routeId = '@nocobase/app-plugin-example:index';

    expect(() =>
      applyClientRouteComponentOverrides(
        [route],
        [
          {
            routeId: '@nocobase/app-plugin-missing:index',
            componentLoader: async () => ({ default: () => null }),
          },
        ],
      ),
    ).toThrow('references missing route');
    expect(() =>
      applyClientRouteComponentOverrides(
        [route],
        [
          { routeId, componentLoader: async () => ({ default: () => null }) },
          { routeId, componentLoader: async () => ({ default: () => null }) },
        ],
      ),
    ).toThrow('is overridden more than once');

    const overridden = applyClientRouteComponentOverrides(
      [route],
      [
        {
          routeId,
          componentLoader: async () => {
            throw new Error('Application page failed.');
          },
        },
      ],
    );
    await expect(overridden[0].componentLoader()).rejects.toThrow(
      `Failed to load client route "${routeId}".`,
    );
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
    expect(resolved.providers.map((provider) => provider.layer)).toEqual([
      'extension',
      'extension',
    ]);
  });

  it('sorts provider layers before applying same-layer constraints', () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-feature',
        providers: defineClientProviders([
          { name: 'extension', component: SecondProvider },
        ]),
      },
      {
        packageName: '@nocobase/app-template-default',
        source: 'application',
        providers: defineClientProviders([
          {
            name: 'workspace',
            component: SecondProvider,
            layer: 'application',
          },
          {
            name: 'theme',
            component: FirstProvider,
            layer: 'root',
          },
        ]),
      },
    ]);

    expect(
      resolved.providers.map(({ id, layer, source }) => ({
        id,
        layer,
        source,
      })),
    ).toEqual([
      {
        id: '@nocobase/app-template-default:theme',
        layer: 'root',
        source: 'application',
      },
      {
        id: '@nocobase/app-template-default:workspace',
        layer: 'application',
        source: 'application',
      },
      {
        id: '@nocobase/app-plugin-feature:extension',
        layer: 'extension',
        source: 'plugin',
      },
    ]);
  });

  it('rejects invalid provider layers and cross-layer constraints', () => {
    expect(() =>
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-feature',
          providers: defineClientProviders([
            {
              name: 'feature',
              component: FirstProvider,
              layer: 'root',
            },
          ]),
        },
      ]),
    ).toThrow('plugin providers must use layer "extension"');

    expect(() =>
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-template-default',
          source: 'application',
          providers: defineClientProviders([
            {
              name: 'theme',
              component: FirstProvider,
              layer: 'root',
            },
            {
              name: 'workspace',
              component: SecondProvider,
              layer: 'application',
              after: ['@nocobase/app-template-default:theme'],
            },
          ]),
        },
      ]),
    ).toThrow(
      'before/after constraints may only reference providers in the same layer',
    );
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

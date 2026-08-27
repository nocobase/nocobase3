import type { PropsWithChildren, ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import {
  applyClientRouteComponentOverrides,
  defineClientApplication,
  defineClientModule,
  defineClientModules,
  defineClientProviders,
  defineClientRouteComponentOverrides,
  defineClientRoutes,
  defineClientSourceExtension,
  resolveAppClientContributions,
} from '../src/plugins.js';

function FirstProvider({ children }: PropsWithChildren): ReactElement {
  return <>{children}</>;
}

function SecondProvider({ children }: PropsWithChildren): ReactElement {
  return <>{children}</>;
}

describe('client plugin definitions', () => {
  it('freezes source extension route overrides', () => {
    const extension = defineClientSourceExtension({
      name: 'authentication-ui',
      routeComponentOverrides: [
        {
          routeId: '@nocobase/app-plugin-authentication:login',
          componentLoader: async () => ({ default: () => null }),
        },
      ],
    });

    expect(extension.name).toBe('authentication-ui');
    expect(Object.isFrozen(extension)).toBe(true);
    expect(Object.isFrozen(extension.routeComponentOverrides)).toBe(true);
    expect(Object.isFrozen(extension.routeComponentOverrides?.[0])).toBe(true);
  });

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
            access: { resource: 'feature.dashboard', action: 'access' },
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
      access: { resource: 'feature.dashboard', action: 'access' },
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

describe('client modules', () => {
  const loadComponent = async () => ({ default: () => null });
  const bootstrapLoader = async () => ({ default: () => {} });
  const routesLoader = async () => ({
    default: defineClientRoutes([
      { name: 'index', path: '/example', componentLoader: loadComponent },
    ]),
  });

  it('forwards options and exposes the declared entries', () => {
    const example = defineClientModule<{ readonly label?: string }>({
      packageName: '@nocobase/app-plugin-example',
      bootstrap: bootstrapLoader,
      routes: routesLoader,
    });

    const registration = example({ label: 'custom' });

    expect(registration.packageName).toBe('@nocobase/app-plugin-example');
    expect(registration.bootstrap).toBe(bootstrapLoader);
    expect(registration.routes).toBe(routesLoader);
    expect(registration.providers).toBeUndefined();
    expect(registration.options).toEqual({ label: 'custom' });
    expect(registration.routeComponentOverrides).toEqual([]);
  });

  it('defaults options to an empty object when called with none', () => {
    const example = defineClientModule({
      packageName: '@nocobase/app-plugin-example',
    });

    expect(example().options).toEqual({});
  });

  it('derives route component overrides from options', () => {
    const example = defineClientModule<{
      readonly loginPage?: typeof loadComponent;
    }>({
      packageName: '@nocobase/app-plugin-example',
      routeComponentOverrides: (options) =>
        options.loginPage
          ? [
              {
                routeId: '@nocobase/app-plugin-example:login',
                componentLoader: options.loginPage,
              },
            ]
          : [],
    });

    expect(example().routeComponentOverrides).toEqual([]);
    expect(
      example({ loginPage: loadComponent }).routeComponentOverrides,
    ).toEqual([
      expect.objectContaining({
        routeId: '@nocobase/app-plugin-example:login',
      }),
    ]);
  });

  it('collects plugins in order and merges their route overrides', () => {
    const first = defineClientModule({
      packageName: '@nocobase/app-plugin-first',
      bootstrap: bootstrapLoader,
      routeComponentOverrides: () => [
        {
          routeId: '@nocobase/app-plugin-second:login',
          componentLoader: loadComponent,
        },
      ],
    });
    const second = defineClientModule({
      packageName: '@nocobase/app-plugin-second',
      routes: routesLoader,
    });

    const modules = defineClientModules([first(), second()]);

    expect(modules.plugins.map((plugin) => plugin.packageName)).toEqual([
      '@nocobase/app-plugin-first',
      '@nocobase/app-plugin-second',
    ]);
    expect(modules.plugins[0]?.source).toBe('plugin');
    expect(modules.routeComponentOverrides).toHaveLength(1);
  });

  it('rejects the same package registered twice', () => {
    const example = defineClientModule({
      packageName: '@nocobase/app-plugin-example',
    });

    expect(() => defineClientModules([example(), example()])).toThrow(
      'is registered more than once',
    );
  });

  it('rejects an empty package name', () => {
    expect(() => defineClientModule({ packageName: '  ' })).toThrow(
      'must define a package name',
    );
  });
});

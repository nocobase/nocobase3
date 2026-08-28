import type { PropsWithChildren, ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import {
  applyClientRouteComponentOverrides,
  defineClientApplication,
  defineClientPlugin,
  defineClientPlugins,
  defineClientProviders,
  defineClientRouteComponentOverrides,
  defineClientRoutes,
  defineClientSettings,
  defineClientSourceExtension,
  resolveAppClientContributions,
  type AppClientSettingDefinition,
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
    const example = defineClientPlugin<{ readonly label?: string }>({
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
    const example = defineClientPlugin({
      packageName: '@nocobase/app-plugin-example',
    });

    expect(example().options).toEqual({});
  });

  it('derives route component overrides from options', () => {
    const example = defineClientPlugin<{
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
    const first = defineClientPlugin({
      packageName: '@nocobase/app-plugin-first',
      bootstrap: bootstrapLoader,
      routeComponentOverrides: () => [
        {
          routeId: '@nocobase/app-plugin-second:login',
          componentLoader: loadComponent,
        },
      ],
    });
    const second = defineClientPlugin({
      packageName: '@nocobase/app-plugin-second',
      routes: routesLoader,
    });

    const modules = defineClientPlugins([first(), second()]);

    expect(modules.plugins.map((plugin) => plugin.packageName)).toEqual([
      '@nocobase/app-plugin-first',
      '@nocobase/app-plugin-second',
    ]);
    expect(modules.plugins[0]?.source).toBe('plugin');
    expect(modules.routeComponentOverrides).toHaveLength(1);
  });

  it('rejects the same package registered twice', () => {
    const example = defineClientPlugin({
      packageName: '@nocobase/app-plugin-example',
    });

    expect(() => defineClientPlugins([example(), example()])).toThrow(
      'is registered more than once',
    );
  });

  it('rejects an empty package name', () => {
    expect(() => defineClientPlugin({ packageName: '  ' })).toThrow(
      'must define a package name',
    );
  });
});

describe('client settings', () => {
  const page = async () => ({ default: () => null });
  const resolveSetting = (setting: Partial<AppClientSettingDefinition>) =>
    resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-example',
        settings: [setting as AppClientSettingDefinition],
      },
    ]);

  it('registers settings at /settings/<id> and keeps the declaration order', () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-authorization',
        settings: defineClientSettings([
          {
            id: 'authorization/permission-sets',
            title: 'Permission Sets',
            group: 'Authorization',
            access: {
              resource: 'authorization.settings.permission-sets',
              action: 'read',
            },
            pageLoader: page,
          },
          {
            id: 'authorization/default-access',
            title: 'Default Access',
            group: 'Authorization',
            pageLoader: page,
          },
        ]),
      },
    ]);

    expect(resolved.settings).toMatchObject([
      {
        id: 'authorization/permission-sets',
        packageName: '@nocobase/app-plugin-authorization',
        path: '/settings/authorization/permission-sets',
        source: 'plugin',
        title: 'Permission Sets',
        group: 'Authorization',
        access: {
          resource: 'authorization.settings.permission-sets',
          action: 'read',
        },
      },
      {
        id: 'authorization/default-access',
        path: '/settings/authorization/default-access',
      },
    ]);
    expect(resolved.settings[1]).not.toHaveProperty('access');
    expect(Object.isFrozen(resolved.settings)).toBe(true);
    expect(Object.isFrozen(resolved.settings[0])).toBe(true);
  });

  it('accepts a settings module that is a function of the plugin options', () => {
    const settingsFor = (options: {
      readonly advanced: boolean;
    }): readonly AppClientSettingDefinition[] =>
      defineClientSettings([
        { id: 'general', title: 'General', group: 'App', pageLoader: page },
        ...(options.advanced
          ? [
              {
                id: 'advanced',
                title: 'Advanced',
                group: 'App',
                pageLoader: page,
              },
            ]
          : []),
      ]);

    expect(
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-example',
          settings: settingsFor({ advanced: false }),
        },
      ]).settings.map((setting) => setting.id),
    ).toEqual(['general']);
    expect(
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-example',
          settings: settingsFor({ advanced: true }),
        },
      ]).settings.map((setting) => setting.id),
    ).toEqual(['general', 'advanced']);
  });

  it('rejects a setting id two plugins both claim', () => {
    expect(() =>
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-first',
          settings: defineClientSettings([
            { id: 'general', title: 'General', group: 'App', pageLoader: page },
          ]),
        },
        {
          packageName: '@nocobase/app-plugin-second',
          settings: defineClientSettings([
            { id: 'general', title: 'Général', group: 'App', pageLoader: page },
          ]),
        },
      ]),
    ).toThrow(
      'Client setting id "general" from plugin "@nocobase/app-plugin-second" is already registered by "@nocobase/app-plugin-first".',
    );
  });

  it('rejects a route that collides with a registered setting, and the reverse', () => {
    const settings = {
      packageName: '@nocobase/app-plugin-first',
      settings: defineClientSettings([
        { id: 'general', title: 'General', group: 'App', pageLoader: page },
      ]),
    };
    const route = {
      packageName: '@nocobase/app-plugin-second',
      routes: defineClientRoutes([
        {
          name: 'general',
          path: '/settings/general',
          componentLoader: page,
        },
      ]),
    };

    expect(() => resolveAppClientContributions([settings, route])).toThrow(
      'conflicts with setting "general" at "/settings/general"',
    );
    expect(() => resolveAppClientContributions([route, settings])).toThrow(
      'conflicts with route "@nocobase/app-plugin-second:general" at "/settings/general"',
    );
  });

  it.each([
    { id: '', reason: 'must define a non-empty id' },
    { id: '  ', reason: 'must define a non-empty id' },
    { id: '/leading', reason: 'must be slash-separated segments' },
    { id: 'trailing/', reason: 'must be slash-separated segments' },
    { id: 'double//slash', reason: 'must be slash-separated segments' },
    { id: 'has space', reason: 'must be slash-separated segments' },
    { id: '..', reason: 'must be slash-separated segments' },
    { id: 'a/../b', reason: 'must be slash-separated segments' },
    { id: 'query?x=1', reason: 'must be slash-separated segments' },
  ])(
    'rejects setting id "$id", which would not survive as a URL',
    ({ id, reason }) => {
      expect(() =>
        resolveSetting({
          id,
          title: 'Title',
          group: 'Group',
          pageLoader: page,
        }),
      ).toThrow(reason);
    },
  );

  it.each([
    { patch: { title: ' ' }, reason: 'must define a non-empty title' },
    { patch: { group: '' }, reason: 'must define a non-empty group' },
    {
      patch: { pageLoader: undefined },
      reason: 'must define a pageLoader function',
    },
  ])('requires $reason', ({ patch, reason }) => {
    expect(() =>
      resolveSetting({
        id: 'general',
        title: 'General',
        group: 'App',
        pageLoader: page,
        ...patch,
      }),
    ).toThrow(reason);
  });

  it('reports the setting a failing page loader belongs to', async () => {
    const [setting] = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-example',
        settings: defineClientSettings([
          {
            id: 'general',
            title: 'General',
            group: 'App',
            pageLoader: async () => ({
              default: undefined as never,
            }),
          },
        ]),
      },
    ]).settings;

    await expect(setting.pageLoader()).rejects.toThrow(
      'Failed to load client setting "general".',
    );
  });

  it('carries the settings loader from the plugin definition into the registration', () => {
    const settingsLoader = async () => ({ default: [] });
    const plugin = defineClientPlugin({
      packageName: '@nocobase/app-plugin-example',
      settings: settingsLoader,
    });

    expect(plugin().settings).toBe(settingsLoader);
    expect(defineClientPlugins([plugin()]).plugins[0].settings).toBe(
      settingsLoader,
    );
  });
});

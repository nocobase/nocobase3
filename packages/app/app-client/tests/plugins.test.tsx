import type { PropsWithChildren, ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import {
  applyClientRouteComponentOverrides,
  defineAppRoutes,
  defineClientPlugin,
  defineClientPlugins,
  defineClientReactProviders,
  defineClientRouteComponentOverrides,
  defineDevRoutes,
  defineSettingsRoutes,
  defineClientSourceExtension,
  resolveAppClientContributions,
  type AppClientDevRoutePageDefinition,
  type AppClientPluginFactory,
  type AppClientSettingsRoutePageDefinition,
} from '../src/plugins.js';

function FirstWrapper({ children }: PropsWithChildren): ReactElement {
  return <>{children}</>;
}

function SecondWrapper({ children }: PropsWithChildren): ReactElement {
  return <>{children}</>;
}

describe('client plugin definitions', () => {
  it('uses void options when AppClientPluginFactory omits its type argument', () => {
    const plugin: AppClientPluginFactory = defineClientPlugin({
      packageName: '@nocobase/app-plugin-no-options',
    });

    expect(plugin()).toMatchObject({
      packageName: '@nocobase/app-plugin-no-options',
      options: {},
    });
  });

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

  it('freezes route and reactProvider definitions', () => {
    const routes = defineAppRoutes([
      {
        name: 'index',
        path: '/example',
        componentLoader: async () => ({ default: () => null }),
      },
    ]);
    const reactProviders = defineClientReactProviders([
      {
        name: 'first',
        component: FirstWrapper,
        before: ['@nocobase/app-plugin-example:second'],
      },
    ]);

    expect(Object.isFrozen(routes)).toBe(true);
    expect(Object.isFrozen(routes[0])).toBe(true);
    expect(Object.isFrozen(reactProviders)).toBe(true);
    expect(Object.isFrozen(reactProviders[0].before)).toBe(true);
  });

  it('resolves routes and sorts reactProviders from outer to inner', () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-feature',
        routes: defineAppRoutes([
          {
            name: 'index',
            path: '/feature/',
            access: { resource: 'feature.dashboard', action: 'access' },
            componentLoader: async () => ({ default: () => null }),
          },
        ]),
        reactProviders: defineClientReactProviders([
          {
            name: 'second',
            component: SecondWrapper,
            after: ['@nocobase/app-plugin-foundation:first'],
          },
        ]),
      },
      {
        packageName: '@nocobase/app-plugin-foundation',
        reactProviders: defineClientReactProviders([
          { name: 'first', component: FirstWrapper },
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
    expect(
      resolved.reactProviders.map((reactProvider) => reactProvider.id),
    ).toEqual([
      '@nocobase/app-plugin-foundation:first',
      '@nocobase/app-plugin-feature:second',
    ]);
  });

  it('supports guest and optional routes while protecting reserved paths', () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-authentication',
        routes: defineAppRoutes([
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
          routes: defineAppRoutes([
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
        routes: defineAppRoutes([
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
        routes: defineAppRoutes([
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
        routes: defineAppRoutes([
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

  it('keeps registration order when reactProviders have no constraints', () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-example',
        reactProviders: defineClientReactProviders([
          { name: 'first', component: FirstWrapper },
          { name: 'second', component: SecondWrapper },
        ]),
      },
    ]);

    expect(
      resolved.reactProviders.map((reactProvider) => reactProvider.name),
    ).toEqual(['first', 'second']);
    expect(
      resolved.reactProviders.map((reactProvider) => reactProvider.layer),
    ).toEqual(['extension', 'extension']);
  });

  it('sorts reactProvider layers before applying same-layer constraints', () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-feature',
        reactProviders: defineClientReactProviders([
          { name: 'extension', component: SecondWrapper },
        ]),
      },
      {
        packageName: '@nocobase/app-template-default',
        source: 'application',
        reactProviders: defineClientReactProviders([
          {
            name: 'workspace',
            component: SecondWrapper,
            layer: 'application',
          },
          {
            name: 'theme',
            component: FirstWrapper,
            layer: 'root',
          },
        ]),
      },
    ]);

    expect(
      resolved.reactProviders.map(({ id, layer, source }) => ({
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

  it('rejects invalid reactProvider layers and cross-layer constraints', () => {
    expect(() =>
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-feature',
          reactProviders: defineClientReactProviders([
            {
              name: 'feature',
              component: FirstWrapper,
              layer: 'root',
            },
          ]),
        },
      ]),
    ).toThrow('plugin reactProviders must use layer "extension"');

    expect(() =>
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-template-default',
          source: 'application',
          reactProviders: defineClientReactProviders([
            {
              name: 'theme',
              component: FirstWrapper,
              layer: 'root',
            },
            {
              name: 'workspace',
              component: SecondWrapper,
              layer: 'application',
              after: ['@nocobase/app-template-default:theme'],
            },
          ]),
        },
      ]),
    ).toThrow(
      'before/after constraints may only reference reactProviders in the same layer',
    );
  });

  it('rejects missing references and circular reactProvider ordering', () => {
    expect(() =>
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-example',
          reactProviders: defineClientReactProviders([
            {
              name: 'first',
              component: FirstWrapper,
              after: ['@nocobase/app-plugin-missing:reactProvider'],
            },
          ]),
        },
      ]),
    ).toThrow('references missing reactProvider');

    expect(() =>
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-example',
          reactProviders: defineClientReactProviders([
            {
              name: 'first',
              component: FirstWrapper,
              after: ['@nocobase/app-plugin-example:second'],
            },
            {
              name: 'second',
              component: SecondWrapper,
              after: ['@nocobase/app-plugin-example:first'],
            },
          ]),
        },
      ]),
    ).toThrow('Circular client reactProvider order detected');
  });
});

describe('client modules', () => {
  const loadComponent = async () => ({ default: () => null });
  const routes = defineAppRoutes([
    { name: 'index', path: '/example', componentLoader: loadComponent },
  ]);

  it('forwards options and exposes the declared entries', () => {
    const example = defineClientPlugin<{ readonly label?: string }>({
      packageName: '@nocobase/app-plugin-example',
      routes,
      reactProviders: (options) =>
        options.label ? [{ name: options.label, component: FirstWrapper }] : [],
    });

    const registration = example({ label: 'custom' });

    expect(registration.packageName).toBe('@nocobase/app-plugin-example');
    expect(registration.routes).toEqual([routes]);
    expect(registration.reactProviders[0]?.name).toBe('custom');
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
      routeComponentOverrides: () => [
        {
          routeId: '@nocobase/app-plugin-second:login',
          componentLoader: loadComponent,
        },
      ],
    });
    const second = defineClientPlugin({
      packageName: '@nocobase/app-plugin-second',
      routes,
    });

    const modules = defineClientPlugins([first(), second()]);

    expect(modules.plugins.map((plugin) => plugin.packageName)).toEqual([
      '@nocobase/app-plugin-first',
      '@nocobase/app-plugin-second',
    ]);
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
  const resolveSetting = (
    setting: Partial<AppClientSettingsRoutePageDefinition>,
  ) =>
    resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-example',
        routes: defineSettingsRoutes([
          setting as AppClientSettingsRoutePageDefinition,
        ]),
      },
    ]);

  it("registers a group's pages under its id and keeps the declaration order", () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-authorization',
        routes: defineSettingsRoutes([
          {
            name: 'authorization',
            path: '/authorization',
            navigation: { title: 'Authorization' },
            children: [
              {
                name: 'permission-sets',
                path: '/permission-sets',
                navigation: { title: 'Permission Sets' },
                access: {
                  resource: 'authorization.settings.permission-sets',
                  action: 'read',
                },
                componentLoader: page,
              },
              {
                name: 'default-access',
                path: '/default-access',
                navigation: { title: 'Default Access' },
                componentLoader: page,
              },
            ],
          },
        ]),
      },
    ]);

    // The flat list is what the router mounts; the tree is what the navigation renders.
    expect(resolved.settings).toMatchObject([
      {
        groupId: 'authorization',
        id: 'permission-sets',
        path: '/settings/authorization/permission-sets',
        source: 'plugin',
        title: 'Permission Sets',
      },
      {
        groupId: 'authorization',
        id: 'default-access',
        path: '/settings/authorization/default-access',
      },
    ]);
    expect(resolved.settings[1]).not.toHaveProperty('access');
    expect(resolved.settingGroups).toMatchObject([
      {
        id: 'authorization',
        packageName: '@nocobase/app-plugin-authorization',
        title: 'Authorization',
      },
    ]);
    expect(
      resolved.settingGroups[0].settings.map((setting) => setting.path),
    ).toEqual([
      '/settings/authorization/permission-sets',
      '/settings/authorization/default-access',
    ]);
    expect(Object.isFrozen(resolved.settings)).toBe(true);
    expect(Object.isFrozen(resolved.settingGroups[0])).toBe(true);
  });

  it('registers an ungrouped page at the top level', () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-example',
        routes: defineSettingsRoutes([
          {
            name: 'general',
            path: '/general',
            navigation: { title: 'General' },
            componentLoader: page,
          },
        ]),
      },
    ]);

    expect(resolved.settings).toMatchObject([
      { id: 'general', path: '/settings/general' },
    ]);
    expect(resolved.settings[0]).not.toHaveProperty('groupId');
    expect(resolved.settingGroups).toEqual([]);
  });

  it('carries the icon a group and a page declare', () => {
    const Icon = () => null;
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-example',
        routes: defineSettingsRoutes([
          {
            name: 'group',
            path: '/group',
            navigation: { title: 'Group', icon: Icon },
            children: [
              {
                name: 'child',
                path: '/child',
                navigation: { title: 'Child', icon: Icon },
                componentLoader: page,
              },
              {
                name: 'plain',
                path: '/plain',
                navigation: { title: 'Plain' },
                componentLoader: page,
              },
            ],
          },
        ]),
      },
    ]);

    expect(resolved.settingGroups[0].icon).toBe(Icon);
    expect(resolved.settings[0].icon).toBe(Icon);
    expect(resolved.settings[1]).not.toHaveProperty('icon');
  });

  it('accepts a settings module that is a function of the plugin options', () => {
    const settingsFor = (options: { readonly advanced: boolean }) =>
      defineSettingsRoutes([
        {
          name: 'general',
          path: '/general',
          navigation: { title: 'General' },
          componentLoader: page,
        },
        ...(options.advanced
          ? [
              {
                name: 'advanced',
                path: '/advanced',
                navigation: { title: 'Advanced' },
                componentLoader: page,
              },
            ]
          : []),
      ]);

    expect(
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-example',
          routes: settingsFor({ advanced: false }),
        },
      ]).settings.map((setting) => setting.id),
    ).toEqual(['general']);
    expect(
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-example',
          routes: settingsFor({ advanced: true }),
        },
      ]).settings.map((setting) => setting.id),
    ).toEqual(['general', 'advanced']);
  });

  it('rejects a path two plugins both claim', () => {
    expect(() =>
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-first',
          routes: defineSettingsRoutes([
            {
              name: 'general',
              path: '/general',
              navigation: { title: 'General' },
              componentLoader: page,
            },
          ]),
        },
        {
          packageName: '@nocobase/app-plugin-second',
          routes: defineSettingsRoutes([
            {
              name: 'general',
              path: '/general',
              navigation: { title: 'Général' },
              componentLoader: page,
            },
          ]),
        },
      ]),
    ).toThrow(
      'Client setting "/settings/general" from plugin "@nocobase/app-plugin-second" is already registered by "@nocobase/app-plugin-first".',
    );
  });

  it('rejects a group id two plugins both claim', () => {
    const group = (packageName: string) => ({
      packageName,
      routes: defineSettingsRoutes([
        {
          name: 'shared',
          path: '/shared',
          navigation: { title: 'Shared' },
          children: [
            {
              name: packageName.slice(-5),
              path: `/${packageName.slice(-5)}`,
              navigation: { title: 'Child' },
              componentLoader: page,
            },
          ],
        },
      ]),
    });

    expect(() =>
      resolveAppClientContributions([
        group('@nocobase/app-plugin-first'),
        group('@nocobase/app-plugin-second'),
      ]),
    ).toThrow(
      'Client setting group "shared" from plugin "@nocobase/app-plugin-second" is already registered by "@nocobase/app-plugin-first".',
    );
  });

  it('rejects duplicate child ids inside one group', () => {
    expect(() =>
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-example',
          routes: defineSettingsRoutes([
            {
              name: 'group',
              path: '/group',
              navigation: { title: 'Group' },
              children: [
                {
                  name: 'child',
                  path: '/child',
                  navigation: { title: 'First' },
                  componentLoader: page,
                },
                {
                  name: 'child',
                  path: '/child',
                  navigation: { title: 'Second' },
                  componentLoader: page,
                },
              ],
            },
          ]),
        },
      ]),
    ).toThrow('defines duplicate child id "child"');
  });

  it('rejects an empty group', () => {
    expect(() =>
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-example',
          routes: defineSettingsRoutes([
            {
              name: 'group',
              path: '/group',
              navigation: { title: 'Group' },
              children: [],
            },
          ]),
        },
      ]),
    ).toThrow('must define at least one child');
  });

  it('rejects a route that collides with a registered setting, and the reverse', () => {
    const settings = {
      packageName: '@nocobase/app-plugin-first',
      routes: defineSettingsRoutes([
        {
          name: 'general',
          path: '/general',
          navigation: { title: 'General' },
          componentLoader: page,
        },
      ]),
    };
    const route = {
      packageName: '@nocobase/app-plugin-second',
      routes: defineAppRoutes([
        { name: 'general', path: '/settings/general', componentLoader: page },
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
    { name: '', path: '/', reason: 'must define a non-empty id' },
    { name: '  ', path: '/  ', reason: 'must define a non-empty id' },
    // Nesting comes from the tree now, so a slash inside an id is no longer a namespace but a malformed segment.
    { name: 'a/b', path: '/a/b', reason: 'must be a single segment' },
    { name: '/leading', path: '//leading', reason: 'must be a single segment' },
    {
      name: 'has space',
      path: '/has space',
      reason: 'must be a single segment',
    },
    { name: '..', path: '/..', reason: 'must be a single segment' },
    {
      name: 'query?x=1',
      path: '/query?x=1',
      reason: 'must be a single segment',
    },
  ])(
    'rejects setting name "$name", which would not survive as an id',
    ({ name, path, reason }) => {
      expect(() =>
        resolveSetting({
          name,
          path,
          navigation: { title: 'Title' },
          componentLoader: page,
        }),
      ).toThrow(reason);
    },
  );

  it.each([
    {
      patch: { navigation: { title: ' ' } },
      reason: 'must define a non-empty title',
    },
    {
      patch: { componentLoader: undefined },
      reason: 'must define a componentLoader function',
    },
  ])('requires $reason', ({ patch, reason }) => {
    expect(() =>
      resolveSetting({
        name: 'general',
        path: '/general',
        navigation: { title: 'General' },
        componentLoader: page,
        ...patch,
      }),
    ).toThrow(reason);
  });

  it('reports the setting a failing page loader belongs to', async () => {
    const [setting] = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-example',
        routes: defineSettingsRoutes([
          {
            name: 'general',
            path: '/general',
            navigation: { title: 'General' },
            componentLoader: async () => ({ default: undefined as never }),
          },
        ]),
      },
    ]).settings;

    await expect(setting.pageLoader()).rejects.toThrow(
      'Failed to load client setting "general".',
    );
  });

  it('carries static Settings Route contributions into registration', () => {
    const settings = defineSettingsRoutes([]);
    const plugin = defineClientPlugin({
      packageName: '@nocobase/app-plugin-example',
      routes: settings,
    });

    expect(plugin().routes).toEqual([settings]);
    expect(defineClientPlugins([plugin()]).plugins[0].routes).toEqual([
      settings,
    ]);
  });
});

describe('client dev routes', () => {
  const page = async () => ({ default: () => null });

  it('mounts pages under /dev and marks them as the dev surface', () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-example',
        routes: defineDevRoutes([
          {
            name: 'playground',
            path: '/playground',
            navigation: { title: 'Playground' },
            componentLoader: page,
          },
        ]),
      },
    ]);

    expect(resolved.devRoutes).toMatchObject([
      {
        id: 'playground',
        path: '/dev/playground',
        source: 'plugin',
        surface: 'dev',
        title: 'Playground',
      },
    ]);
    // Dev pages are their own surface: they never leak into the settings centre.
    expect(resolved.settings).toEqual([]);
    expect(resolved.settingGroups).toEqual([]);
  });

  it("registers a group's dev pages under its id and keeps the declaration order", () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-example',
        routes: defineDevRoutes([
          {
            name: 'inspect',
            path: '/inspect',
            navigation: { title: 'Inspect' },
            children: [
              {
                name: 'routes',
                path: '/routes',
                navigation: { title: 'Routes' },
                componentLoader: page,
              },
              {
                name: 'cache',
                path: '/cache',
                navigation: { title: 'Cache' },
                componentLoader: page,
              },
            ],
          },
        ]),
      },
    ]);

    expect(resolved.devRoutes.map((route) => route.path)).toEqual([
      '/dev/inspect/routes',
      '/dev/inspect/cache',
    ]);
    expect(resolved.devRouteGroups).toMatchObject([
      { id: 'inspect', surface: 'dev', title: 'Inspect' },
    ]);
  });

  it('lets a dev route and a setting share a relative path', () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-example',
        routes: [
          defineSettingsRoutes([
            {
              name: 'shared',
              path: '/shared',
              navigation: { title: 'Shared' },
              componentLoader: page,
            },
          ]),
          defineDevRoutes([
            {
              name: 'shared',
              path: '/shared',
              navigation: { title: 'Shared' },
              componentLoader: page,
            },
          ]),
        ],
      },
    ]);

    expect(resolved.settings[0].path).toBe('/settings/shared');
    expect(resolved.devRoutes[0].path).toBe('/dev/shared');
  });

  it('reports a duplicate dev route as a dev route rather than as a setting', () => {
    expect(() =>
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-example',
          routes: defineDevRoutes([
            {
              name: 'tools',
              path: '/tools',
              navigation: { title: 'Tools' },
              componentLoader: page,
            },
            {
              name: 'tools',
              path: '/tools',
              navigation: { title: 'Tools again' },
              componentLoader: page,
            },
          ]),
        },
      ]),
    ).toThrow(/Client dev route "\/dev\/tools"/u);
  });

  it('rejects a dev route whose componentLoader is missing', () => {
    expect(() =>
      resolveAppClientContributions([
        {
          packageName: '@nocobase/app-plugin-example',
          routes: defineDevRoutes([
            {
              name: 'broken',
              path: '/broken',
              navigation: { title: 'Broken' },
            } as AppClientDevRoutePageDefinition,
          ]),
        },
      ]),
    ).toThrow('Client dev route "broken"');
  });

  it('carries static Dev Route contributions into registration', () => {
    const devRoutes = defineDevRoutes([]);
    const plugin = defineClientPlugin({
      packageName: '@nocobase/app-plugin-example',
      routes: devRoutes,
    });

    expect(plugin().routes).toEqual([devRoutes]);
    expect(defineClientPlugins([plugin()]).plugins[0].routes).toEqual([
      devRoutes,
    ]);
  });

  it('keeps the declared routes outside a production build', () => {
    // Vitest runs under Node, where `import.meta.env` is undefined. That is a development context, so the guard must
    // let the routes through rather than treating the missing value as production.
    expect(
      defineDevRoutes([
        {
          name: 'playground',
          path: '/playground',
          navigation: { title: 'Playground' },
          componentLoader: page,
        },
      ]).routes,
    ).toHaveLength(1);
  });
});

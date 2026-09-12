import { expect, it } from 'vitest';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  defineDevRoutes,
  resolveAppClientContributions,
  applyClientRouteComponentOverrides,
} from '../src/plugins.js';
const componentLoader = async () => ({ default: () => null });
it('resolves nested pages and pathless navigation groups as trees', () => {
  const result = resolveAppClientContributions([
    {
      packageName: 'example',
      routes: defineAppRoutes([
        {
          name: 'business',
          navigation: { title: 'Business' },
          children: [
            {
              name: 'orders',
              path: '/orders',
              navigation: { title: 'Orders' },
              componentLoader,
              children: [{ name: 'detail', path: ':orderId', componentLoader }],
            },
          ],
        },
      ]),
    },
  ]);
  expect(result.routes[0]?.children?.[0]).toMatchObject({
    id: 'example:orders',
    path: '/orders',
    children: [{ id: 'example:detail', path: '/orders/:orderId' }],
  });
});
it('retains settings page children separately from navigation groups', () => {
  const result = resolveAppClientContributions([
    {
      packageName: 'example',
      routes: defineSettingsRoutes([
        {
          name: 'orders',
          path: '/orders',
          componentLoader,
          children: [{ name: 'detail', path: ':orderId', componentLoader }],
        },
      ]),
    },
  ]);
  expect(result.settingsRouteTree[0]).toMatchObject({
    id: 'orders',
    path: '/settings/orders',
    children: [{ id: 'detail', path: '/settings/orders/:orderId' }],
  });
});
it('overrides nested pages without losing their children', () => {
  const result = resolveAppClientContributions([
    {
      packageName: 'example',
      routes: defineAppRoutes([
        {
          name: 'orders',
          path: '/orders',
          componentLoader,
          children: [{ name: 'detail', path: ':orderId', componentLoader }],
        },
      ]),
    },
  ]);
  expect(
    applyClientRouteComponentOverrides(result.routes, [
      { routeId: 'example:detail', componentLoader },
    ])[0]?.children,
  ).toHaveLength(1);
});
it('rejects dynamic menu links and changed child authentication', () => {
  expect(() =>
    resolveAppClientContributions([
      {
        packageName: 'example',
        routes: defineAppRoutes([
          {
            name: 'detail',
            path: '/orders/:id',
            navigation: { title: 'Detail' },
            componentLoader,
          },
        ]),
      },
    ]),
  ).toThrow(/navigation/i);
  expect(() =>
    resolveAppClientContributions([
      {
        packageName: 'example',
        routes: defineAppRoutes([
          {
            name: 'orders',
            path: '/orders',
            componentLoader,
            children: [
              {
                name: 'detail',
                path: ':id',
                auth: 'optional',
                componentLoader,
              },
            ],
          },
        ]),
      },
    ]),
  ).toThrow(/auth/i);
});

it('rejects duplicate app names and conflicting child paths across groups', () => {
  const group = (name: string, childName: string, path: string) => ({
    name,
    navigation: { title: name },
    children: [{ name: childName, path, componentLoader }],
  });
  expect(() =>
    resolveAppClientContributions([
      {
        packageName: 'example',
        routes: defineAppRoutes([
          group('one', 'same', '/one'),
          group('two', 'same', '/two'),
        ]),
      },
    ]),
  ).toThrow(/duplicate client route name/);
  expect(() =>
    resolveAppClientContributions([
      {
        packageName: 'example',
        routes: defineAppRoutes([
          group('one', 'first', '/records/:id'),
          group('two', 'second', '/records/:recordId'),
        ]),
      },
    ]),
  ).toThrow(/conflicts/);
});

it('freezes recursive declarations and rejects overrides of groups', () => {
  const declaration = defineAppRoutes([
    {
      name: 'group',
      navigation: { title: 'Group' },
      children: [{ name: 'page', path: '/page', componentLoader }],
    },
  ]);
  expect(Object.isFrozen(declaration.routes[0]?.children?.[0])).toBe(true);
  expect(Object.isFrozen(declaration.routes[0]?.navigation)).toBe(true);
  const result = resolveAppClientContributions([
    { packageName: 'example', routes: declaration },
  ]);
  expect(() =>
    applyClientRouteComponentOverrides(result.routes, [
      { routeId: 'example:group', componentLoader },
    ]),
  ).toThrow(/group/);
});

it('resolves multiple navigation groups without changing descendant authentication or identity', () => {
  const result = resolveAppClientContributions([
    {
      packageName: 'example',
      routes: defineAppRoutes([
        {
          name: 'outer',
          auth: 'optional',
          navigation: { title: 'Outer' },
          children: [
            {
              name: 'inner',
              path: 'catalog',
              navigation: { title: 'Inner' },
              children: [{ name: 'page', path: 'items', componentLoader }],
            },
          ],
        },
      ]),
    },
  ]);
  expect(result.routes[0]?.children?.[0]?.children?.[0]).toMatchObject({
    id: 'example:page',
    path: '/catalog/items',
    auth: 'optional',
  });
});

it('preserves the parent and sibling loaders when overriding a nested page', async () => {
  const original = () => null;
  const replacement = () => null;
  const result = resolveAppClientContributions([
    {
      packageName: 'example',
      routes: defineAppRoutes([
        {
          name: 'parent',
          path: '/parent',
          componentLoader: async () => ({ default: original }),
          children: [{ name: 'child', path: 'child', componentLoader }],
        },
      ]),
    },
  ]);
  const overridden = applyClientRouteComponentOverrides(result.routes, [
    {
      routeId: 'example:child',
      componentLoader: async () => ({ default: replacement }),
    },
  ]);
  expect((await overridden[0]!.componentLoader!()).default).toBe(original);
  expect((await overridden[0]!.children![0]!.componentLoader!()).default).toBe(
    replacement,
  );
  expect(overridden[0]?.children?.[0]?.path).toBe('/parent/child');
});

it('keeps settings and dev trees independent while preserving repeated page IDs in different groups', () => {
  const entries = ['one', 'two'].map((name) => ({
    name,
    path: name,
    navigation: { title: name },
    children: [{ name: 'details', path: 'details', componentLoader }],
  }));
  const result = resolveAppClientContributions([
    {
      packageName: 'example',
      routes: [defineSettingsRoutes(entries), defineDevRoutes(entries)],
    },
  ]);
  expect(
    result.settingsRouteTree.map((node) => node.children?.[0]?.path),
  ).toEqual(['/settings/one/details', '/settings/two/details']);
  expect(result.devRouteTree.map((node) => node.children?.[0]?.path)).toEqual([
    '/dev/one/details',
    '/dev/two/details',
  ]);
  expect(result.settings.map((node) => node.id)).toEqual([
    'details',
    'details',
  ]);
});

it('allows existing top-level settings page names at distinct paths', () => {
  const definitions = [
    { name: 'details', path: '/one', componentLoader },
    { name: 'details', path: '/two', componentLoader },
  ];
  const result = resolveAppClientContributions([
    {
      packageName: 'example',
      routes: [defineSettingsRoutes(definitions), defineDevRoutes(definitions)],
    },
  ]);
  expect(result.settings.map((route) => route.path)).toEqual([
    '/settings/one',
    '/settings/two',
  ]);
  expect(result.devRoutes.map((route) => route.path)).toEqual([
    '/dev/one',
    '/dev/two',
  ]);
});

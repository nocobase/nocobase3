import { describe, expect, it } from 'vitest';
import {
  defineAppRoutes,
  defineDevRoutes,
  resolveAppClientContributions,
  type AppClientRouteDefinition,
} from '../src/plugins.js';

const page = async () => ({ default: () => null });

describe.each(['app', 'dev'] as const)('%s parent contributions', (surface) => {
  const define = surface === 'app' ? defineAppRoutes : defineDevRoutes;
  const resolve = (definitions: readonly AppClientRouteDefinition[]) =>
    resolveAppClientContributions([
      { packageName: '@example/owner', routes: define(definitions) },
    ]);
  const parent = surface === 'app' ? '@example/owner:tools' : 'tools';

  it('supports forward references, nested groups, stable sorting and original ownership', () => {
    const owner = {
      packageName: '@example/owner',
      routes: define([
        {
          name: 'tools',
          path: '/tools',
          navigation: { title: 'Tools' },
          children: [
            {
              name: 'last',
              path: '/last',
              navigation: { title: 'Last', order: 10 },
              componentLoader: page,
            },
          ],
        },
        {
          name: 'first',
          path: '/first',
          navigation: { title: 'First', order: -10 },
          componentLoader: page,
        },
      ]),
    };
    const child = {
      packageName: '@example/extension',
      routes: define([
        {
          parent,
          name: 'nested',
          path: '/nested',
          navigation: { title: 'Nested' },
          children: [],
        },
        {
          parent: 'nested',
          name: 'leaf',
          path: '/leaf',
          componentLoader: page,
        },
        { parent, name: 'sibling', path: '/sibling', componentLoader: page },
      ]),
    };
    for (const contributions of [
      [child, owner],
      [owner, child],
    ]) {
      const result = resolveAppClientContributions(contributions);
      const tree = surface === 'app' ? result.routes : result.devRouteTree;
      expect(tree.map((node) => node.name)).toEqual(['first', 'tools']);
      expect(tree[1]?.children?.map((node) => node.name)).toEqual([
        'nested',
        'sibling',
        'last',
      ]);
      expect(tree[1]?.children?.[0]?.children?.[0]).toMatchObject({
        path: `${surface === 'app' ? '' : '/dev'}/tools/nested/leaf`,
        packageName: '@example/extension',
        source: 'plugin',
      });
      if (surface === 'dev') {
        expect(result.devRoutes.map((node) => node.id)).toEqual([
          'first',
          'leaf',
          'sibling',
          'last',
        ]);
        expect(
          result.devRouteGroups.find((group) => group.id === 'nested')
            ?.settings[0]?.id,
        ).toBe('leaf');
      }
    }
    expect(owner.routes.routes[0]?.children).toHaveLength(1);
    expect(child.routes.routes[0]?.children).toHaveLength(0);
  });

  it('rejects missing parents, pages as parents, cycles and nested parent declarations', () => {
    for (const parent of ['missing', 'page']) {
      expect(() =>
        resolve([
          { name: 'page', path: '/page', componentLoader: page },
          { parent, name: 'child', path: '/child', componentLoader: page },
        ]),
      ).toThrow('missing group');
    }
    expect(() =>
      resolve([
        { name: 'a', parent: 'b', navigation: { title: 'A' }, children: [] },
        { name: 'b', parent: 'a', navigation: { title: 'B' }, children: [] },
      ]),
    ).toThrow(`Circular ${surface} parent`);
    expect(() =>
      resolve([
        {
          name: 'a',
          navigation: { title: 'A' },
          children: [
            { parent: 'a', name: 'b', path: '/b', componentLoader: page },
          ],
        },
      ]),
    ).toThrow('cannot declare parent inside children');
  });
});

it('inherits app auth across plugins and rejects changing it', () => {
  const owner = {
    packageName: '@example/owner',
    routes: defineAppRoutes([
      {
        name: 'public',
        path: '/public',
        auth: 'guest',
        navigation: { title: 'Public' },
        children: [],
      },
    ]),
  };
  const child = (auth?: 'guest' | 'required') => ({
    packageName: '@example/extension',
    routes: defineAppRoutes([
      {
        parent: '@example/owner:public',
        name: 'leaf',
        path: '/leaf',
        ...(auth ? { auth } : {}),
        componentLoader: page,
      },
    ]),
  });
  expect(
    resolveAppClientContributions([child(), owner]).routes[0]?.children?.[0]
      ?.auth,
  ).toBe('guest');
  expect(() =>
    resolveAppClientContributions([owner, child('required')]),
  ).toThrow('cannot change inherited auth');
});

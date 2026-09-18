import { describe, expect, it } from 'vitest';
import {
  defineSettingsRoutes,
  resolveAppClientContributions,
  type AppClientSettingsRouteDefinition,
} from '../src/plugins.js';
const page = async () => ({ default: () => null });
const owner = {
  packageName: '@example/owner',
  routes: defineSettingsRoutes([
    {
      name: 'authorization',
      path: '/authorization',
      navigation: { title: 'Permissions' },
      children: [{ name: 'sets', path: '/sets', componentLoader: page }],
    },
  ]),
};
const contribution = (routes: readonly AppClientSettingsRouteDefinition[]) => ({
  packageName: '@example/rules',
  routes: defineSettingsRoutes(routes),
});

describe('settings parent contributions', () => {
  it('orders contributed siblings while retaining registration order for ties', () => {
    const result = resolveAppClientContributions([
      owner,
      contribution([
        {
          parent: 'authorization',
          name: 'inspector',
          path: '/inspector',
          navigation: { title: 'Inspector', order: 100 },
          componentLoader: page,
        },
        {
          parent: 'authorization',
          name: 'sharing',
          path: '/sharing',
          componentLoader: page,
        },
        {
          parent: 'authorization',
          name: 'restrictions',
          path: '/restrictions',
          componentLoader: page,
        },
      ]),
    ]);
    expect(
      result.settingsRouteTree[0]?.children?.map((node) => node.name),
    ).toEqual(['sets', 'sharing', 'restrictions', 'inspector']);
    expect(result.settings.map((node) => node.id)).toEqual([
      'sets',
      'sharing',
      'restrictions',
      'inspector',
    ]);
  });
  it('appends before or after the owner registration without changing ownership or inputs', () => {
    const child = contribution([
      {
        parent: 'authorization',
        name: 'audit',
        path: '/audit',
        navigation: { title: 'Audit' },
        authz: { resource: { type: 'page', id: 'audit' }, action: 'access' },
        componentLoader: page,
      },
    ]);
    for (const inputs of [
      [owner, child],
      [child, owner],
    ]) {
      const result = resolveAppClientContributions(inputs);
      expect(result.settings.map(({ id }) => id)).toEqual(['sets', 'audit']);
      expect(result.settings[1]).toMatchObject({
        path: '/settings/authorization/audit',
        groupId: 'authorization',
        packageName: '@example/rules',
        authz: { resource: { type: 'page', id: 'audit' }, action: 'access' },
      });
      expect(result.settingGroups[0]?.settings).toHaveLength(2);
      expect(result.settingsRouteTree[0]?.children?.[1]?.packageName).toBe(
        '@example/rules',
      );
    }
    expect(owner.routes.routes[0]?.children).toHaveLength(1);
  });
  it('supports nested contributed groups, empty owners and multiple parents', () => {
    const result = resolveAppClientContributions([
      contribution([
        {
          parent: 'nested',
          name: 'audit',
          path: '/audit',
          componentLoader: page,
        },
        {
          parent: 'authorization',
          name: 'nested',
          path: '/nested',
          navigation: { title: 'Nested' },
          children: [],
        },
      ]),
      owner,
    ]);
    expect(result.settings[1]).toMatchObject({
      path: '/settings/authorization/nested/audit',
      groupId: 'nested',
    });
  });
  it.each(['missing', 'sets'])(
    'rejects a target that is not a group: %s',
    (parent) => {
      expect(() =>
        resolveAppClientContributions([
          owner,
          contribution([
            { parent, name: 'audit', path: '/audit', componentLoader: page },
          ]),
        ]),
      ).toThrow('missing group');
    },
  );
  it('rejects structural children with an explicit parent', () => {
    expect(() =>
      resolveAppClientContributions([
        contribution([
          {
            name: 'a',
            navigation: { title: 'A' },
            children: [
              { parent: 'a', name: 'b', path: '/b', componentLoader: page },
            ],
          },
        ]),
      ]),
    ).toThrow('cannot declare parent inside children');
  });
  it('rejects disconnected cycles and self-parenting', () => {
    for (const targets of [
      ['b', 'a'],
      ['a', 'b'],
    ]) {
      expect(() =>
        resolveAppClientContributions([
          contribution(
            ['a', 'b'].map((name, i) => ({
              name,
              parent: targets[i],
              navigation: { title: name },
              children: [],
            })),
          ),
        ]),
      ).toThrow('Circular settings parent');
    }
  });
  it('rejects duplicate child names and conflicting paths across contributions', () => {
    expect(() =>
      resolveAppClientContributions([
        owner,
        contribution([
          {
            parent: 'authorization',
            name: 'sets',
            path: '/other',
            componentLoader: page,
          },
        ]),
      ]),
    ).toThrow('duplicate child id');
    expect(() =>
      resolveAppClientContributions([
        owner,
        contribution([
          {
            parent: 'authorization',
            name: 'other',
            path: '/sets',
            componentLoader: page,
          },
        ]),
      ]),
    ).toThrow('already registered');
  });
});

import { expect, it } from 'vitest';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  defineDevRoutes,
  resolveAppClientContributions,
  type AppClientRoutePageDefinition,
} from '../src/plugins.js';

const componentLoader = async () => ({ default: () => null });
const check = { resource: { type: 'report', id: 'orders' }, action: 'read' };

it('keeps declared checks and preserves parent guards when a child skips', () => {
  const page = { resource: { type: 'page', id: 'orders' }, action: 'access' };
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
              authz: page,
              componentLoader,
              children: [
                { name: 'skip', path: 'skip', authz: 'skip', componentLoader },
                {
                  name: 'report',
                  path: 'report',
                  authz: check,
                  componentLoader,
                },
              ],
            },
          ],
        },
      ]),
    },
  ]);
  const group = result.routes[0]!;
  const orders = group.children![0]!;
  expect(group.authz).toBe('skip');
  expect(orders.authz).toEqual(page);
  expect(orders.children!.map((child) => child.authz)).toEqual(['skip', check]);
  expect(Object.isFrozen(orders.children![1]!.authz)).toBe(true);
});

it('infers nothing: every page on every surface must declare authz', () => {
  const surfaces = [
    () =>
      defineAppRoutes([
        { name: 'orders', path: '/orders', componentLoader } as never,
      ]),
    () =>
      defineAppRoutes([
        {
          name: 'guest',
          path: '/guest',
          auth: 'guest',
          componentLoader,
        } as never,
      ]),
    () =>
      defineSettingsRoutes([
        { name: 'settings', path: '/example', componentLoader } as never,
      ]),
    () =>
      defineDevRoutes([
        { name: 'dev', path: '/example', componentLoader } as never,
      ]),
  ];
  for (const routes of surfaces)
    expect(() =>
      resolveAppClientContributions([
        { packageName: 'example', routes: routes() },
      ]),
    ).toThrow(/must declare authz/);
  const result = resolveAppClientContributions([
    {
      packageName: 'example',
      routes: [
        defineAppRoutes([
          {
            name: 'guest',
            path: '/guest',
            auth: 'guest',
            authz: 'skip',
            componentLoader,
          },
          {
            name: 'public-report',
            path: '/public-report',
            auth: 'optional',
            authz: check,
            componentLoader,
          },
        ]),
        defineSettingsRoutes([
          {
            name: 'settings',
            path: '/example',
            authz: 'skip',
            componentLoader,
          },
        ]),
        defineDevRoutes([
          { name: 'dev', path: '/example', authz: check, componentLoader },
        ]),
      ],
    },
  ]);
  expect(result.routes.map((route) => route.authz)).toEqual(['skip', check]);
  expect(result.settings[0]!.authz).toBe('skip');
  expect(result.devRouteTree[0]!.authz).toEqual(check);
});

it.each([
  { access: false },
  { access: { resource: 'orders', action: 'access' } },
  { authz: false },
  { authz: null },
  { authz: 'orders' },
  { authz: { resource: 'orders', action: 'access' } },
  { authz: { resource: { type: '', id: 'orders' }, action: 'access' } },
  { authz: { resource: { type: 'page', id: '' }, action: 'access' } },
  { authz: { resource: { type: 'page', id: 'orders' }, action: '' } },
])(
  'rejects removed or malformed authorization declarations: %j',
  (declaration) => {
    expect(() =>
      resolveAppClientContributions([
        {
          packageName: 'example',
          routes: defineAppRoutes([
            {
              name: 'orders',
              path: '/orders',
              componentLoader,
              ...declaration,
            } as unknown as AppClientRoutePageDefinition,
          ]),
        },
      ]),
    ).toThrow(/authz/);
  },
);

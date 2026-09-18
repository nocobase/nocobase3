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

it('normalizes default checks once and preserves parent guards when a child skips', () => {
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
              componentLoader,
              children: [
                { name: 'detail', path: ':id', componentLoader },
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
  const page = group.children![0]!;
  expect(group.authz).toBe('skip');
  expect(page.authz).toEqual({
    resource: { type: 'page', id: 'orders' },
    action: 'access',
  });
  expect(page.children!.map((child) => child.authz)).toEqual([
    'skip',
    'skip',
    check,
  ]);
  expect(Object.isFrozen(page.children![2]!.authz)).toBe(true);
});

it('uses skip for undeclared Settings, Dev, guest and optional pages', () => {
  const result = resolveAppClientContributions([
    {
      packageName: 'example',
      routes: [
        defineAppRoutes([
          { name: 'guest', path: '/guest', auth: 'guest', componentLoader },
          {
            name: 'optional',
            path: '/optional',
            auth: 'optional',
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
          { name: 'settings', path: '/example', componentLoader },
        ]),
        defineDevRoutes([{ name: 'dev', path: '/example', componentLoader }]),
      ],
    },
  ]);
  expect(result.routes.map((route) => route.authz)).toEqual([
    'skip',
    'skip',
    check,
  ]);
  expect(result.settings[0]!.authz).toBe('skip');
  expect(result.settingsRouteTree[0]!.authz).toBe('skip');
  expect(result.devRouteTree[0]!.authz).toBe('skip');
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

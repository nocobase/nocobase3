import { describe, expect, it } from 'vitest';
import { createAuthorization } from '../src/core/index.js';

function setup() {
  return createAuthorization({
    plugins: [
      {
        id: 'pages',
        setup(authz) {
          authz.resourceTypes.add({
            resourceType: 'page',
            authorize: async () => ({ effect: 'deny', reasons: [] }),
          });
        },
      },
    ],
  });
}

describe('resource items', () => {
  it('registers flat resource items independently from authorization', async () => {
    const authz = setup();
    const pages = authz.getResource('page');
    pages.items.add({
      id: 'orders',
      title: 'Orders',
      actions: ['access'],
    });
    pages.items.add({ id: 'home', title: 'Home', actions: ['access'] });
    expect(pages.items.list().map((item) => item.id)).toEqual([
      'orders',
      'home',
    ]);
    expect(authz.getResource('page')).toBe(pages);
    expect(() => authz.getResource('missing')).toThrow('not registered');
    expect(
      (
        await authz.authorize({
          principal: { type: 'user', id: 'alice' },
          resource: { type: 'page', id: 'orders' },
          action: 'access',
        })
      ).effect,
    ).toBe('deny');
  });

  it('rejects duplicate item IDs without replacing the original', () => {
    const { items } = setup().getResource('page');
    items.add({ id: 'orders', title: 'Orders', actions: ['access'] });
    expect(() =>
      items.add({ id: 'orders', title: 'Changed', actions: ['access'] }),
    ).toThrow('already registered');
    expect(items.list()).toMatchObject([{ id: 'orders', title: 'Orders' }]);
  });
});

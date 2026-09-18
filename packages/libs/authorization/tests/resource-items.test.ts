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

describe('resource groups and items', () => {
  it('keeps nested display groups separate from grantable items, including root items', async () => {
    const authz = setup();
    const pages = authz.getResource('page');
    pages.groups.add({
      id: 'business',
      title: 'Business',
      children: [{ id: 'sales', title: 'Sales' }],
    });
    pages.items.add({
      id: 'orders',
      title: 'Orders',
      group: 'sales',
      actions: ['access'],
    });
    pages.items.add({ id: 'home', title: 'Home', actions: ['access'] });
    expect(pages.groups.has('sales')).toBe(true);
    expect(pages.items.has('business')).toBe(false);
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

  it('rejects duplicate group IDs atomically across all levels', () => {
    const groups = setup().getResource('page').groups;
    groups.add({
      id: 'business',
      title: 'Business',
      children: [{ id: 'sales', title: 'Sales' }],
    });
    expect(() =>
      groups.add({
        id: 'other',
        title: 'Other',
        children: [{ id: 'sales', title: 'Sales' }],
      }),
    ).toThrow('duplicate');
    expect(groups.has('other')).toBe(false);
    expect(groups.list()).toHaveLength(1);
  });
});

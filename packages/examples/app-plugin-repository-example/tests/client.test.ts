import { describe, expect, it } from 'vitest';
import type { AppClientRouteDefinition } from '@nocobase/app-client/plugins';
import routes from '../client/routes.js';
describe('Repository pages', () => {
  it('keeps API, CRM and order menus grouped in the route declarations', () => {
    expect(routes[0]!.routes.slice(0, 3)).toMatchObject([
      {
        navigation: { title: 'apiExamples' },
        children: [
          { name: 'sort', navigation: { title: 'sortTitle' } },
          {
            name: 'select-combine',
            navigation: { title: 'selectCombineTitle' },
          },
          {
            name: 'relation-mutations',
            navigation: { title: 'relationMutationsTitle' },
          },
          { name: 'find-many', navigation: { title: 'findManyTitle' } },
          { name: 'aggregate', navigation: { title: 'aggregateTitle' } },
          { name: 'atomic', navigation: { title: 'atomicTitle' } },
        ],
      },
      {
        navigation: { title: 'crm' },
        children: [
          { name: 'crm', navigation: { title: 'customers' } },
          { name: 'contacts', navigation: { title: 'contacts' } },
        ],
      },
      {
        navigation: { title: 'ordersTitle' },
        children: [
          { name: 'orders', navigation: { title: 'orders' } },
          { name: 'items', navigation: { title: 'items' } },
          { name: 'products', navigation: { title: 'products' } },
        ],
      },
    ]);
  });
  it('declares authenticated CRM and order pages with lazy components', async () => {
    expect(routes).toHaveLength(1);
    const flatten = (
      nodes: readonly AppClientRouteDefinition[],
    ): AppClientRouteDefinition[] =>
      nodes.flatMap((node) =>
        node.componentLoader ? [node] : flatten(node.children ?? []),
      );
    const pages = flatten(
      routes[0]!.routes as readonly AppClientRouteDefinition[],
    );

    expect(pages.map((page) => page.path).sort()).toEqual(
      [
        '/repository-example/sort',
        '/repository-example/select-combine',
        '/repository-example/relation-mutations',
        '/repository-example/find-many',
        '/repository-example/aggregate',
        '/repository-example/atomic',
        '/repository-example/crm',
        '/repository-example/orders',
        '/repository-example/crm/contacts',
        '/repository-example/orders/items',
        '/repository-example/orders/products',
        '/repository-example/crm/details/:recordId',
        '/repository-example/orders/details/:recordId',
        '/repository-example/crm/contacts/details/:recordId',
        '/repository-example/orders/items/details/:recordId',
        '/repository-example/orders/products/details/:recordId',
      ].sort(),
    );
    for (const page of pages) {
      expect(page.auth).toBe('required');
      expect((await page.componentLoader!()).default).toBeTypeOf('function');
    }
  });
});

import { describe, expect, it } from 'vitest';
import routes from '../client/routes.js';
describe('Repository pages', () => {
  it('declares authenticated CRM and order pages with lazy components', async () => {
    expect(routes).toHaveLength(1);
    const pages = routes[0]!.routes;
    expect(pages.map((page) => page.path)).toEqual([
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
    ]);
    for (const page of pages) {
      expect(page.auth).toBe('required');
      expect((await page.componentLoader!()).default).toBeTypeOf('function');
    }
  });
});
